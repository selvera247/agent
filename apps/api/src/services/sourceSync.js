import { AUDIT_ACTIONS, SYNC_STATUS } from "@findatagraph/shared";
import { getDb } from "../db/connection.js";
import { id } from "../lib/ids.js";
import { writeAudit } from "../lib/audit.js";
import { createAdapter } from "../connectors/registry.js";

function entityMap(orgId) {
  const rows = getDb()
    .prepare(`SELECT id, code FROM entities WHERE org_id = ?`)
    .all(orgId);
  return new Map(rows.map((r) => [r.code, r.id]));
}

function resolveSourceSystem(orgId, connection, side) {
  if (connection.source_system_id) return connection.source_system_id;

  const code = side === "commercial" ? "SFDC" : "NS";
  const row = getDb()
    .prepare(`SELECT id FROM source_systems WHERE org_id = ? AND code = ?`)
    .get(orgId, code);
  return row?.id;
}

/**
 * Pull from a platform adapter into certified staging tables.
 * role_in_recon: commercial | gl | both
 */
export async function syncSourceConnection({ connectionId, orgId, userId }) {
  const db = getDb();
  const connection = db
    .prepare(`SELECT * FROM source_connections WHERE id = ? AND org_id = ? AND enabled = 1`)
    .get(connectionId, orgId);

  if (!connection) {
    const err = new Error("Source connection not found");
    err.status = 404;
    throw err;
  }

  const syncId = id("ssync");
  const startedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO source_syncs
      (id, org_id, connection_id, status, started_at, triggered_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(syncId, orgId, connectionId, SYNC_STATUS.RUNNING, startedAt, userId);

  writeAudit({
    orgId,
    actorId: userId,
    action: AUDIT_ACTIONS.SOURCE_SYNC_STARTED,
    resourceType: "source_connection",
    resourceId: connectionId,
    payload: { sync_id: syncId, platform: connection.platform },
  });

  try {
    const adapter = createAdapter(connection);
    const entities = entityMap(orgId);
    let commercialCount = 0;
    let glCount = 0;

    const pullCommercial =
      connection.role_in_recon === "commercial" || connection.role_in_recon === "both";
    const pullGl = connection.role_in_recon === "gl" || connection.role_in_recon === "both";

    let commercial = [];
    let glLines = [];
    if (pullCommercial) commercial = await adapter.pullCommercial();
    if (pullGl) glLines = await adapter.pullGlLines();

    const apply = db.transaction(() => {
      if (pullCommercial) {
        const crmSys = resolveSourceSystem(orgId, connection, "commercial");
        db.prepare(`DELETE FROM crm_invoices WHERE org_id = ?`).run(orgId);
        const ins = db.prepare(
          `INSERT INTO crm_invoices
            (id, org_id, entity_id, invoice_number, customer_name, invoice_date, amount, currency, source_system_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const row of commercial) {
          const entityId = entities.get(row.entity_code);
          if (!entityId) continue;
          ins.run(
            row.external_id || id("crm"),
            orgId,
            entityId,
            row.document_number,
            row.counterparty,
            row.document_date,
            Number(row.amount),
            row.currency || "USD",
            crmSys
          );
          commercialCount += 1;
        }
      }

      if (pullGl) {
        const glSys = resolveSourceSystem(orgId, connection, "gl");
        db.prepare(`DELETE FROM gl_revenue_lines WHERE org_id = ?`).run(orgId);
        const ins = db.prepare(
          `INSERT INTO gl_revenue_lines
            (id, org_id, entity_id, reference, account_code, posting_date, amount, currency, source_system_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const row of glLines) {
          const entityId = entities.get(row.entity_code);
          if (!entityId) continue;
          ins.run(
            row.external_id || id("gl"),
            orgId,
            entityId,
            row.reference,
            row.account_code,
            row.posting_date,
            Number(row.amount),
            row.currency || "USD",
            glSys
          );
          glCount += 1;
        }
      }

      db.prepare(
        `UPDATE source_connections
         SET last_sync_at = ?, last_sync_status = ?
         WHERE id = ?`
      ).run(new Date().toISOString(), SYNC_STATUS.COMPLETED, connectionId);

      db.prepare(
        `UPDATE source_syncs
         SET status = ?, commercial_count = ?, gl_count = ?, completed_at = ?
         WHERE id = ?`
      ).run(
        SYNC_STATUS.COMPLETED,
        commercialCount,
        glCount,
        new Date().toISOString(),
        syncId
      );
    });

    apply();

    writeAudit({
      orgId,
      actorId: userId,
      action: AUDIT_ACTIONS.SOURCE_SYNC_COMPLETED,
      resourceType: "source_sync",
      resourceId: syncId,
      payload: { commercial_count: commercialCount, gl_count: glCount },
    });

    return db.prepare(`SELECT * FROM source_syncs WHERE id = ?`).get(syncId);
  } catch (error) {
    db.prepare(
      `UPDATE source_syncs
       SET status = ?, error_message = ?, completed_at = ?
       WHERE id = ?`
    ).run(SYNC_STATUS.FAILED, String(error.message), new Date().toISOString(), syncId);

    db.prepare(
      `UPDATE source_connections SET last_sync_status = ? WHERE id = ?`
    ).run(SYNC_STATUS.FAILED, connectionId);

    writeAudit({
      orgId,
      actorId: userId,
      action: AUDIT_ACTIONS.SOURCE_SYNC_FAILED,
      resourceType: "source_sync",
      resourceId: syncId,
      payload: { error: String(error.message) },
    });

    throw error;
  }
}
