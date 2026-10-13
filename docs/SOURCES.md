# Multi-platform source connectors

This round connects FinDataGraph to **warehouse / SQL platforms** first
(Postgres, MySQL, Databricks, Snowflake — same pattern for BigQuery/Fabric later).
ERP adapters (eBS / SAP) plug in later on the same certified schemas.

## Architecture

```
Postgres / MySQL / Snowflake / Databricks / …
        │  SourceAdapter.pull()
        ▼
  Canonical rows
  (commercial_documents, gl_lines)
        │  sourceSync
        ▼
  Certified staging (SQLite/Postgres ops DB)
        │  existing matcher
        ▼
  Exceptions → HITL → audit
```

**Rule:** Controllers never query source platforms directly.
Adapters pull into certified staging; matching and UI stay unchanged.

## Adapter contract

Each platform implements:

| Method | Purpose |
|---|---|
| `testConnection()` | Health / credentials |
| `pullCommercial({ since })` | Invoices / billing docs |
| `pullGlLines({ since })` | GL revenue (or control) lines |
| `dialect` | `postgres` \| `mysql` \| `snowflake` \| `databricks` \| … |

Canonical commercial row:

```json
{
  "external_id": "INV-1001",
  "entity_code": "US-EAST",
  "document_number": "INV-1001",
  "counterparty": "Acme Stores",
  "document_date": "2026-09-03",
  "amount": 125000,
  "currency": "USD"
}
```

Canonical GL row:

```json
{
  "external_id": "gl-INV-1001",
  "entity_code": "US-EAST",
  "reference": "INV-1001",
  "account_code": "4000",
  "posting_date": "2026-09-04",
  "amount": 125000,
  "currency": "USD"
}
```

## Connection modes

| Mode | Use |
|---|---|
| `fixture` | Demo / CI — no external creds; platform-tagged synthetic pulls |
| `live` | Real `pg` / `mysql2` / Snowflake SQL API / Databricks SQL Statement API |

Configure via `source_connections.config` JSON (see seed) or env overlays.

## API

| Method | Path |
|---|---|
| GET | `/api/v1/sources` |
| GET | `/api/v1/sources/:id` |
| POST | `/api/v1/sources/:id/test` |
| POST | `/api/v1/sources/:id/sync` |
| GET | `/api/v1/sources/:id/syncs` |

Sync replaces staging for that source system’s org slice, then you run the existing reconciliation.

## Adding BigQuery / Fabric / Redshift

1. New file under `apps/api/src/connectors/` implementing the contract  
2. Register in `registry.js`  
3. Seed a `source_connections` row  
No UI or matcher changes required.
