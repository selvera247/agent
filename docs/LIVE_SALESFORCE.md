# Live Salesforce connector (client tenancy)

Connector code: `salesforce.billing.read`  
Implementation: `apps/api/src/connectors/salesforce.js`  
MCP stub + fixture: `registry/mcp/salesforce.billing.read/`

## Modes

| Mode | When | Behavior |
|---|---|---|
| `stub` | `CONNECTOR_LIVE` unset | Freshness count only (no SoR call) |
| `sandbox` | `CONNECTOR_LIVE=1` without SF secrets | Pulls SoR-shaped fixture into `crm_invoices` (CI / Jumpstart) |
| `live` | `CONNECTOR_LIVE=1` + `SF_INSTANCE_URL` + `SF_ACCESS_TOKEN` | SOQL against client Salesforce org |

## Client setup

1. Create Connected App / Integration User in **client** Salesforce.
2. Store `SF_INSTANCE_URL` + `SF_ACCESS_TOKEN` (or refresh flow) in client secret store / K8s Secret `findatagraph-secrets`.
3. Optionally override `SF_INVOICE_SOQL` to match their Invoice object API names.
4. Set `CONNECTOR_LIVE=1` and `SF_MODE=live` in production ConfigMap.
5. Sync: `POST /api/v1/connectors/salesforce.billing.read/sync` — upserts certified staging; evidence citations include `salesforce:<Id>:<invoice>`.

Data never leaves the client `DATABASE_PATH` / PVC.
