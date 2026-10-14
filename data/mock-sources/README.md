# Mock source schemas (MySQL / Snowflake / Databricks)

Create these views (or tables with the same column names) in your test DB,
load mock rows, then flip the FinDataGraph connection to `mode=live`.

Canonical columns must match what adapters SELECT by default
(see `apps/api/src/connectors/*.js` and [docs/SOURCES.md](../../docs/SOURCES.md)).

Entity codes used by the demo org: `US-EAST`, `US-WEST`, `EU-CORE`.

## Quick path

1. Apply the SQL for your platform under this folder.
2. Insert a few commercial + GL rows (plant at least one intentional break).
3. Point FinDataGraph at it (UI **Configure** on Sources, or `PATCH /api/v1/sources/:id`).
4. **Test** → **Sync** → run CRM↔GL recon on **Runs**.
