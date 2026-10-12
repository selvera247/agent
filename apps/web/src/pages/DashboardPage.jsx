import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import Money from "../components/Money";
import StatusBadge from "../components/StatusBadge";

export default function DashboardPage() {
  const { token } = useAuth();
  const [summary, setSummary] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api("/dashboard/summary", { token }),
      api("/exceptions?status=open", { token }),
    ])
      .then(([dash, ex]) => {
        if (cancelled) return;
        setSummary(dash);
        setExceptions(ex.data.slice(0, 8));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) return <p className="error">{error}</p>;
  if (!summary) return <p className="empty">Loading dashboard…</p>;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Close control tower</h1>
          <p>Open exceptions, variance exposure, and latest reconciliation run.</p>
        </div>
        <Link className="btn" to="/runs">
          Run reconciliation
        </Link>
      </header>

      <section className="grid-kpi">
        <article className="kpi">
          <div className="kpi-label">Open exceptions</div>
          <div className="kpi-value">{summary.open_exceptions}</div>
        </article>
        <article className="kpi">
          <div className="kpi-label">Open variance</div>
          <div className="kpi-value">
            <Money value={summary.open_variance_abs} />
          </div>
        </article>
        <article className="kpi">
          <div className="kpi-label">Resolved (7d)</div>
          <div className="kpi-value">{summary.resolved_last_7_days}</div>
        </article>
        <article className="kpi">
          <div className="kpi-label">Last run</div>
          <div className="kpi-value" style={{ fontSize: "1.1rem", marginTop: "0.7rem" }}>
            {summary.last_run
              ? `${summary.last_run.status} · ${summary.last_run.exception_count} breaks`
              : "No runs yet"}
          </div>
        </article>
      </section>

      <div className="split">
        <section className="panel">
          <div className="panel-header">
            <h2>Top open exceptions</h2>
            <Link to="/exceptions">View all</Link>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Entity</th>
                  <th>Type</th>
                  <th>Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No open exceptions. Trigger a run from Runs.
                    </td>
                  </tr>
                ) : (
                  exceptions.map((ex) => (
                    <tr key={ex.id}>
                      <td>
                        <Link to={`/exceptions/${ex.id}`}>{ex.reference}</Link>
                      </td>
                      <td>{ex.entity_code}</td>
                      <td>{ex.exception_type.replaceAll("_", " ")}</td>
                      <td>
                        <Money value={ex.variance} currency={ex.currency} />
                      </td>
                      <td>
                        <StatusBadge status={ex.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Exposure by entity</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Count</th>
                  <th>Variance</th>
                </tr>
              </thead>
              <tbody>
                {summary.by_entity.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty">
                      No open exposure
                    </td>
                  </tr>
                ) : (
                  summary.by_entity.map((row) => (
                    <tr key={row.entity_code}>
                      <td>
                        {row.entity_code}
                        <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                          {row.entity_name}
                        </div>
                      </td>
                      <td>{row.count}</td>
                      <td>
                        <Money value={row.variance_abs} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
