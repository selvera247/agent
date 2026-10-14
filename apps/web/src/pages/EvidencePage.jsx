import { useEffect, useState } from "react";
import { useAuth } from "../api/auth";
import { api } from "../api/client";

export default function EvidencePage() {
  const { token, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role === "accountant") {
      setError("Evidence is available to controllers and admins.");
      return;
    }
    api("/evidence", { token })
      .then((res) => setRows(res.data))
      .catch((err) => setError(err.message));
  }, [token, user?.role]);

  return (
    <div className="stack" data-testid="evidence-page">
      <header className="page-header">
        <div>
          <h1>Evidence</h1>
          <p>
            Trust Cloud substrate — content hashes, policy version, and source
            citations for every control action (SOX posture).
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {!error ? (
        <section className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Policy</th>
                  <th>Hash</th>
                  <th>Citations</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No evidence yet — run a reconciliation or Jumpstart
                      cluster.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.created_at}</td>
                      <td>
                        {r.action}
                        <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                          {r.actor_name || "—"}
                        </div>
                      </td>
                      <td>
                        {r.resource_type}
                        <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                          {r.resource_id}
                        </div>
                      </td>
                      <td>{r.policy_version}</td>
                      <td>
                        <code style={{ fontSize: "0.75rem" }}>
                          {r.content_hash?.slice(0, 16)}…
                        </code>
                      </td>
                      <td>
                        <code style={{ fontSize: "0.75rem" }}>
                          {(r.source_citations || []).slice(0, 3).join(", ") ||
                            "—"}
                        </code>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
