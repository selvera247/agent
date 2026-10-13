# FinDataGraph Recon MCP (v1 complete)

MCP skill set for **reconciliation** on top of the FinDataGraph API.

## Skill split

| MCP | Package | Owns |
|---|---|---|
| **Recon** | `@findatagraph/mcp` (this) | Sources, runs, exceptions, corrections, audit |
| **Close Agent** | `@findatagraph/mcp-close` | Flux TB/variance/commentary + review queue |

## v1 tools

| Tool | Gate |
|---|---|
| `fdg_get_dashboard` | read |
| `fdg_list_sources` | read |
| `fdg_test_source` | read |
| `fdg_sync_source` | cite sync id |
| `fdg_list_reconciliations` | read |
| `fdg_run_reconciliation` | cite run id |
| `fdg_list_exceptions` | read + ids |
| `fdg_get_exception` | human gate if material |
| `fdg_propose_correction` | **always** HITL |
| `fdg_decide_correction` | controller HITL |
| `fdg_assign_exception` | cite assignee |
| `fdg_list_users` | read |
| `fdg_resolve_exception` | `controller_confirmed` |
| `fdg_waive_exception` | `controller_confirmed` |
| `fdg_get_audit_trail` | read |

## Run

```bash
npm run db:seed -w @findatagraph/api
npm run dev:api
npm start -w @findatagraph/mcp
npm run eval -w @findatagraph/mcp   # expect 4/4
```
