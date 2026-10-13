import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db/connection.js";
import { id } from "../lib/ids.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(
  __dirname,
  "../../../../registry/mcp/snowflake.certified.read/fixtures"
);

/**
 * Client-tenancy Snowflake connector (EDW / data lake SoR for Jumpstart).
 *
 * Modes:
 * - live:    Snowflake SQL API against client account
 * - sandbox: warehouse-shaped fixture (CI / Jumpstart without secrets)
 * - stub:    freshness only (handled by connectors.js)
 *
 * Env (client secret store):
 *   SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PAT (or SNOWFLAKE_PASSWORD)
 *   SNOWFLAKE_WAREHOUSE, SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA, SNOWFLAKE_ROLE
 *   SNOWFLAKE_INVOICE_SQL, SNOWFLAKE_GL_SQL (optional overrides)
 */
export function snowflakeMode() {
  const live =
    process.env.CONNECTOR_LIVE === "1" || process.env.CONNECTOR_LIVE === "true";
  if (!live) return "stub";
  if (
    process.env.SNOWFLAKE_ACCOUNT &&
    process.env.SNOWFLAKE_USER &&
    (process.env.SNOWFLAKE_PAT || process.env.SNOWFLAKE_PASSWORD)
  ) {
    return "live";
  }
  return process.env.SNOWFLAKE_MODE === "live" ? "live" : "sandbox";
}

export function snowflakeConfigured() {
  return {
    mode: snowflakeMode(),
    account: process.env.SNOWFLAKE_ACCOUNT || null,
    database: process.env.SNOWFLAKE_DATABASE || null,
    schema: process.env.SNOWFLAKE_SCHEMA || null,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE || null,
    has_credentials: Boolean(
      process.env.SNOWFLAKE_PAT || process.env.SNOWFLAKE_PASSWORD
    ),
    tenancy_note:
      "Run in client VPC / Private Link; credentials from client secret store — no bulk extract off-tenant",
  };
}

function ensureSnowflakeSource(orgId) {
  const db = getDb();
  let src = db
    .prepare(
      `SELECT id FROM source_systems WHERE org_id = ? AND code = 'SNOWFLAKE' LIMIT 1`
    )
    .get(orgId);
  if (src) return src.id;
  const newId = id("src");
  db.prepare(
    `INSERT INTO source_systems (id, org_id, code, name, kind)
     VALUES (?, ?, 'SNOWFLAKE', 'Snowflake certified warehouse', 'billing')`
  ).run(newId, orgId);
  // kind CHECK may not include a warehouse kind — schema has erp/crm/billing/planning/processor/bank
  return newId;
}

function mapInvoiceRow(r) {
  return {
    source_record_id: String(r.SOURCE_ID || r.source_id || r.ID || r.id || ""),
    invoice_number: String(r.INVOICE_NUMBER || r.invoice_number || r.NAME || ""),
    customer_name: String(r.CUSTOMER_NAME || r.customer_name || "Unknown"),
    invoice_date: String(r.INVOICE_DATE || r.invoice_date || "").slice(0, 10),
    amount: Number(r.AMOUNT || r.amount || 0),
    currency: String(r.CURRENCY || r.currency || "USD"),
    entity_code: String(r.ENTITY_CODE || r.entity_code || "US-EAST"),
  };
}

function mapGlRow(r) {
  return {
    source_record_id: String(r.SOURCE_ID || r.source_id || r.ID || r.id || ""),
    reference: String(r.REFERENCE || r.reference || r.INVOICE_NUMBER || ""),
    account_code: String(r.ACCOUNT_CODE || r.account_code || "4000"),
    posting_date: String(r.POSTING_DATE || r.posting_date || "").slice(0, 10),
    amount: Number(r.AMOUNT || r.amount || 0),
    currency: String(r.CURRENCY || r.currency || "USD"),
    entity_code: String(r.ENTITY_CODE || r.entity_code || "US-EAST"),
  };
}

