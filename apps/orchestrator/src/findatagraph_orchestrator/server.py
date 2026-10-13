"""FastAPI surface for LangGraph Jumpstart cluster (client-tenancy sidecar)."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .graph import run_cluster

app = FastAPI(
    title="FinDataGraph LangGraph Orchestrator",
    version="0.2.0",
    description="Governed multi-agent Jumpstart cluster — runs beside the control plane in client cloud",
)


class ClusterRunRequest(BaseModel):
    org_id: str
    user_id: str
    definition_id: str | None = None
    agent_id: str | None = "peak.close.crm-gl-revenue"
    sync_connectors: bool = True
    control_plane_url: str = Field(
        ...,
        description="In-cluster URL of FinDataGraph API (e.g. http://findatagraph:4000)",
    )
    auth_token: str | None = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "findatagraph-orchestrator", "engine": "langgraph"}


@app.post("/v1/cluster/run")
def cluster_run(
    body: ClusterRunRequest,
    authorization: str | None = Header(default=None),
    x_org_id: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> dict[str, Any]:
    token = body.auth_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    payload = body.model_dump()
    payload["org_id"] = x_org_id or body.org_id
    payload["user_id"] = x_user_id or body.user_id
    payload["auth_token"] = token
    try:
        result = run_cluster(payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result.get("error") or "cluster failed")
    return {"data": result}


def main() -> None:
    import uvicorn

    uvicorn.run(
        "findatagraph_orchestrator.server:app",
        host="0.0.0.0",
        port=int(__import__("os").environ.get("ORCHESTRATOR_PORT", "8100")),
        reload=False,
    )


if __name__ == "__main__":
    main()
