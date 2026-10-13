"""HTTP tool client — calls FinDataGraph control plane inside client tenancy."""

from __future__ import annotations

from typing import Any

import httpx


class ControlPlaneClient:
    def __init__(self, base_url: str, auth_token: str | None = None, timeout: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self.auth_token = auth_token
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.auth_token:
            h["Authorization"] = f"Bearer {self.auth_token}"
        return h

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def sync_connector(self, code: str) -> dict[str, Any]:
        r = httpx.post(
            self._url(f"/api/v1/connectors/{code}/sync"),
            headers=self._headers(),
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()["data"]

    def list_definitions(self) -> list[dict[str, Any]]:
        r = httpx.get(self._url("/api/v1/reconciliations"), headers=self._headers(), timeout=self.timeout)
        r.raise_for_status()
        return r.json()["data"]

    def run_detect(self, definition_id: str) -> dict[str, Any]:
        r = httpx.post(
            self._url(f"/api/v1/reconciliations/{definition_id}/runs"),
            headers=self._headers(),
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()["data"]

    def investigate(self, run_id: str) -> dict[str, Any]:
        r = httpx.post(
            self._url(f"/api/v1/investigate/run/{run_id}"),
            headers=self._headers(),
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()["data"]

    def report(self, run_id: str) -> dict[str, Any]:
        r = httpx.get(
            self._url(f"/api/v1/reports/jumpstart?run_id={run_id}"),
            headers=self._headers(),
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()["data"]
