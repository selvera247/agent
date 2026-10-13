"""
LangGraph multi-agent Jumpstart cluster.

Nodes = agents/tools sized to risk:
  connector_sync → detect → investigate (RAG) → resolve (HITL) → report
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from .tools_client import ControlPlaneClient


class ClusterState(TypedDict, total=False):
    org_id: str
    user_id: str
    agent_id: str
    definition_id: str | None
    sync_connectors: bool
    control_plane_url: str
    auth_token: str | None
    steps: list[dict[str, Any]]
    recon_run_id: str | None
    investigation: dict[str, Any] | None
    report_payload: dict[str, Any] | None
    error: str | None
    status: str


def _client(state: ClusterState) -> ControlPlaneClient:
    return ControlPlaneClient(
        state["control_plane_url"],
        auth_token=state.get("auth_token"),
    )


def node_connector_sync(state: ClusterState) -> ClusterState:
    steps = list(state.get("steps") or [])
    if not state.get("sync_connectors", True):
        return {**state, "steps": steps}
    client = _client(state)
    for code in ("salesforce.billing.read", "netsuite.gl.read"):
        try:
            sync = client.sync_connector(code)
            steps.append(
                {
                    "step": "connector_sync",
                    "agent": "connector_agent",
                    "connector_code": code,
                    "status": sync.get("status"),
                    "mode": sync.get("mode"),
                    "sync_id": sync.get("id"),
                    "rows_staged": sync.get("rows_staged"),
                }
            )
        except Exception as exc:  # noqa: BLE001 — surface per-connector
            steps.append(
                {
                    "step": "connector_sync",
                    "agent": "connector_agent",
                    "connector_code": code,
                    "status": "failed",
                    "error": str(exc),
                }
            )
            # NetSuite stub failures in live-SF-only mode are non-fatal
            if code == "salesforce.billing.read":
                return {**state, "steps": steps, "error": str(exc), "status": "failed"}
    return {**state, "steps": steps}


def node_detect(state: ClusterState) -> ClusterState:
    if state.get("status") == "failed":
        return state
    client = _client(state)
    steps = list(state.get("steps") or [])
    definition_id = state.get("definition_id")
    if not definition_id:
        defs = client.list_definitions()
        if not defs:
            return {
                **state,
                "error": "No reconciliation definitions",
                "status": "failed",
                "steps": steps,
            }
        # Prefer CRM_GL_REV
        preferred = next((d for d in defs if d.get("code") == "CRM_GL_REV"), defs[0])
        definition_id = preferred["id"]
    recon = client.run_detect(definition_id)
    steps.append(
        {
            "step": "detect",
            "agent": "detect_agent",
            "status": recon.get("status"),
            "recon_run_id": recon.get("id"),
            "matched_count": recon.get("matched_count"),
            "exception_count": recon.get("exception_count"),
        }
    )
    return {
        **state,
        "definition_id": definition_id,
        "recon_run_id": recon.get("id"),
        "steps": steps,
    }


def node_investigate(state: ClusterState) -> ClusterState:
    if state.get("status") == "failed" or not state.get("recon_run_id"):
        return state
    client = _client(state)
    steps = list(state.get("steps") or [])
    investigation = client.investigate(state["recon_run_id"])
    steps.append(
        {
            "step": "investigate",
            "agent": "investigate_agent",
            "status": "completed",
            "retrieval_mode": investigation.get("summary", {}).get("mode"),
            "open_count": investigation.get("investigated_count"),
            "packs_with_hits": investigation.get("summary", {}).get("with_hits"),
            "top_references": [
                p.get("reference") for p in (investigation.get("packs") or [])[:5]
            ],
            "sample_citations": [
                c
                for p in (investigation.get("packs") or [])
                for c in (p.get("retrieval") or {}).get("citations") or []
            ][:8],
            "hitl": "Human reviews RAG evidence packs before resolve",
        }
    )
    return {**state, "investigation": investigation, "steps": steps}


def node_resolve_hitl(state: ClusterState) -> ClusterState:
    if state.get("status") == "failed":
        return state
    steps = list(state.get("steps") or [])
    packs = (state.get("investigation") or {}).get("packs") or []
    steps.append(
        {
            "step": "resolve",
            "agent": "resolve_agent",
            "status": "awaiting_human",
            "hitl": True,
            "message": "Material waive/correct requires controller dual-control",
            "open_exception_ids": [p.get("exception_id") for p in packs],
        }
    )
    return {**state, "steps": steps}


def node_report(state: ClusterState) -> ClusterState:
    if state.get("status") == "failed" or not state.get("recon_run_id"):
        return {**state, "status": state.get("status") or "failed"}
    client = _client(state)
    steps = list(state.get("steps") or [])
    report = client.report(state["recon_run_id"])
    steps.append(
        {
            "step": "report",
            "agent": "report_agent",
            "status": "completed",
            "evidence_id": report.get("evidence_id"),
            "match_rate": (report.get("scorecard") or {}).get("match_rate"),
            "open_variance_abs": (report.get("scorecard") or {}).get("open_variance_abs"),
        }
    )
    return {**state, "report_payload": report, "steps": steps, "status": "completed"}


def build_jumpstart_graph():
    graph = StateGraph(ClusterState)
    graph.add_node("connector_agent", node_connector_sync)
    graph.add_node("detect_agent", node_detect)
    graph.add_node("investigate_agent", node_investigate)
    graph.add_node("resolve_agent", node_resolve_hitl)
    graph.add_node("report_agent", node_report)
    graph.set_entry_point("connector_agent")
    graph.add_edge("connector_agent", "detect_agent")
    graph.add_edge("detect_agent", "investigate_agent")
    graph.add_edge("investigate_agent", "resolve_agent")
    graph.add_edge("resolve_agent", "report_agent")
    graph.add_edge("report_agent", END)
    return graph.compile()


def run_cluster(payload: dict[str, Any]) -> dict[str, Any]:
    app = build_jumpstart_graph()
    initial: ClusterState = {
        "org_id": payload["org_id"],
        "user_id": payload["user_id"],
        "agent_id": payload.get("agent_id") or "peak.close.crm-gl-revenue",
        "definition_id": payload.get("definition_id"),
        "sync_connectors": payload.get("sync_connectors", True),
        "control_plane_url": payload["control_plane_url"],
        "auth_token": payload.get("auth_token"),
        "steps": [],
        "status": "running",
    }
    final = app.invoke(initial)
    return {
        "engine": "langgraph",
        "status": final.get("status") or "completed",
        "agent_id": final.get("agent_id"),
        "definition_id": final.get("definition_id"),
        "recon_run_id": final.get("recon_run_id"),
        "steps": final.get("steps") or [],
        "report": {
            "evidence_id": (final.get("report_payload") or {}).get("evidence_id"),
            "scorecard": (final.get("report_payload") or {}).get("scorecard"),
            "variance_memo": (final.get("report_payload") or {}).get("variance_memo"),
            "investigation_summary": (final.get("investigation") or {}).get("summary"),
        }
        if final.get("report_payload")
        else None,
        "error": final.get("error"),
    }
