# FinDataGraph

**Financial data graph** for continuous close & reconciliation.

API-first control plane for **detect → investigate → resolve → report** on CRM invoice ↔ GL revenue breaks. The React app is one client; the HTTP API is the product.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
apps/web  ──JSON/JWT──►  apps/api  ──SQL──►  SQLite (Postgres-ready schema)
                              │
                         matching engine
                         audit log
                         RBAC
```

**Bounded contexts:** Identity · Master data · Reconciliation · Exceptions · Approvals · Audit

## File structure

```
findatagraph/
├── apps/
│   ├── api/                 # Headless Express API
│   │   ├── src/
│   │   │   ├── db/          # schema.sql, connection, seed
│   │   │   ├── routes/      # versioned HTTP handlers
│   │   │   ├── services/    # matching engine
│   │   │   ├── middleware/  # JWT auth + RBAC
│   │   │   └── lib/         # ids, audit writer
│   │   └── test/
│   └── web/                 # React controller UI
│       └── src/
│           ├── api/         # client + auth context
│           ├── components/
│           ├── pages/
│           └── styles/
├── packages/shared/         # roles, statuses, shared constants
├── docs/ARCHITECTURE.md
└── package.json             # npm workspaces
```

## Database schema (core)

| Table | Purpose |
|---|---|
| `organizations` | Tenant root (`org_id` on all business tables) |
| `users` | Roles: admin / controller / accountant + entity scope |
| `entities` | Legal entities |
| `source_systems` | CRM / ERP / billing |
| `crm_invoices` | Certified staging (left side) |
| `gl_revenue_lines` | Certified staging (right side) |
| `reconciliation_definitions` | Match config + tolerance + materiality |
| `reconciliation_runs` | Job history |
| `exceptions` | Open breaks + lifecycle |
| `corrections` | Proposed/approved adjustments (dual control ≥ $10k) |
| `audit_log` | Append-only evidence |

## API (`/api/v1`)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness |
| POST | `/auth/login` | Returns JWT |
| GET | `/auth/me` | Current user |
| GET | `/dashboard/summary` | KPIs + exposure |
| GET | `/entities` | Entity list (scoped) |
| GET | `/users` | Controllers/admins |
| GET | `/reconciliations` | Definitions |
| GET | `/reconciliations/runs` | Run history |
| GET | `/reconciliations/:id` | Definition + runs |
| POST | `/reconciliations/:id/runs` | Trigger match (controller+) |
| GET | `/exceptions` | `?status=` filter |
| GET | `/exceptions/:id` | Detail + corrections |
| POST | `/exceptions/:id/assign` | Assign owner |
| POST | `/exceptions/:id/resolve` | Close with note |
| POST | `/exceptions/:id/waive` | Controller waive |
| POST | `/exceptions/:id/corrections` | Propose correction |
| POST | `/exceptions/corrections/:id/decide` | Approve/reject |
| GET | `/audit` | Audit trail (controller+) |

## UI architecture

- **Auth gate** → JWT in `localStorage`, restored via `/auth/me`
- **Shell** → sidebar nav + role display
- **Pages:** Dashboard · Exceptions list/detail · Runs · Audit
- **Data access:** thin `api()` client; no server state library in MVP (swap in React Query later)

## Quick start

```bash
npm install
npm run db:seed -w @findatagraph/api
npm run dev:api          # :4000
npm run dev:web          # :5173 (proxies /api → API)
```

Demo logins (password `password123`):

- `controller@findatagraph.demo`
- `accountant@findatagraph.demo` (US-EAST + US-WEST only)
- `admin@findatagraph.demo`

```bash
npm test -w @findatagraph/api
npm run build
```

## Scalability notes

- `org_id` on every business row → multi-tenant ready
- Matching isolated in `services/matching.js` → extract to worker/queue
- SQLite for zero-ops MVP → point `DATABASE_PATH` / swap driver to Postgres
- OIDC can replace local JWT without changing route contracts
