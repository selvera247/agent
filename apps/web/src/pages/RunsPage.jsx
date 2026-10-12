import { useEffect, useState } from "react";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";

export default function RunsPage() {
  const { token, user } = useAuth();
  const [defs, setDefs] = useState([]);
  const [runs, setRuns] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [d, r] = await Promise.all([
      api("/reconciliations", { token }),
      api("/reconciliations/runs", { token }),
    ]);
    setDefs(d.data);
    setRuns(r.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [token]);

  async function trigger(defId) {
    setBusy(true);
    setError("");
    try {
      await api(`/reconciliations/${defId}/runs`, {
        token,
        method: "POST",
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const canRun = user?.role === "admin" || user?.role === "controller";

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Reconciliation runs</h1>
          <p>
            Trigger seeded CRM↔GL or Spec Studio–generated agents (including CC
            auth ↔ settlements ↔ received).
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Definitions</h2>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Source</th>
                <th>Tolerance</th>
                <th>Materiality</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => (
                <tr key={d.id}>
                  <td>{d.code}</td>
                  <td>
                    <strong>{d.name}</strong>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      {d.description}
                    </div>
                  </td>
                  <td>
                    <span className="badge">
                      {d.source || "seeded"}
                      {d.match_kind ? ` · ${d.match_kind}` : ""}
                    </span>
                  </td>
                  <td>{d.tolerance_abs}</td>
                  <td>{d.materiality_abs}</td>
                  <td>
                    {canRun ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => trigger(d.id)}
                      >
                        {busy ? "Running…" : "Run now"}
                      </button>
                    ) : (
                      <span className="hint">Controller required</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>History</h2>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Definition</th>
                <th>Status</th>
                <th>Matched</th>
                <th>Exceptions</th>
                <th>Started</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No runs yet
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.definition_name || r.definition_code}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>{r.matched_count}</td>
                    <td>{r.exception_count}</td>
                    <td>{r.started_at || "—"}</td>
                    <td>{r.completed_at || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
