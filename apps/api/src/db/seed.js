import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb, resetDbConnection } from "./connection.js";
import { id } from "../lib/ids.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function defaultDbPath() {
  return (
    process.env.DATABASE_PATH ||
    path.join(__dirname, "../../data/findatagraph.db")
  );
}

/** Seed demo org/data. If `force`, wipe existing DB file first. */
export function seedDatabase({ force = false } = {}) {
  const dbPath = defaultDbPath();

  if (force && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    resetDbConnection();
  }

  const db = getDb();
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM users`).get();
  if (!force && existing.n > 0) {
    console.log("Database already seeded; skipping.");
    return { seeded: false };
  }

  const orgId = "org_fdg_demo";
  const usEast = "ent_us_east";
  const usWest = "ent_us_west";
  const eu = "ent_eu";

  const crm = "src_salesforce";
  const erp = "src_netsuite";

  const passwordHash = bcrypt.hashSync("password123", 10);

  db.exec("BEGIN");

  db.prepare(`INSERT INTO organizations (id, name) VALUES (?, ?)`).run(
    orgId,
    "Meridian Retail Co"
  );

  const users = [
    {
      id: "usr_admin",
      email: "admin@findatagraph.demo",
      name: "Avery Admin",
      role: "admin",
      entities: [],
    },
    {
      id: "usr_controller",
      email: "controller@findatagraph.demo",
      name: "Casey Controller",
      role: "controller",
      entities: [],
    },
    {
      id: "usr_accountant",
      email: "accountant@findatagraph.demo",
      name: "Riley Accountant",
      role: "accountant",
      entities: [usEast, usWest],
    },
  ];

  const insertUser = db.prepare(
    `INSERT INTO users (id, org_id, email, name, password_hash, role, entity_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const u of users) {
    insertUser.run(
      u.id,
      orgId,
      u.email,
      u.name,
      passwordHash,
      u.role,
      JSON.stringify(u.entities)
    );
  }

  const insertEntity = db.prepare(
    `INSERT INTO entities (id, org_id, code, name, currency) VALUES (?, ?, ?, ?, ?)`
  );
  insertEntity.run(usEast, orgId, "US-EAST", "US East Retail", "USD");
  insertEntity.run(usWest, orgId, "US-WEST", "US West Retail", "USD");
  insertEntity.run(eu, orgId, "EU-CORE", "EU Core", "EUR");

  const insertSrc = db.prepare(
    `INSERT INTO source_systems (id, org_id, code, name, kind) VALUES (?, ?, ?, ?, ?)`
  );
  insertSrc.run(crm, orgId, "SFDC", "Salesforce Billing", "crm");
  insertSrc.run(erp, orgId, "NS", "NetSuite ERP", "erp");

  const defId = "rec_crm_gl_revenue";
  db.prepare(
    `INSERT INTO reconciliation_definitions
      (id, org_id, code, name, description, left_system, right_system, tolerance_abs, materiality_abs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    defId,
    orgId,
    "CRM_GL_REV",
    "CRM invoices ↔ GL revenue",
    "Match CRM invoice numbers to GL revenue references for the period.",
    "crm",
    "gl",
    0.01,
    10000
  );

  const invoices = [
    { num: "INV-1001", ent: usEast, cust: "Acme Stores", amt: 125000, date: "2026-09-03" },
    { num: "INV-1002", ent: usEast, cust: "Northwind", amt: 48250.5, date: "2026-09-05" },
    { num: "INV-1003", ent: usWest, cust: "Contoso", amt: 91000, date: "2026-09-08" },
    { num: "INV-1004", ent: usWest, cust: "Fabrikam", amt: 15600, date: "2026-09-12" },
    { num: "INV-1005", ent: eu, cust: "Litware EU", amt: 72000, date: "2026-09-15" },
    { num: "INV-1006", ent: usEast, cust: "Adventure Works", amt: 33400, date: "2026-09-18" },
    { num: "INV-1007", ent: usWest, cust: "Tailspin Toys", amt: 18800, date: "2026-09-20" },
  ];

  const insertInv = db.prepare(
    `INSERT INTO crm_invoices
      (id, org_id, entity_id, invoice_number, customer_name, invoice_date, amount, currency, source_system_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const row of invoices) {
    insertInv.run(
      id("crm"),
      orgId,
      row.ent,
      row.num,
      row.cust,
      row.date,
      row.amt,
      row.ent === eu ? "EUR" : "USD",
      crm
    );
  }

  const gl = [
    { ref: "INV-1001", ent: usEast, amt: 125000, acct: "4000", date: "2026-09-04" },
    { ref: "INV-1002", ent: usEast, amt: 48000, acct: "4000", date: "2026-09-06" },
    { ref: "INV-1003", ent: usWest, amt: 91000, acct: "4000", date: "2026-09-09" },
    { ref: "INV-1004", ent: usWest, amt: 15600, acct: "4000", date: "2026-09-13" },
    { ref: "INV-1005", ent: usEast, amt: 72000, acct: "4000", date: "2026-09-16" },
    { ref: "INV-1006", ent: usEast, amt: 33400, acct: "4000", date: "2026-09-19" },
    { ref: "INV-1099", ent: usWest, amt: 5400, acct: "4000", date: "2026-09-22" },
  ];

  const insertGl = db.prepare(
    `INSERT INTO gl_revenue_lines
      (id, org_id, entity_id, reference, account_code, posting_date, amount, currency, source_system_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const row of gl) {
    insertGl.run(
      id("gl"),
      orgId,
      row.ent,
      row.ref,
      row.acct,
      row.date,
      row.amt,
      "USD",
      erp
    );
  }

  db.exec("COMMIT");

  console.log("Seeded FinDataGraph demo database.");
  console.log("Users (password: password123):");
  for (const u of users) {
    console.log(`  - ${u.email} (${u.role})`);
  }
  return { seeded: true };
}

const isCli = process.argv[1] && process.argv[1].endsWith("seed.js");
if (isCli) {
  seedDatabase({ force: true });
}
