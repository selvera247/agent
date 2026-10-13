import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import Money from "../components/Money";
import StatusBadge from "../components/StatusBadge";

export default function JumpstartReportPage() {
  const { token, user } = useAuth();
  const [report, setReport] = useState(null);
  const [cluster, setCluster] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadReport() {
    const res = await api("/reports/jumpstart", { token });
    setReport(res.data);
  }

  useEffect(() => {
    loadReport().catch((err) => setError(err.message));
  }, [token]);

  async function runCluster() {
    setBusy(true);
    setError("");
    try {
      const res = await api("/cluster/run", {
        token,
        method: "POST",
        body: {},
      });
      setCluster(res.data);
      await loadReport();
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
          <h1>Jumpstart report</h1>
          <p>
            Week-1 diagnostic pack: exception list, data-quality scorecard, and
            variance memo — validate against source controls before expanding.
          </p>
        </div>
        {canRun ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={runCluster}
          >
            {busy ? "Running cluster…" : "Run Jumpstart cluster"}
          </button>
        ) : null}
      </header>

      {error ? <p className="error">{error}</p> : null}

      {cluster ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Last cluster run</h2>
            <StatusBadge status={cluster.status} />
          </div>
          <ol className="step-list">
            {(cluster.steps || []).map((s, idx) => (
              <li key={`${s.step}-${idx}`}>
                <strong>{s.step}</strong>
                {s.connector_code ? ` · ${s.connector_code}` : ""}
                {s.status ? ` · ${s.status}` : ""}
                {s.exception_count != null
                  ? ` · ${s.exception_count} exceptions`
                  : ""}
                {s.retrieval_mode ? ` · ${s.retrieval_mode}` : ""}
                {s.mode ? ` · ${s.mode}` : ""}
                {s.hitl ? " · HITL checkpoint" : ""}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {!report && !error ? (
        <p className="empty">Loading report…</p>
      ) : null}

      {report ? (
        <>
          <section className="grid-kpi">
            <article className="kpi">
              <div className="kpi-label">Match rate</div>
              <div className="kpi-value">
                {(report.scorecard.match_rate * 100).toFixed(1)}%
              </div>
            </article>
            <article className="kpi">
              <div className="kpi-label">Open exceptions</div>
              <div className="kpi-value">
                {report.scorecard.open_exception_count}
              </div>
            </article>
            <article className="kpi">
              <div className="kpi-label">Material breaks</div>
              <div className="kpi-value">
                {report.scorecard.material_exception_count}
              </div>
            </article>
            <article className="kpi">
              <div className="kpi-label">Open variance</div>
              <div className="kpi-value">
                <Money value={report.scorecard.open_variance_abs} />
              </div>
            </article>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Data-quality scorecard</h2>
              <span className="badge">{report.run.definition_code}</span>
            </div>
            <p className="hint">
              Run {report.run.id} · evidence{" "}
              <Link to="/evidence">{report.evidence_id}</Link> · hash{" "}
              <code>{report.content_hash?.slice(0, 12)}…</code>
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Matched</td>
                    <td>{report.scorecard.matched_count}</td>
                  </tr>
                  <tr>
                    <td>Exceptions</td>
                    <td>{report.scorecard.exception_count}</td>
                  </tr>
                  <tr>
                    <td>Completeness</td>
                    <td>
                      {(report.scorecard.completeness_score * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td>Freshness</td>
                    <td>
                      {report.scorecard.freshness.run_completed_at || "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Variance memo</h2>
            </div>
            <pre className="memo">{report.variance_memo}</pre>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Exception list</h2>
              <Link to="/exceptions">Open workspace</Link>
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
                  {report.exception_list.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        No exceptions on this run
                      </td>
                    </tr>
                  ) : (
                    report.exception_list.map((ex) => (
                      <tr key={ex.id}>
                        <td>
                          <Link to={`/exceptions/${ex.id}`}>{ex.reference}</Link>
                        </td>
                        <td>{ex.entity_code}</td>
                        <td>{ex.exception_type.replaceAll("_", " ")}</td>
                        <td>
                          <Money value={ex.variance} />
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
        </>
      ) : null}
    </div>
  );
}
