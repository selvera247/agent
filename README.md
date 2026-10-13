# FinDataGraph

**Financial data graph** for continuous close & reconciliation.

API-first control plane for **detect → investigate → resolve → report**.

**Spec Studio dual path** (post-login `/studio`, portfolio Launch demo target):

1. **Seeded** — open Meridian Retail CRM invoices ↔ GL revenue (`CRM_GL_REV`)
2. **User-entered** — describe a need (e.g. “reconcile CC auth, settlements, and what we received”) → generate agent package → implement → run

**Week-1 Jumpstart → scale path** (see [docs/JUMPSTART.md](docs/JUMPSTART.md), [docs/SCALE_PATH.md](docs/SCALE_PATH.md)):

1. Freeze kit — SIPOC + acceptance + diagnostic report (`/jumpstart`)
2. Practice library packages under `registry/agents/`
3. Connector stubs (`/connectors`) before orchestration
4. Evidence / Trust Cloud (`/evidence`) elevated from audit
5. Cluster run (`POST /api/v1/cluster/run`) detect → investigate → HITL resolve → report
6. Client-cloud delivery notes in [docs/CLIENT_CLOUD_DELIVERY.md](docs/CLIENT_CLOUD_DELIVERY.md)
7. Live Snowflake SoR connector ([docs/LIVE_SNOWFLAKE.md](docs/LIVE_SNOWFLAKE.md))
8. Promote path GHCR + K8s staging→prod ([docs/PROMOTE.md](docs/PROMOTE.md))
9. LangGraph orchestrator sidecar (`apps/orchestrator/`, `ORCHESTRATOR_URL`)
10. Hybrid RAG investigate (`POST /api/v1/investigate/*`)

The React app is one client; the HTTP API is the product.

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
├── registry/                # Practice library (agent packages + MCP stubs)
├── docs/                    # ARCHITECTURE, JUMPSTART, SCALE_PATH, delivery
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
| GET | `/specs/starting-points` | Dual-path chips (seeded + generate) |
| POST | `/specs/generate` | NL / chip → agent package |
| POST | `/specs/:id/implement` | Materialize definition (+ CC staging) |
| GET | `/specs/usage` | Demo credit meter |
| GET | `/reports/jumpstart` | Exception list + DQ scorecard + variance memo |
| GET | `/evidence` | Trust Cloud evidence (hash, citations, policy) |
| GET | `/connectors` | MCP/REST connector catalog + staging freshness |
| POST | `/connectors/:code/sync` | Stub sync (live mode client-tenancy only) |
| POST | `/cluster/run` | Jumpstart multi-step cluster envelope |
| GET | `/cluster` | Cluster run history |
| GET | `/registry/agents` | Practice library agent packages |
| POST | `/investigate/retrieve` | Hybrid structured + BM25 retrieval over staging |
| POST | `/investigate/run/:runId` | Investigate open exceptions for a recon run |

## LangGraph orchestrator

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r apps/orchestrator/requirements.txt
PYTHONPATH=apps/orchestrator/src ORCHESTRATOR_PORT=8100 \
  python -m findatagraph_orchestrator.server
# API:
ORCHESTRATOR_URL=http://127.0.0.1:8100 CONTROL_PLANE_URL=http://127.0.0.1:4000 npm run dev:api
```

## Promote (client registry)

See [docs/PROMOTE.md](docs/PROMOTE.md) and `.github/workflows/ci-promote.yml`.

## UI architecture

- **Auth gate** → JWT in `localStorage`, restored via `/auth/me`
- **Shell** → sidebar nav + role display
- **Pages:** Spec Studio · Jumpstart · Dashboard · Exceptions · Runs · Connectors · Evidence · Audit
- Default route after login: `/studio` (portfolio Launch demo uses `…/studio`)
- **Data access:** thin `api()` client; no server state library in MVP (swap in React Query later)

## Quick start

```bash
npm install
npm run db:seed -w @findatagraph/api
npm run dev:api          # :4000
npm run dev:web          # :5173 (proxies /api → API)
```

**Auth:** preferred IdPs are **Okta** or **Clerk** (`AUTH_MODE`); local demo login remains the Jumpstart default. See [docs/AUTH.md](docs/AUTH.md).

Demo logins when `AUTH_MODE=local` (password `password123`):

- `controller@findatagraph.demo`
- `accountant@findatagraph.demo` (US-EAST + US-WEST only)
- `admin@findatagraph.demo`

```bash
npm test -w @findatagraph/api
npm run build
```

## Hosted live demo

Single-host production mode (API serves the web build):

```bash
npm run start:prod
```

**Durable host:** see [`.github/workflows/deploy-render.md`](.github/workflows/deploy-render.md)  
(`Dockerfile` + `render.yaml` → https://render.com/deploy?repo=https://github.com/selvera247/agent)

**Portfolio wiring:** copy files from [`portfolio-integration/`](portfolio-integration/) into  
`selvera247/demo-interview--app` → route `/#/projects/findatagraph` with a **Launch demo** button.

Demo login: `controller@findatagraph.demo` / `password123`

## Scalability notes

- `org_id` on every business row → multi-tenant ready
- Matching isolated in `services/matching.js` → extract to worker/queue
- SQLite for zero-ops MVP → point `DATABASE_PATH` / swap driver to Postgres
- OIDC can replace local JWT without changing route contracts
