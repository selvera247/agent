# How to scale this repo (ordered)

Implemented path from Week-1 Jumpstart → governed multi-agent cluster.

| # | Lever | Status | Where |
|---|---|---|---|
| 1 | Freeze Jumpstart kit | Done | `docs/JUMPSTART.md`, `GET /reports/jumpstart`, Spec Studio CRM↔GL |
| 2 | Definition → agent package | Done | `registry/agents/peak-close-crm-gl/` |
| 3 | Connectors before orchestration | Done | `GET/POST /connectors`, `registry/mcp/` |
| 4 | Audit → evidence | Done | `evidence` table, `GET /evidence` |
| 5 | Multi-agent cluster seam | Done | `POST /cluster/run` |
| 6 | Client-cloud delivery + Collections pack | Done | `docs/CLIENT_CLOUD_DELIVERY.md`, `registry/agents/collections-recommendation/` |
| 7 | Live Snowflake SoR connector | Done | `apps/api/src/connectors/snowflake.js`, `docs/LIVE_SNOWFLAKE.md` |
| 8 | Client registry + staging→prod CI | Done | `.github/workflows/ci-promote.yml`, `deploy/k8s/`, `docs/PROMOTE.md` |
| 9 | LangGraph cluster orchestrator | Done | `apps/orchestrator/` (FastAPI + LangGraph); `ORCHESTRATOR_URL` |
| 10 | Hybrid RAG investigate | Done | `apps/api/src/services/investigate.js`, `POST /investigate/*` |

Expand domains only after Jumpstart acceptance checklist is signed.
