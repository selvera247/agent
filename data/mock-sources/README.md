# Mock source schemas (MySQL / Snowflake / Databricks)

Create these tables/views in your test warehouse, load mock rows, then flip the
FinDataGraph connection to `mode=live` (Sources → **Configure**).

Required view names (adapters SELECT these by default):

- `findatagraph_commercial_v`
- `findatagraph_gl_v`

Entity codes used by the demo org: `US-EAST`, `US-WEST`, `EU-CORE`.

---

## MySQL (local Docker — recommended first)

```powershell
cd C:\Users\Selvera\agent
git pull
docker compose -f docker-compose.mock-sources.yml up -d
```

That starts MySQL 8 on `localhost:3306` with:

- database: `findatagraph_mock`
- user: `root` / password: `password`
- tables + views from `mysql_mock.sql` (includes a planted break)

### Point FinDataGraph at it

If FinDataGraph runs in Docker too, host is **`host.docker.internal`**:

1. Open **Sources** → MySQL row → **Configure**
2. Mode: **live**
3. Config JSON:

```json
{
  "host": "host.docker.internal",
  "port": 3306,
  "database": "findatagraph_mock",
  "user": "root",
  "password": "password"
}
```

4. **Save** → **Test** → **Sync** → **Runs** → trigger CRM↔GL

Optional: put FinDataGraph on the same Compose network and use hostname `mysql-mock` instead of `host.docker.internal`.

---

## Snowflake (cloud trial — ~15–30 min)

Cannot run a full Snowflake account on your laptop. Use a free trial:

1. Sign up at https://signup.snowflake.com (or your org sandbox).
2. In a worksheet, run `snowflake_mock.sql` (or create tables + views with the same columns).
3. Create a **programmatic access token (PAT)** for a user that can `USAGE` warehouse + `SELECT` the views.
4. Note: account locator (e.g. `xy12345.us-east-1`), warehouse, database, schema.

FinDataGraph config (or container `-e`):

```json
{
  "account": "xy12345.us-east-1",
  "database": "FINANCE",
  "schema": "MOCK",
  "warehouse": "COMPUTE_WH",
  "token": "<PAT>"
}
```

Env alternative: `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_TOKEN`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`.

Then Sources → Snowflake connection → **Configure** → mode **live** → Test → Sync.

Uses Snowflake **SQL API** over HTTPS (no native SDK / no VPN required for public accounts).

---

## Databricks (cloud workspace — ~15–30 min)

1. Create a Databricks workspace (Azure/AWS free trial, or company sandbox).
2. Start a **SQL warehouse**.
3. In SQL editor, run `databricks_mock.sql` (or equivalent CREATE TABLE + VIEW).
4. Create a personal access token (User Settings → Developer → Access tokens).

Config:

```json
{
  "host": "https://adb-xxxxxxxxxxxx.azuredatabricks.net",
  "warehouse_id": "<sql-warehouse-id>",
  "token": "<pat>"
}
```

Env alternative: `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, `DATABRICKS_WAREHOUSE_ID`.

Sources → Databricks → **Configure** → live → Test → Sync.

---

## What “success” looks like

| Step | Expect |
|---|---|
| Test | `ok` / `live` for that platform |
| Sync | commercial_count + gl_count &gt; 0 |
| Runs | CRM↔GL run completes; planted mismatches become Exceptions |

You do **not** need live Sources for Playwright regression — fixture mode covers that. Live DBs are for connection/integration confidence.
