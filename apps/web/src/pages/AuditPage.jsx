import { useEffect, useState } from "react";
import { useAuth } from "../api/auth";
import { api } from "../api/client";

export default function AuditPage() {
  const { token, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role === "accountant") {
      setError("Audit log is available to controllers and admins.");
      return;
    }
    api("/audit", { token })
      .then((res) => setRows(res.data))
      .catch((err) => setError(err.message));
  }, [token, user?.role]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Audit log</h1>
          <p>Immutable trail of logins, runs, assignments, and resolutions.</p>
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
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Payload</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No audit events yet
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.created_at}</td>
                      <td>
                        {r.actor_name || "—"}
                        <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                          {r.actor_email}
                        </div>
                      </td>
                      <td>{r.action}</td>
                      <td>
                        {r.resource_type}
                        <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                          {r.resource_id}
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: "0.78rem" }}>
                          {JSON.stringify(r.payload)}
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
