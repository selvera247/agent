import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import Money from "../components/Money";
import StatusBadge from "../components/StatusBadge";

export default function ExceptionDetailPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const [data, setData] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [users, setUsers] = useState([]);
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [correction, setCorrection] = useState({
    correction_type: "adjustment",
    amount: 0,
    note: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await api(`/exceptions/${id}`, { token });
    setData(res.data);
    setCorrections(res.corrections || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    if (user?.role === "admin" || user?.role === "controller") {
      api("/users", { token })
        .then((res) => setUsers(res.data))
        .catch(() => {});
    }
  }, [id, token, user?.role]);

  async function act(path, body) {
    setError("");
    setMessage("");
    try {
      await api(`/exceptions/${id}${path}`, {
        token,
        method: "POST",
        body,
      });
      setMessage("Updated");
      setNote("");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function proposeCorrection(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await api(`/exceptions/${id}/corrections`, {
        token,
        method: "POST",
        body: {
          ...correction,
          amount: Number(correction.amount),
        },
      });
      setMessage("Correction submitted");
      setCorrection({ correction_type: "adjustment", amount: 0, note: "" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function decide(correctionId, decision) {
    try {
      await api(`/exceptions/corrections/${correctionId}/decide`, {
        token,
        method: "POST",
        body: { decision },
      });
      setMessage(`Correction ${decision}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="empty">Loading exception…</p>;

  const canControl = user?.role === "admin" || user?.role === "controller";
  const closed = ["resolved", "waived"].includes(data.status);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p style={{ margin: 0 }}>
            <Link to="/exceptions">← Exceptions</Link>
          </p>
          <h1>{data.reference}</h1>
          <p>{data.title}</p>
        </div>
        <StatusBadge status={data.status} />
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p style={{ color: "var(--ok)" }}>{message}</p> : null}

      <div className="split">
        <section className="panel">
          <div className="panel-header">
            <h2>Details</h2>
          </div>
          <dl className="meta-list">
            <div>
              <dt>Entity</dt>
              <dd>
                {data.entity_code} — {data.entity_name}
              </dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{data.exception_type.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>CRM amount</dt>
              <dd>
                <Money value={data.left_amount} currency={data.currency} />
              </dd>
            </div>
            <div>
              <dt>GL amount</dt>
              <dd>
                <Money value={data.right_amount} currency={data.currency} />
              </dd>
            </div>
            <div>
              <dt>Variance</dt>
              <dd>
                <Money value={data.variance} currency={data.currency} />
              </dd>
            </div>
            <div>
              <dt>Assignee</dt>
              <dd>{data.assignee_name || "Unassigned"}</dd>
            </div>
            <div>
              <dt>Context</dt>
              <dd>
                <code>{JSON.stringify(data.details)}</code>
              </dd>
            </div>
            {data.resolution_note ? (
              <div>
                <dt>Resolution</dt>
                <dd>{data.resolution_note}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Actions</h2>
          </div>
          <div style={{ padding: "1rem" }} className="stack">
            {!closed && canControl ? (
              <div className="stack">
                <div className="field">
                  <label htmlFor="assignee">Assign owner</label>
                  <select
                    id="assignee"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                  >
                    <option value="">Select user…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-testid="exception-assign"
                  disabled={!assigneeId}
                  onClick={() => act("/assign", { assignee_id: assigneeId })}
                >
                  Assign
                </button>
              </div>
            ) : null}

            {!closed ? (
              <>
                <div className="field">
                  <label htmlFor="note">Resolution / waive note</label>
                  <textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Document root cause and action taken"
                  />
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="btn"
                    data-testid="exception-resolve"
                    disabled={note.trim().length < 3}
                    onClick={() => act("/resolve", { note })}
                  >
                    Mark resolved
                  </button>
                  {canControl ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      data-testid="exception-waive"
                      disabled={note.trim().length < 5}
                      onClick={() => act("/waive", { note })}
                    >
                      Waive
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="hint">This exception is closed.</p>
            )}

            {!closed ? (
              <form onSubmit={proposeCorrection} className="stack">
                <h3 style={{ margin: "0.5rem 0 0", fontSize: "1rem" }}>
                  Propose correction
                </h3>
                <div className="field">
                  <label htmlFor="ctype">Type</label>
                  <select
                    id="ctype"
                    value={correction.correction_type}
                    onChange={(e) =>
                      setCorrection((c) => ({
                        ...c,
                        correction_type: e.target.value,
                      }))
                    }
                  >
                    <option value="adjustment">Adjustment</option>
                    <option value="reclass">Reclass</option>
                    <option value="timing">Timing</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="camount">Amount</label>
                  <input
                    id="camount"
                    type="number"
                    step="0.01"
                    value={correction.amount}
                    onChange={(e) =>
                      setCorrection((c) => ({ ...c, amount: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="cnote">Note</label>
                  <textarea
                    id="cnote"
                    value={correction.note}
                    onChange={(e) =>
                      setCorrection((c) => ({ ...c, note: e.target.value }))
                    }
                    required
                  />
                </div>
                <button className="btn btn-secondary" type="submit">
                  Submit correction
                </button>
                <p className="hint">
                  Amounts ≥ $10,000 require controller approval (dual control).
                </p>
              </form>
            ) : null}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Corrections</h2>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Proposed by</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {corrections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No corrections yet
                  </td>
                </tr>
              ) : (
                corrections.map((c) => (
                  <tr key={c.id}>
                    <td>{c.correction_type}</td>
                    <td>
                      <Money value={c.amount} />
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>{c.proposed_by_name}</td>
                    <td>{c.note}</td>
                    <td>
                      {c.status === "proposed" && canControl ? (
                        <div className="actions">
                          <button
                            type="button"
                            className="btn"
                            onClick={() => decide(c.id, "approved")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => decide(c.id, "rejected")}
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </td>
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
