-- FinDataGraph schema (SQLite MVP; portable to Postgres with minor type swaps)
-- org_id reserved for multi-tenant scale-out

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'controller', 'accountant')),
  entity_ids    TEXT NOT NULL DEFAULT '[]', -- JSON array of entity ids (accountant scope)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entities (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  UNIQUE (org_id, code)
);

CREATE TABLE IF NOT EXISTS source_systems (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('erp', 'crm', 'billing', 'planning')),
  UNIQUE (org_id, code)
);

-- Certified staging: CRM invoices
CREATE TABLE IF NOT EXISTS crm_invoices (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  entity_id     TEXT NOT NULL REFERENCES entities(id),
  invoice_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  invoice_date  TEXT NOT NULL,
  amount        REAL NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  source_system_id TEXT NOT NULL REFERENCES source_systems(id),
  ingested_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, invoice_number)
);

-- Certified staging: GL revenue lines
CREATE TABLE IF NOT EXISTS gl_revenue_lines (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  entity_id     TEXT NOT NULL REFERENCES entities(id),
  reference     TEXT NOT NULL,          -- should match invoice_number when clean
  account_code  TEXT NOT NULL,
  posting_date  TEXT NOT NULL,
  amount        REAL NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  source_system_id TEXT NOT NULL REFERENCES source_systems(id),
  ingested_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, reference, account_code)
);

CREATE TABLE IF NOT EXISTS reconciliation_definitions (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  left_system   TEXT NOT NULL,  -- e.g. crm
  right_system  TEXT NOT NULL,  -- e.g. gl
  tolerance_abs REAL NOT NULL DEFAULT 0.01,
  materiality_abs REAL NOT NULL DEFAULT 10000,
  active        INTEGER NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  definition_id TEXT NOT NULL REFERENCES reconciliation_definitions(id),
  status        TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  started_at    TEXT,
  completed_at  TEXT,
  triggered_by  TEXT REFERENCES users(id),
  matched_count INTEGER NOT NULL DEFAULT 0,
  exception_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS exceptions (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  run_id        TEXT NOT NULL REFERENCES reconciliation_runs(id),
  definition_id TEXT NOT NULL REFERENCES reconciliation_definitions(id),
  entity_id     TEXT NOT NULL REFERENCES entities(id),
  exception_type TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('open', 'assigned', 'pending_approval', 'resolved', 'waived')),
  reference     TEXT NOT NULL,
  left_amount   REAL,
  right_amount  REAL,
  variance      REAL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  title         TEXT NOT NULL,
  details       TEXT NOT NULL DEFAULT '{}', -- JSON
  assignee_id   TEXT REFERENCES users(id),
  resolved_by   TEXT REFERENCES users(id),
  resolution_note TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exceptions_org_status ON exceptions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_exceptions_entity ON exceptions(entity_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_run ON exceptions(run_id);

CREATE TABLE IF NOT EXISTS corrections (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  exception_id  TEXT NOT NULL REFERENCES exceptions(id),
  proposed_by   TEXT NOT NULL REFERENCES users(id),
  approved_by   TEXT REFERENCES users(id),
  status        TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected')),
  correction_type TEXT NOT NULL CHECK (correction_type IN ('reclass', 'adjustment', 'timing')),
  amount        REAL NOT NULL,
  note          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at    TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  actor_id      TEXT REFERENCES users(id),
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  payload       TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_log(org_id, created_at DESC);
