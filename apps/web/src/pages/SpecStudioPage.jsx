import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../api/auth";
import { api } from "../api/client";

export default function SpecStudioPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [startingPoints, setStartingPoints] = useState([]);
  const [need, setNeed] = useState("");
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [spec, setSpec] = useState(null);
  const [history, setHistory] = useState([]);
  const [usage, setUsage] = useState({ credits_used: 0, events: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function refresh() {
    const [points, specs, use] = await Promise.all([
      api("/specs/starting-points", { token }),
      api("/specs", { token }),
      api("/specs/usage", { token }),
    ]);
    setStartingPoints(points.data);
    setHistory(specs.data);
    setUsage(use.data);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [token]);

  function pickPoint(point) {
    setSelectedPoint(point.id);
    setNeed(point.example_need);
    setSpec(null);
    setError("");
  }

  async function onGenerate(e) {
    e?.preventDefault();
    setBusy("generate");
    setError("");
    try {
      const res = await api("/specs/generate", {
        token,
        method: "POST",
        body: {
          need: need.trim() || undefined,
          starting_point_id: selectedPoint || undefined,
        },
      });
      setSpec(res.data);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function onImplement() {
    if (!spec?.id) return;
    setBusy("implement");
    setError("");
    try {
      const res = await api(`/specs/${spec.id}/implement`, {
        token,
        method: "POST",
      });
      setSpec(res.data);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function onRun() {
    if (!spec?.definition_id) return;
    setBusy("run");
    setError("");
    try {
      await api(`/reconciliations/${spec.definition_id}/runs`, {
        token,
        method: "POST",
      });
      navigate("/exceptions");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const pkg = spec?.package;
  const canImplement =
    user?.role === "admin" || user?.role === "controller";
  const isPartial = Boolean(pkg?.partial || pkg?.partial_implemented);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Spec Studio</h1>
          <p>
            Dual path: open a seeded pack, or describe a need — generate the
            agent package, implement it, then run the governed loop.
          </p>
        </div>
        <div className="credits-pill" title="Demo credit meter">
          <span>Credits used</span>
          <strong>{usage.credits_used}</strong>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <div className="panel-header">
          <h2>1 · Starting points</h2>
          <span className="hint" style={{ margin: 0 }}>
            Seeded packs stay available · free text creates a new agent
          </span>
        </div>
        <div className="studio-chips">
          {startingPoints.map((point) => (
            <button
              key={point.id}
              type="button"
              data-testid={`studio-chip-${point.id}`}
              className={
                selectedPoint === point.id
                  ? "studio-chip active"
                  : "studio-chip"
              }
              onClick={() => pickPoint(point)}
            >
              <strong>{point.label}</strong>
              <span>{point.hint}</span>
              <em>{point.path === "seeded" ? "Seeded" : "Generate"}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>2 · Describe the need</h2>
        </div>
        <form className="studio-form" onSubmit={onGenerate}>
          <label htmlFor="need">Natural language intake</label>
          <textarea
            id="need"
            value={need}
            onChange={(e) => {
              setNeed(e.target.value);
              setSelectedPoint(null);
            }}
            placeholder='e.g. "reconcile CC auth, settlements, and what we received"'
          />
          <div className="actions">
            <button
              className="btn"
              type="submit"
              data-testid="studio-generate"
              disabled={busy === "generate"}
            >
              {busy === "generate" ? "Generating…" : "Generate package"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setNeed(
                  "reconcile CC auth, settlements, and what we received"
                );
                setSelectedPoint("cc_auth_settle_received");
                setSpec(null);
              }}
            >
              Try CC auth example
            </button>
          </div>
        </form>
      </section>

      {spec ? (
        <section className="panel studio-preview">
          <div className="panel-header">
            <h2>3 · Package preview</h2>
            <span className={`badge ${pkg?.path === "seeded" ? "resolved" : "open"}`}>
              {pkg?.path === "seeded" ? "Reuses seeded pack" : "New generated pack"}
            </span>
          </div>
          <div className="studio-preview-body">
            <div>
              <h3>{spec.title}</h3>
              <p className="muted">{spec.need_text}</p>
              <dl className="meta-list">
                <div>
                  <dt>Template</dt>
                  <dd>{spec.template_id}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{spec.status}</dd>
                </div>
                <div>
                  <dt>Workflow</dt>
                  <dd>{(pkg?.workflow || []).join(" → ")}</dd>
                </div>
                <div>
                  <dt>Match kind</dt>
                  <dd>{pkg?.match_kind}</dd>
                </div>
                <div>
                  <dt>Agent</dt>
                  <dd>
                    <code>{pkg?.agent_spec?.id}</code>
                  </dd>
                </div>
              </dl>
            </div>
            <div className="studio-columns">
              <div>
                <h4>Ontology</h4>
                <ul>
                  {(pkg?.ontology_extensions || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Governance</h4>
                <ul>
                  {(pkg?.governance_policies || []).map((p) => (
                    <li key={p.id}>
                      {p.id}
                      {p.threshold_abs != null
                        ? ` (≥ $${p.threshold_abs.toLocaleString()})`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Evidence</h4>
                <ul>
                  {(pkg?.evidence_requirements || []).map((e) => (
                    <li key={e.action}>
                      <code>{e.action}</code>: {e.requires.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Pricing (credits)</h4>
                <ul>
                  {Object.entries(pkg?.agent_spec?.pricing || {}).map(
                    ([action, credits]) => (
                      <li key={action}>
                        <code>{action}</code> · {credits}
                      </li>
                    )
                  )}
                </ul>
              </div>
            </div>

            {isPartial ? (
              <p className="hint">
                Partial template — package is saved for the Spec Studio demo;
                matcher is not live. Prefer CRM↔GL (seeded) or CC auth for a full
                run.
              </p>
            ) : null}

            <div className="actions">
              {spec.status !== "implemented" ? (
                <button
                  type="button"
                  className="btn"
                  data-testid="studio-implement"
                  disabled={!canImplement || busy === "implement"}
                  onClick={onImplement}
                >
                  {busy === "implement"
                    ? "Implementing…"
                    : canImplement
                      ? "Implement into runtime"
                      : "Controller required to implement"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn"
                    data-testid="studio-run"
                    disabled={isPartial || busy === "run" || !canImplement}
                    onClick={onRun}
                  >
                    {busy === "run" ? "Running…" : "Run reconciliation"}
                  </button>
                  <Link className="btn btn-secondary" to="/runs">
                    View definitions
                  </Link>
                  <Link className="btn btn-ghost" to="/exceptions">
                    Open exceptions
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Recent specs</h2>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Need</th>
                <th>Path</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No generated specs yet — pick a starting point or enter a need.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr
                    key={row.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSpec(row)}
                  >
                    <td>
                      <strong>{row.title}</strong>
                    </td>
                    <td>{row.need_text}</td>
                    <td>{row.package?.path || "—"}</td>
                    <td>{row.status}</td>
                    <td>{row.created_at}</td>
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
