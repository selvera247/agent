import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db/connection.js";
import { id } from "../lib/ids.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_FIXTURE = path.join(
  __dirname,
  "../../../../registry/mcp/salesforce.billing.read/fixtures/invoices.live.json"
);

/**
 * Client-tenancy Salesforce Billing connector.
 *
 * Modes (in client cloud):
 * - live:     SF_INSTANCE_URL + SF_ACCESS_TOKEN → REST SOQL against org
 * - sandbox:  fixture payload shaped like live SoR (CI / Jumpstart without secrets)
 * - stub:     no fetch (handled by connectors.js)
 */
export function salesforceMode() {
  const live =
    process.env.CONNECTOR_LIVE === "1" || process.env.CONNECTOR_LIVE === "true";
  if (!live) return "stub";
  if (process.env.SF_INSTANCE_URL && process.env.SF_ACCESS_TOKEN) return "live";
  return process.env.SF_MODE === "live" ? "live" : "sandbox";
}

export function salesforceConfigured() {
  const mode = salesforceMode();
  return {
    mode,
    instance_url: process.env.SF_INSTANCE_URL || null,
    has_token: Boolean(process.env.SF_ACCESS_TOKEN),
    tenancy_note:
      "Run inside client Salesforce Connected App / VPC; credentials from client secret store",
  };
}

async function fetchLiveInvoices() {
  const base = process.env.SF_INSTANCE_URL.replace(/\/$/, "");
  const token = process.env.SF_ACCESS_TOKEN;
  const soql = encodeURIComponent(
    process.env.SF_INVOICE_SOQL ||
      "SELECT Id, Name, Account.Name, Amount__c, Invoice_Date__c, Entity_Code__c, CurrencyIsoCode FROM Invoice__c WHERE Status__c = 'Posted' ORDER BY Invoice_Date__c DESC LIMIT 500"
  );
  const url = `${base}/services/data/v59.0/query?q=${soql}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Salesforce API ${res.status}: ${body.slice(0, 400)}`);
    err.status = 502;
    throw err;
  }
  const payload = await res.json();
  return (payload.records || []).map((r) => ({
    source_record_id: r.Id,
    invoice_number: r.Name,
    customer_name: r.Account?.Name || r.Account_Name__c || "Unknown",
    invoice_date: (r.Invoice_Date__c || "").slice(0, 10),
    amount: Number(r.Amount__c ?? r.TotalAmount ?? 0),
    currency: r.CurrencyIsoCode || "USD",
    entity_code: r.Entity_Code__c || "US-EAST",
  }));
}

function fetchSandboxInvoices() {
  const raw = JSON.parse(fs.readFileSync(SANDBOX_FIXTURE, "utf8"));
  return (raw.records || []).map((r) => ({
    source_record_id: r.Id,
    invoice_number: r.Name,
    customer_name: r.Account?.Name || "Unknown",
    invoice_date: (r.Invoice_Date__c || "").slice(0, 10),
    amount: Number(r.Amount__c ?? 0),
    currency: r.CurrencyIsoCode || "USD",
    entity_code: r.Entity_Code__c || "US-EAST",
  }));
}

/**
 * Pull invoices from Salesforce (live or sandbox fixture) into certified staging.
 * Upserts by invoice_number; data stays in the client DATABASE_PATH.
 */
export async function syncSalesforceBilling({ orgId }) {
  const mode = salesforceMode();
  if (mode === "stub") {
    const err = new Error("Salesforce live sync requires CONNECTOR_LIVE=1");
    err.status = 400;
    throw err;
  }
  if (
    mode === "live" &&
    (!process.env.SF_INSTANCE_URL || !process.env.SF_ACCESS_TOKEN)
  ) {
    const err = new Error(
      "Live Salesforce requires SF_INSTANCE_URL and SF_ACCESS_TOKEN in client secret store"
    );
    err.status = 400;
    throw err;
  }

  const rows =
    mode === "live" ? await fetchLiveInvoices() : fetchSandboxInvoices();
  const db = getDb();

  const source = db
    .prepare(
      `SELECT id FROM source_systems WHERE org_id = ? AND code = 'SFDC' LIMIT 1`
    )
    .get(orgId);
  if (!source) {
    const err = new Error("SFDC source_system missing for org");
    err.status = 500;
    throw err;
  }

  const entities = db
    .prepare(`SELECT id, code FROM entities WHERE org_id = ?`)
    .all(orgId);
  const entityByCode = new Map(entities.map((e) => [e.code, e.id]));
  const fallbackEntity = entities[0]?.id;

  let staged = 0;
  const citations = [];

  const tx = db.transaction(() => {
    for (const row of rows) {
      const entityId = entityByCode.get(row.entity_code) || fallbackEntity;
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
          source.id,
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
          source.id
        );
      }
      staged += 1;
      citations.push(`salesforce:${row.source_record_id}:${row.invoice_number}`);
    }
  });

  tx();

  return {
    mode,
    rows_read: rows.length,
    rows_staged: staged,
    freshness_at: new Date().toISOString(),
    source_citations: citations.slice(0, 50),
    system_of_record: "Salesforce",
  };
}
