import { useEffect, useState } from "react";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";

export default function ConnectorsPage() {
  const { token, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const res = await api("/connectors", { token });
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [token]);

  async function sync(code) {
    setBusy(code);
    setError("");
    try {
      await api(`/connectors/${encodeURIComponent(code)}/sync`, {
        token,
        method: "POST",
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const canSync = user?.role === "admin" || user?.role === "controller";

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Connectors</h1>
          <p>
            MCP / REST into client systems of record. Stub sync validates
            staging freshness without extracting data off-tenant.
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Connector</th>
                <th>Protocol</th>
                <th>Staging</th>
                <th>Rows</th>
                <th>Freshness</th>
                <th>Last sync</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.code}>
                  <td>
                    <strong>{c.name}</strong>
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      {c.code}
                    </div>
                  </td>
                  <td>
                    <span className="badge">{c.protocol}</span>
                  </td>
                  <td>{c.staging_table}</td>
                  <td>{c.staging_rows}</td>
                  <td>{c.staging_freshness_at || "—"}</td>
                  <td>
                    {c.last_sync ? (
                      <>
                        <StatusBadge status={c.last_sync.status} />
                        <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                          {c.last_sync.mode} · {c.last_sync.rows_staged} rows
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {canSync ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={Boolean(busy)}
                        onClick={() => sync(c.code)}
                      >
                        {busy === c.code ? "Syncing…" : "Stub sync"}
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
    </div>
  );
}
