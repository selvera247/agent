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

External adapters
  ERP / CRM / Billing ──MCP/REST stub──► Certified staging tables
  Identity (Okta/Entra) ──────► JWT / OIDC swap-in
  Practice library (`registry/`) ──► Agent packages + connector contracts
```

## Bounded contexts

| Context | Responsibility |
|---|---|
| Identity | Users, roles, JWT auth |
| Master data | Legal entities, source systems |
| Reconciliation | Definitions, runs, matching engine |
| Exceptions | Lifecycle, assignment, resolution |
| Approvals | Dual-control for material actions |
| Audit | Append-only event log |
| Evidence | Hashed Trust Cloud records + source citations |
| Connectors | MCP/REST catalog + stub/live sync |
| Jumpstart / Cluster | Diagnostic report + multi-step orchestration |
| Registry | Practice-library agent packages |

## Scalability path

| Concern | MVP | Next |
|---|---|---|
| Database | SQLite file | Postgres + connection pool |
| API | Single Node process | Horizontal replicas behind LB |
| Matching | In-process sync job | Worker queue (BullMQ / Temporal) |
| Auth | Local JWT + bcrypt | **Okta or Clerk** OIDC (JWKS); `AUTH_MODE` |
| Files / reports | JSON API | Object storage + PDF packs |
| Multi-tenant | Single org | `org_id` already on core tables |

## Security model

- Bearer JWT on all `/api/v1/*` except `/auth/login` and `/health`
- Roles: `admin`, `controller`, `accountant`
- Entity-scoped visibility for accountants
- Material waive/correct requires `controller` or `admin`
- Every mutation writes `audit_log`

## API versioning

All routes under `/api/v1`. Breaking changes → `/api/v2`.
