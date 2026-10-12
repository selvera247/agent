import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import Money from "../components/Money";
import StatusBadge from "../components/StatusBadge";

const FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "resolved", label: "Resolved" },
  { value: "waived", label: "Waived" },
];

export default function ExceptionsPage() {
  const { token } = useAuth();
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = status ? `?status=${status}` : "";
    api(`/exceptions${q}`, { token })
      .then((res) => setRows(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, status]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Exceptions</h1>
          <p>Breaks from CRM ↔ GL matching, ranked by absolute variance.</p>
        </div>
      </header>

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            className={`btn ${status === f.value ? "" : "btn-secondary"}`}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Title</th>
                <th>Entity</th>
                <th>Type</th>
                <th>CRM</th>
                <th>GL</th>
                <th>Variance</th>
                <th>Status</th>
                <th>Assignee</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="empty">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty">
                    No exceptions for this filter.
                  </td>
                </tr>
              ) : (
                rows.map((ex) => (
                  <tr key={ex.id}>
                    <td>
                      <Link to={`/exceptions/${ex.id}`}>{ex.reference}</Link>
                    </td>
                    <td>{ex.title}</td>
                    <td>{ex.entity_code}</td>
                    <td>{ex.exception_type.replaceAll("_", " ")}</td>
                    <td>
                      <Money value={ex.left_amount} currency={ex.currency} />
                    </td>
                    <td>
                      <Money value={ex.right_amount} currency={ex.currency} />
                    </td>
                    <td>
                      <Money value={ex.variance} currency={ex.currency} />
                    </td>
                    <td>
                      <StatusBadge status={ex.status} />
                    </td>
                    <td>{ex.assignee_name || "—"}</td>
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