async function snowflakeSqlQuery(sql) {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const user = process.env.SNOWFLAKE_USER;
  const token = process.env.SNOWFLAKE_PAT || process.env.SNOWFLAKE_PASSWORD;
  const host = `${account.replace(/\.snowflakecomputing\.com$/i, "")}.snowflakecomputing.com`;
  const url = `https://${host}/api/v2/statements`;

  const body = {
    statement: sql,
    timeout: 60,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    role: process.env.SNOWFLAKE_ROLE || undefined,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Snowflake-Authorization-Token-Type": process.env.SNOWFLAKE_PAT
        ? "PROGRAMMATIC_ACCESS_TOKEN"
        : "KEYPAIR_JWT",
      ...(user ? { "X-Snowflake-User": user } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Snowflake SQL API ${res.status}: ${text.slice(0, 400)}`);
    err.status = 502;
    throw err;
  }

  const payload = await res.json();
  const cols = (payload.resultSetMetaData?.rowType || []).map((c) => c.name);
  const rows = (payload.data || []).map((arr) => {
    const obj = {};
    cols.forEach((name, i) => {
      obj[name] = arr[i];
    });
    return obj;
  });
  return rows;
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

async function fetchInvoices(mode) {
  if (mode === "live") {
    const sql =
      process.env.SNOWFLAKE_INVOICE_SQL ||
      `SELECT SOURCE_ID, INVOICE_NUMBER, CUSTOMER_NAME, INVOICE_DATE, AMOUNT, CURRENCY, ENTITY_CODE
       FROM CERTIFIED.CRM_INVOICES
       WHERE INVOICE_DATE >= DATEADD(month, -3, CURRENT_DATE())
       ORDER BY INVOICE_DATE DESC
       LIMIT 500`;
    const rows = await snowflakeSqlQuery(sql);
    return rows.map(mapInvoiceRow);
  }
  const fixture = loadFixture("invoices.live.json");
  return (fixture.rows || []).map(mapInvoiceRow);
}

async function fetchGl(mode) {
  if (mode === "live") {
    const sql =
      process.env.SNOWFLAKE_GL_SQL ||
      `SELECT SOURCE_ID, REFERENCE, ACCOUNT_CODE, POSTING_DATE, AMOUNT, CURRENCY, ENTITY_CODE
       FROM CERTIFIED.GL_REVENUE_LINES
       WHERE POSTING_DATE >= DATEADD(month, -3, CURRENT_DATE())
       ORDER BY POSTING_DATE DESC
       LIMIT 500`;
    const rows = await snowflakeSqlQuery(sql);
    return rows.map(mapGlRow);
  }
  const fixture = loadFixture("gl_revenue.live.json");
  return (fixture.rows || []).map(mapGlRow);
}

function entityMap(orgId) {
  const entities = getDb()
    .prepare(`SELECT id, code FROM entities WHERE org_id = ?`)
    .all(orgId);
  return {
    byCode: new Map(entities.map((e) => [e.code, e.id])),
    fallback: entities[0]?.id,
  };
}

/**
 * Pull CRM invoices from Snowflake certified tables into staging.
 */
export async function syncSnowflakeInvoices({ orgId }) {
  const mode = snowflakeMode();
  if (mode === "stub") {
    const err = new Error("Snowflake live sync requires CONNECTOR_LIVE=1");
    err.status = 400;
    throw err;
  }
  if (
    mode === "live" &&
    (!process.env.SNOWFLAKE_ACCOUNT ||
      !process.env.SNOWFLAKE_USER ||
      !(process.env.SNOWFLAKE_PAT || process.env.SNOWFLAKE_PASSWORD))
  ) {
    const err = new Error(
      "Live Snowflake requires SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, and SNOWFLAKE_PAT (or PASSWORD)"
    );
    err.status = 400;
    throw err;
  }

  const rows = await fetchInvoices(mode);
  const db = getDb();
  const sourceId = ensureSnowflakeSource(orgId);
  const { byCode, fallback } = entityMap(orgId);
  const citations = [];
  let staged = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      if (!row.invoice_number) continue;
      const entityId = byCode.get(row.entity_code) || fallback;
      if (!entityId) continue;
      const existing = db
        .prepare(
          `SELECT id FROM crm_invoices WHERE org_id = ? AND invoice_number = ?`
        )
        .get(orgId, row.invoice_number);
      if (existing) {
        db.prepare(
          `UPDATE crm_invoices
           SET customer_name = ?, invoice_date = ?, amount = ?, currency = ?,
               entity_id = ?, source_system_id = ?, ingested_at = datetime('now')
           WHERE id = ?`
        ).run(
          row.customer_name,
          row.invoice_date,
          row.amount,
          row.currency,
          entityId,
          sourceId,
          existing.id
        );
      } else {
        db.prepare(
          `INSERT INTO crm_invoices
            (id, org_id, entity_id, invoice_number, customer_name, invoice_date,
             amount, currency, source_system_id, ingested_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).run(
          id("crm"),
          orgId,
          entityId,
          row.invoice_number,
          row.customer_name,
          row.invoice_date,
          row.amount,
          row.currency,
          sourceId
        );
      }
      staged += 1;
      citations.push(
        `snowflake:${row.source_record_id || row.invoice_number}:${row.invoice_number}`
      );
    }
  });
  tx();

  return {
    mode,
    rows_read: rows.length,
    rows_staged: staged,
    freshness_at: new Date().toISOString(),
    source_citations: citations.slice(0, 50),
    system_of_record: "Snowflake",
  };
}

