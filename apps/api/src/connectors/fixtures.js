/**
 * Platform-tagged synthetic extracts for fixture mode / CI.
 * Shapes match what live SQL views should return from each warehouse.
 */

const BASE_COMMERCIAL = [
  { document_number: "INV-1001", entity_code: "US-EAST", counterparty: "Acme Stores", document_date: "2026-09-03", amount: 125000, currency: "USD" },
  { document_number: "INV-1002", entity_code: "US-EAST", counterparty: "Northwind", document_date: "2026-09-05", amount: 48250.5, currency: "USD" },
  { document_number: "INV-1003", entity_code: "US-WEST", counterparty: "Contoso", document_date: "2026-09-08", amount: 91000, currency: "USD" },
  { document_number: "INV-1004", entity_code: "US-WEST", counterparty: "Fabrikam", document_date: "2026-09-12", amount: 15600, currency: "USD" },
  { document_number: "INV-1005", entity_code: "EU-CORE", counterparty: "Litware EU", document_date: "2026-09-15", amount: 72000, currency: "EUR" },
  { document_number: "INV-1006", entity_code: "US-EAST", counterparty: "Adventure Works", document_date: "2026-09-18", amount: 33400, currency: "USD" },
  { document_number: "INV-1007", entity_code: "US-WEST", counterparty: "Tailspin Toys", document_date: "2026-09-20", amount: 18800, currency: "USD" },
];

const BASE_GL = [
  { reference: "INV-1001", entity_code: "US-EAST", account_code: "4000", posting_date: "2026-09-04", amount: 125000, currency: "USD" },
  { reference: "INV-1002", entity_code: "US-EAST", account_code: "4000", posting_date: "2026-09-06", amount: 48000, currency: "USD" },
  { reference: "INV-1003", entity_code: "US-WEST", account_code: "4000", posting_date: "2026-09-09", amount: 91000, currency: "USD" },
  { reference: "INV-1004", entity_code: "US-WEST", account_code: "4000", posting_date: "2026-09-13", amount: 15600, currency: "USD" },
  { reference: "INV-1005", entity_code: "US-EAST", account_code: "4000", posting_date: "2026-09-16", amount: 72000, currency: "USD" },
  { reference: "INV-1006", entity_code: "US-EAST", account_code: "4000", posting_date: "2026-09-19", amount: 33400, currency: "USD" },
  { reference: "INV-1099", entity_code: "US-WEST", account_code: "4000", posting_date: "2026-09-22", amount: 5400, currency: "USD" },
];

export function fixtureCommercial(platform) {
  return BASE_COMMERCIAL.map((row) => ({
    external_id: `${platform}-crm-${row.document_number}`,
    ...row,
    source_platform: platform,
  }));
}

export function fixtureGl(platform) {
  return BASE_GL.map((row) => ({
    external_id: `${platform}-gl-${row.reference}-${row.account_code}`,
    ...row,
    source_platform: platform,
  }));
}
