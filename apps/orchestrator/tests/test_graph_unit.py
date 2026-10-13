"""Unit tests that mock the control plane HTTP tools."""

from __future__ import annotations

from findatagraph_orchestrator import graph as graph_mod
from findatagraph_orchestrator.graph import run_cluster


class FakeClient:
    def __init__(self, *args, **kwargs):
        pass

    def sync_connector(self, code: str):
        return {
            "id": f"csync_{code}",
            "status": "completed",
            "mode": "sandbox",
            "rows_staged": 7,
        }

    def list_definitions(self):
        return [{"id": "rec_1", "code": "CRM_GL_REV"}]

    def run_detect(self, definition_id: str):
        return {
            "id": "run_1",
            "status": "completed",
            "matched_count": 3,
            "exception_count": 4,
        }

    def investigate(self, run_id: str):
        return {
            "investigated_count": 4,
            "summary": {"mode": "hybrid_structured_bm25", "with_hits": 4},
            "packs": [
                {
                    "exception_id": "exc_1",
                    "reference": "INV-1007",
                    "retrieval": {"citations": ["staging:crm_invoice:INV-1007"]},
                }
            ],
        }

    def report(self, run_id: str):
        return {
            "evidence_id": "evd_1",
            "scorecard": {"match_rate": 0.5, "open_variance_abs": 100},
            "variance_memo": "Variance memo — test",
        }


def test_langgraph_jumpstart_sequence(monkeypatch):
    monkeypatch.setattr(graph_mod, "ControlPlaneClient", FakeClient)
    out = run_cluster(
        {
            "org_id": "org",
            "user_id": "usr",
            "agent_id": "peak.close.crm-gl-revenue",
            "definition_id": None,
            "sync_connectors": True,
            "control_plane_url": "http://example",
            "auth_token": "t",
        }
    )
    steps = [s["step"] for s in out["steps"]]
    assert out["engine"] == "langgraph"
    assert "connector_sync" in steps
    assert "detect" in steps
    assert "investigate" in steps
    assert "resolve" in steps
    assert "report" in steps
    resolve = next(s for s in out["steps"] if s["step"] == "resolve")
    assert resolve["status"] == "awaiting_human"
    assert out["status"] == "completed"
    assert out["report"]["evidence_id"] == "evd_1"
    assert out["recon_run_id"] == "run_1"
