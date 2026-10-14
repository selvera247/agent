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

Configure via **Sources → Configure** in the UI, or:

```http
PATCH /api/v1/sources/:id
{ "mode": "live", "config": { ... } }
```

Mock DDL + planted breaks: [`data/mock-sources/`](../data/mock-sources/).

### Live against your mock DBs

**MySQL locally (easiest):**

```powershell
docker compose -f docker-compose.mock-sources.yml up -d
```

See [`data/mock-sources/README.md`](../data/mock-sources/README.md) for Snowflake trial + Databricks workspace steps.

1. Apply platform SQL from `data/mock-sources/` and load rows (entity codes `US-EAST` / `US-WEST` / `EU-CORE`).
2. Flip that connection to **live** and set config:

| Platform | Config / env |
|---|---|
| **MySQL** | `host`, `port`, `database`, `user`, `password` (or `MYSQL_URL`). From Docker Desktop use `host.docker.internal`. |
| **Postgres** | Same shape, or `POSTGRES_URL`. |
| **Snowflake** | `account`, `database`, `schema`, `warehouse`, `token` — or env `SNOWFLAKE_ACCOUNT` + `SNOWFLAKE_TOKEN` (+ warehouse/db/schema). |
| **Databricks** | `host`, `warehouse_id`, `token` — or `DATABRICKS_HOST` / `DATABRICKS_TOKEN` / `DATABRICKS_WAREHOUSE_ID`. |

3. **Test** → **Sync** on Sources, then trigger CRM↔GL on **Runs**.
4. Docker example (MySQL on the Windows host):

```powershell
docker run --rm -p 4000:4000 -v findatagraph-data:/data `
  -e MYSQL_URL=mysql://root:password@host.docker.internal:3306/findatagraph_mock `
  --name findatagraph findatagraph
```

Then in UI: Sources → MySQL → Configure → mode `live` → paste host/user/password/database → Save → Test → Sync.

Snowflake/Databricks are HTTPS APIs — pass tokens as container env; no special host networking.

## API

| Method | Path |
|---|---|
| GET | `/api/v1/sources` |
| GET | `/api/v1/sources/:id` |
| PATCH | `/api/v1/sources/:id` |
| POST | `/api/v1/sources/:id/test` |
| POST | `/api/v1/sources/:id/sync` |
| GET | `/api/v1/sources/:id/syncs` |

Sync replaces staging for that source system’s org slice, then you run the existing reconciliation.

## Adding BigQuery / Fabric / Redshift

1. New file under `apps/api/src/connectors/` implementing the contract  
2. Register in `registry.js`  
3. Seed a `source_connections` row  
No UI or matcher changes required.
