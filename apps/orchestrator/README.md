# FinDataGraph LangGraph Orchestrator

Python FastAPI sidecar that runs the Jumpstart multi-agent cluster with **LangGraph**.

```
connector_agent → detect_agent → investigate_agent → resolve_agent (HITL) → report_agent
```

Each node calls the Node control plane (`CONTROL_PLANE_URL`) for tools: connector sync, recon run, hybrid RAG investigate, Jumpstart report.

## Local

```bash
python3 -m venv .venv-orch && . .venv-orch/bin/activate
pip install -r requirements.txt
PYTHONPATH=src ORCHESTRATOR_PORT=8100 python -m findatagraph_orchestrator.server

# API with LangGraph engine:
ORCHESTRATOR_URL=http://127.0.0.1:8100 CONTROL_PLANE_URL=http://127.0.0.1:4000 npm run dev:api
```

Without `ORCHESTRATOR_URL`, the API runs an equivalent in-process graph (parity fallback).
