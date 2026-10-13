# FinDataGraph Recon MCP

MCP skill set for **reconciliation** on top of the FinDataGraph API — not a parallel data path.

## Skill split (North Star alignment)

| MCP | Owns |
|---|---|
| **Close Agent** (portfolio `finance-close-agent`) | Flux / commentary over GL, review queue, citation of JEs |
| **FinDataGraph Recon** (this package) | Sources sync, reconciliation runs, exceptions, corrections, audit |

Shared governance: **cite IDs**, **human gate** on material/status changes, **planted-break evals**.

## Tools

| Tool | API | Gate |
|---|---|---|
| `fdg_get_dashboard` | `GET /dashboard/summary` | read |
| `fdg_list_sources` | `GET /sources` | read |
| `fdg_sync_source` | `POST /sources/:id/sync` | cite sync id |
| `fdg_list_reconciliations` | `GET /reconciliations` | read |
| `fdg_run_reconciliation` | `POST /reconciliations/:id/runs` | cite run id |
| `fdg_list_exceptions` | `GET /exceptions` | read + ids |
| `fdg_get_exception` | `GET /exceptions/:id` | human gate if material |
| `fdg_propose_correction` | `POST .../corrections` | **always** human gate |
| `fdg_resolve_exception` | `POST .../resolve` | requires `controller_confirmed=true` |
| `fdg_get_audit_trail` | `GET /audit` | read |

## Run locally

```bash
# terminal 1
npm run db:seed -w @findatagraph/api
npm run dev:api

# terminal 2 — MCP stdio (Claude Desktop / Cursor)
npm start -w @findatagraph/mcp
```

Env (optional):

```bash
FINDATAGRAPH_API_URL=http://127.0.0.1:4000/api/v1
FINDATAGRAPH_EMAIL=controller@findatagraph.demo
FINDATAGRAPH_PASSWORD=password123
```

### Cursor / Claude Desktop snippet

```json
{
  "mcpServers": {
    "findatagraph-recon": {
      "command": "npm",
      "args": ["start", "-w", "@findatagraph/mcp"],
      "cwd": "/path/to/agent",
      "env": {
        "FINDATAGRAPH_API_URL": "http://127.0.0.1:4000/api/v1"
      }
    }
  }
}
```

## Planted-break evals

```bash
npm run db:seed -w @findatagraph/api
npm run dev:api   # leave running
npm run eval -w @findatagraph/mcp
```

Expect **4/4** on fixture CRM↔GL planted breaks (`src/eval/cases.json`).
