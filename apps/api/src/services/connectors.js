import { AUDIT_ACTIONS } from "@findatagraph/shared";
import { getDb } from "../db/connection.js";
import { id } from "../lib/ids.js";
import { writeAudit } from "../lib/audit.js";
import { recordUsage } from "../lib/usage.js";
import {
  salesforceConfigured,
  salesforceMode,
  syncSalesforceBilling,
} from "../connectors/salesforce.js";

/**
 * MCP / REST connector catalog for client systems of record.
 * Live mode pulls into certified staging inside client tenancy.
 */
export const CONNECTOR_CATALOG = [
  {
    code: "salesforce.billing.read",
    name: "Salesforce Billing (CRM invoices)",
    kind: "crm",
    protocol: "mcp",
    mcp_uri: "mcp://open-finance/salesforce.billing.read@1",
    staging_table: "crm_invoices",
    source_system_code: "SFDC",
    live_capable: true,
  },
  {
    code: "netsuite.gl.read",
    name: "NetSuite GL revenue",
    kind: "erp",
    protocol: "mcp",
    mcp_uri: "mcp://open-finance/netsuite.gl.read@1",
    staging_table: "gl_revenue_lines",
    source_system_code: "NS",
    live_capable: false,
  },
  {
    code: "processor.auth.read",
    name: "Card processor auths",
    kind: "processor",
    protocol: "rest",
    mcp_uri: null,
    staging_table: "cc_auths",
    source_system_code: "ADYEN",
    live_capable: false,
  },
  {
    code: "processor.settle.read",
    name: "Card processor settlements",
    kind: "processor",
    protocol: "rest",
    mcp_uri: null,
    staging_table: "cc_settlements",
    source_system_code: "ADYEN",
    live_capable: false,
  },
  {
    code: "bank.deposit.read",
    name: "Bank deposits received",
    kind: "bank",
    protocol: "rest",
    mcp_uri: null,
    staging_table: "cc_receipts",
    source_system_code: "BANK",
    live_capable: false,
  },
];

const STAGING_COUNT_SQL = {
  crm_invoices:
    "SELECT COUNT(*) AS n, MAX(ingested_at) AS freshness FROM crm_invoices WHERE org_id = ?",
  gl_revenue_lines:
    "SELECT COUNT(*) AS n, MAX(ingested_at) AS freshness FROM gl_revenue_lines WHERE org_id = ?",
  cc_auths:
    "SELECT COUNT(*) AS n, MAX(ingested_at) AS freshness FROM cc_auths WHERE org_id = ?",
  cc_settlements:
    "SELECT COUNT(*) AS n, MAX(ingested_at) AS freshness FROM cc_settlements WHERE org_id = ?",
  cc_receipts:
    "SELECT COUNT(*) AS n, MAX(ingested_at) AS freshness FROM cc_receipts WHERE org_id = ?",
};

function liveFlag() {
  return process.env.CONNECTOR_LIVE === "1" || process.env.CONNECTOR_LIVE === "true";
}