/**
 * Pull GL revenue lines from Snowflake certified tables into staging.
 */
export async function syncSnowflakeGl({ orgId }) {
  const mode = snowflakeMode();
  if (mode === "stub") {
    const err = new Error("Snowflake live sync requires CONNECTOR_LIVE=1");
    err.status = 400;
    throw err;
  }
  if (
    mode === "live" &&
    (!process.env.SNOWFLAKE_ACCOUNT ||
      !process.env.SNOWFLAKE_USER ||
      !(process.env.SNOWFLAKE_PAT || process.env.SNOWFLAKE_PASSWORD))
  ) {
    const err = new Error(
      "Live Snowflake requires SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, and SNOWFLAKE_PAT (or PASSWORD)"
    );
    err.status = 400;
    throw err;
  }

  const rows = await fetchGl(mode);
  const db = getDb();
  const sourceId = ensureSnowflakeSource(orgId);
  const { byCode, fallback } = entityMap(orgId);
  const citations = [];
  let staged = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      if (!row.reference) continue;
      const entityId = byCode.get(row.entity_code) || fallback;
      if (!entityId) continue;
      const existing = db
        .prepare(
          `SELECT id FROM gl_revenue_lines
           WHERE org_id = ? AND reference = ? AND account_code = ?`
        )
        .get(orgId, row.reference, row.account_code);
      if (existing) {
        db.prepare(
          `UPDATE gl_revenue_lines
           SET posting_date = ?, amount = ?, currency = ?, entity_id = ?,
               source_system_id = ?, ingested_at = datetime('now')
           WHERE id = ?`
        ).run(
          row.posting_date,
          row.amount,
          row.currency,
          entityId,
          sourceId,
          existing.id
        );
      } else {
        db.prepare(
          `INSERT INTO gl_revenue_lines
            (id, org_id, entity_id, reference, account_code, posting_date,
             amount, currency, source_system_id, ingested_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).run(
          id("gl"),
          orgId,
          entityId,
          row.reference,
          row.account_code,
          row.posting_date,
          row.amount,
          row.currency,
          sourceId
        );
      }
      staged += 1;
      citations.push(
        `snowflake:${row.source_record_id || row.reference}:${row.reference}`
      );
    }
  });
  tx();

  return {
    mode,
    rows_read: rows.length,
    rows_staged: staged,
    freshness_at: new Date().toISOString(),
    source_citations: citations.slice(0, 50),
    system_of_record: "Snowflake",
  };
}
