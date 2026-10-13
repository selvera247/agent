import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db;

function tableColumns(database, table) {
  return database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function migrate(database) {
  const defCols = tableColumns(database, "reconciliation_definitions");
  if (!defCols.includes("match_kind")) {
    database.exec(
      `ALTER TABLE reconciliation_definitions ADD COLUMN match_kind TEXT NOT NULL DEFAULT 'crm_gl'`
    );
  }
  if (!defCols.includes("source")) {
    database.exec(
      `ALTER TABLE reconciliation_definitions ADD COLUMN source TEXT NOT NULL DEFAULT 'seeded'`
    );
  }
  if (!defCols.includes("spec_id")) {
    database.exec(
      `ALTER TABLE reconciliation_definitions ADD COLUMN spec_id TEXT`
    );
  }

  // Expand source_systems.kind CHECK when an older demo DB is present.
  const srcSql = database
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'source_systems'`
    )
    .get()?.sql;
  if (srcSql && !srcSql.includes("'processor'")) {
    database.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE source_systems_new (
        id            TEXT PRIMARY KEY,
        org_id        TEXT NOT NULL REFERENCES organizations(id),
        code          TEXT NOT NULL,
        name          TEXT NOT NULL,
        kind          TEXT NOT NULL CHECK (kind IN ('erp', 'crm', 'billing', 'planning', 'processor', 'bank')),
        UNIQUE (org_id, code)
      );
      INSERT INTO source_systems_new SELECT * FROM source_systems;
      DROP TABLE source_systems;
      ALTER TABLE source_systems_new RENAME TO source_systems;
      PRAGMA foreign_keys = ON;
    `);
  }

  // Jumpstart scale tables are CREATE IF NOT EXISTS in schema.sql;
  // re-exec is safe. No column backfills required beyond match_kind/source.
}

export function getDb() {
  if (db) return db;

  const dbPath =
    process.env.DATABASE_PATH ||
    path.join(__dirname, "../../data/findatagraph.db");

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
  migrate(db);

  return db;
}

export function resetDbConnection() {
  if (db) {
    db.close();
    db = undefined;
  }
}
