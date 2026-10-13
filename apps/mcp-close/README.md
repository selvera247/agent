# Close Agent MCP (flux / commentary)

Synthetic GL flux skill set — pairs with `@findatagraph/mcp` (recon).

| This MCP | FinDataGraph Recon MCP |
|---|---|
| Trial balance, variance, subledger, draft commentary, review queue | Sources, runs, exceptions, corrections, audit |

## v1 tools

- `close_get_trial_balance`
- `close_get_account_variance`
- `close_get_subledger_detail`
- `close_list_open_close_tasks`
- `close_draft_flux_commentary` → always queues for HITL
- `close_list_review_queue`
- `close_submit_review_decision` (approve / edit / reject)
- `close_get_tool_call_log`

## Run

```bash
npm start -w @findatagraph/mcp-close
npm run eval -w @findatagraph/mcp-close
```

## Cursor config (both skill packs)

```json
{
  "mcpServers": {
    "findatagraph-recon": {
      "command": "npm",
      "args": ["start", "-w", "@findatagraph/mcp"],
      "cwd": "/path/to/agent",
      "env": { "FINDATAGRAPH_API_URL": "http://127.0.0.1:4000/api/v1" }
    },
    "findatagraph-close": {
      "command": "npm",
      "args": ["start", "-w", "@findatagraph/mcp-close"],
      "cwd": "/path/to/agent"
    }
  }
}
```
