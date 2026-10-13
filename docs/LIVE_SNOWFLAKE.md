# Live Snowflake connector (client tenancy)

Primary Jumpstart SoR path: certified finance tables in the **client’s Snowflake** account (EDW / data lake), not Salesforce extracts and not a CrossCountry-hosted copy.

| Connector | Staging | Implementation |
|---|---|---|
| `snowflake.invoices.read` | `crm_invoices` | `apps/api/src/connectors/snowflake.js` |
| `snowflake.gl_revenue.read` | `gl_revenue_lines` | same |

MCP pack: `registry/mcp/snowflake.certified.read/`

## Modes

| Mode | When | Behavior |
|---|---|---|
| `stub` | `CONNECTOR_LIVE` unset | Freshness count only |
| `sandbox` | `CONNECTOR_LIVE=1` without Snowflake secrets | Pulls warehouse-shaped fixtures into staging (CI / Jumpstart) |
| `live` | `CONNECTOR_LIVE=1` + account/user/token | Snowflake SQL API against client account |

## Client setup

1. Grant a least-privilege role on certified views/tables (e.g. `FINANCE.CERTIFIED.CRM_INVOICES`, `GL_REVENUE_LINES`).
2. Prefer Private Link / network policy; store secrets in the **client** secret store / K8s `findatagraph-secrets`:
   - `SNOWFLAKE_ACCOUNT`
   - `SNOWFLAKE_USER`
   - `SNOWFLAKE_PAT` (programmatic access token) or `SNOWFLAKE_PASSWORD`
   - `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`
   - optional `SNOWFLAKE_ROLE`, `SNOWFLAKE_INVOICE_SQL`, `SNOWFLAKE_GL_SQL`
3. Set `CONNECTOR_LIVE=1` and `SNOWFLAKE_MODE=live` in production ConfigMap (staging can use `sandbox`).
4. Sync:
   - `POST /api/v1/connectors/snowflake.invoices.read/sync`
   - `POST /api/v1/connectors/snowflake.gl_revenue.read/sync`
5. Evidence citations include `snowflake:<source_id>:<reference>`.

Data stays on the client `DATABASE_PATH` / PVC — connectors configure reads; they do not ship bulk copies off-tenant.

## Default live SQL (overridable)

```sql
-- invoices
SELECT SOURCE_ID, INVOICE_NUMBER, CUSTOMER_NAME, INVOICE_DATE, AMOUNT, CURRENCY, ENTITY_CODE
FROM CERTIFIED.CRM_INVOICES
WHERE INVOICE_DATE >= DATEADD(month, -3, CURRENT_DATE())
ORDER BY INVOICE_DATE DESC LIMIT 500;

-- gl
SELECT SOURCE_ID, REFERENCE, ACCOUNT_CODE, POSTING_DATE, AMOUNT, CURRENCY, ENTITY_CODE
FROM CERTIFIED.GL_REVENUE_LINES
WHERE POSTING_DATE >= DATEADD(month, -3, CURRENT_DATE())
ORDER BY POSTING_DATE DESC LIMIT 500;
```
