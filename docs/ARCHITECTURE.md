# FinDataGraph — System Architecture

Headless, API-first **financial data graph** for continuous close & reconciliation.
The web app is one client; the API is the product surface.

## Goals (MVP)

- Detect reconciliation breaks between CRM invoices and GL revenue
- Investigate exceptions with full lineage fields
- Resolve via human-approved waive / correct actions
- Immutable audit trail suitable for controllership review

## High-level diagram

```
┌─────────────┐     HTTPS/JSON      ┌──────────────────┐
│  Web Client │ ──────────────────► │  FinDataGraph API  │
│  (React)    │ ◄────────────────── │  (Express, JWT)  │
└─────────────┘                     └────────┬─────────┘
                                             │
                                    ┌────────▼─────────┐
                                    │  SQLite (MVP)    │
                                    │  → Postgres later│
                                    └──────────────────┘

External sources (this round)
  Postgres / MySQL / Snowflake / Databricks ──SourceAdapter──► Certified staging
  (later: Oracle eBS / SAP SD on the same contract)
  Identity (Okta/Entra) ──────► JWT / OIDC swap-in
```

See [SOURCES.md](./SOURCES.md) for the connector contract.


## Bounded contexts

| Context | Responsibility |
|---|---|
| Identity | Users, roles, JWT auth |
| Master data | Legal entities, source systems |
| Reconciliation | Definitions, runs, matching engine |
| Exceptions | Lifecycle, assignment, resolution |
| Approvals | Dual-control for material actions |
| Audit | Append-only event log |

## Scalability path

| Concern | MVP | Next |
|---|---|---|
| Database | SQLite file | Postgres + connection pool |
| API | Single Node process | Horizontal replicas behind LB |
| Matching | In-process sync job | Worker queue (BullMQ / Temporal) |
| Auth | Local JWT + bcrypt | OIDC (Okta/Entra) |
| Files / reports | JSON API | Object storage + PDF packs |
| Multi-tenant | Single org | `org_id` already on core tables |

## Security model

- Bearer JWT on all `/api/v1/*` except `/auth/login` and `/health`
- Roles: `admin`, `controller`, `accountant`
- Entity-scoped visibility for accountants
- Material waive/correct requires `controller` or `admin`
- Every mutation writes `audit_log`

## MCP skill surface

```
Close Agent MCP (flux/commentary)     FinDataGraph Recon MCP (this repo)
         │                                      │
         └──────── shared governance ───────────┘
              cite IDs · human gate · planted evals
                           │
                           ▼
                  FinDataGraph HTTP API
                           │
              Postgres / MySQL / Snowflake / Databricks
```

Recon MCP tools wrap `/api/v1` only — see `apps/mcp/README.md`.

## API versioning

All routes under `/api/v1`. Breaking changes → `/api/v2`.