export function listConnectors(orgId) {
  const db = getDb();
  const sf = salesforceConfigured();
  return CONNECTOR_CATALOG.map((c) => {
    const sql = STAGING_COUNT_SQL[c.staging_table];
    const stats = sql ? db.prepare(sql).get(orgId) : { n: 0, freshness: null };
    const lastSync = db
      .prepare(
        `SELECT * FROM connector_syncs
         WHERE org_id = ? AND connector_code = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(orgId, c.code);

    return {
      ...c,
      live_enabled: liveFlag(),
      salesforce:
        c.code === "salesforce.billing.read"
          ? { mode: sf.mode, instance_url: sf.instance_url, has_token: sf.has_token }
          : undefined,
      staging_rows: stats?.n ?? 0,
      staging_freshness_at: stats?.freshness ?? null,
      last_sync: lastSync
        ? {
            id: lastSync.id,
            status: lastSync.status,
            mode: lastSync.mode,
            rows_read: lastSync.rows_read,
            rows_staged: lastSync.rows_staged,
            completed_at: lastSync.completed_at,
          }
        : null,
    };
  });
}

/**
 * Sync connector into certified staging.
 * - stub: freshness only
 * - sandbox/live (Salesforce): pull SoR → upsert staging in client DB
 */
export async function syncConnector({ orgId, userId, connectorCode }) {
  const connector = CONNECTOR_CATALOG.find((c) => c.code === connectorCode);
  if (!connector) {
    const err = new Error(`Unknown connector: ${connectorCode}`);
    err.status = 404;
    throw err;
  }

  const db = getDb();
  const syncId = id("csync");
  const startedAt = new Date().toISOString();

  let mode = "stub";
  if (connectorCode === "salesforce.billing.read" && liveFlag()) {
    mode = salesforceMode();
  } else if (liveFlag() && connector.live_capable === false) {
    const err = new Error(
      `Live mode not yet wired for ${connectorCode}; use stub or Salesforce sandbox/live`
    );
    err.status = 501;
    throw err;
  }

  db.prepare(
    `INSERT INTO connector_syncs
      (id, org_id, connector_code, status, mode, triggered_by, started_at)
     VALUES (?, ?, ?, 'running', ?, ?, ?)`
  ).run(syncId, orgId, connectorCode, mode, userId, startedAt);

  try {
    let rowsRead = 0;
    let rowsStaged = 0;
    let freshness = startedAt;
    let citations = [
      `connector:${connectorCode}`,
      `staging:${connector.staging_table}`,
    ];

    if (connectorCode === "salesforce.billing.read" && mode !== "stub") {
      const result = await syncSalesforceBilling({ orgId });
      rowsRead = result.rows_read;
      rowsStaged = result.rows_staged;
      freshness = result.freshness_at;
      citations = [
        ...citations,
        `system_of_record:${result.system_of_record}`,
        `mode:${result.mode}`,
        ...result.source_citations,
      ];
    } else {
      const sql = STAGING_COUNT_SQL[connector.staging_table];
      const stats = sql
        ? db.prepare(sql).get(orgId)
        : { n: 0, freshness: null };
      rowsRead = stats?.n ?? 0;
      rowsStaged = rowsRead;
      freshness = stats?.freshness || startedAt;
      if (connector.source_system_code) {
        citations.push(`source_system:${connector.source_system_code}`);
      }
    }

    const completedAt = new Date().toISOString();
    const { evidenceId } = writeAudit({
      orgId,
      actorId: userId,
      action: AUDIT_ACTIONS.CONNECTOR_SYNCED,
      resourceType: "connector_sync",
      resourceId: syncId,
      payload: {
        connector_code: connectorCode,
        mode,
        rows_read: rowsRead,
        rows_staged: rowsStaged,
        staging_table: connector.staging_table,
        mcp_uri: connector.mcp_uri,
      },
      sourceCitations: citations.filter(Boolean).slice(0, 40),
    });

    db.prepare(
      `UPDATE connector_syncs
       SET status = 'completed', rows_read = ?, rows_staged = ?,
           freshness_at = ?, evidence_id = ?, completed_at = ?
       WHERE id = ?`
    ).run(rowsRead, rowsStaged, freshness, evidenceId, completedAt, syncId);

    recordUsage({
      orgId,
      actorId: userId,
      action: "connector.sync",
      resourceType: "connector_sync",
      resourceId: syncId,
    });

    return db.prepare(`SELECT * FROM connector_syncs WHERE id = ?`).get(syncId);
  } catch (error) {
    db.prepare(
      `UPDATE connector_syncs
       SET status = 'failed', error_message = ?, completed_at = ?
       WHERE id = ?`
    ).run(String(error.message), new Date().toISOString(), syncId);
    throw error;
  }
}
