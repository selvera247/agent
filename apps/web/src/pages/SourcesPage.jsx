import { useEffect, useState } from "react";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";

export default function SourcesPage() {
  const { token, user } = useAuth();
  const [sources, setSources] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    const [s, p] = await Promise.all([
      api("/sources", { token }),
      api("/sources/platforms", { token }),
    ]);
    setSources(s.data);
    setPlatforms(p.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [token]);

  const canRun = user?.role === "admin" || user?.role === "controller";

  async function testConn(id) {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      const res = await api(`/sources/${id}/test`, { token, method: "POST" });
      setMessage(`${res.data.platform}: ${res.data.message || "ok"} (${res.data.mode})`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function syncConn(id) {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      const res = await api(`/sources/${id}/sync`, { token, method: "POST" });
      setMessage(
        `Synced ${res.data.commercial_count} commercial + ${res.data.gl_count} GL rows`
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Source platforms</h1>
          <p>
            Pull certified commercial + GL rows from Postgres, MySQL, Snowflake,
            Databricks, and similar — fixture mode works offline.
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p style={{ color: "var(--ok)" }}>{message}</p> : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Supported platforms</h2>
        </div>
        <div style={{ padding: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {platforms.map((p) => (
            <span key={p} className="badge">
              {p}
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Connections</h2>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Platform</th>
                <th>Mode</th>
                <th>Role</th>
                <th>Last sync</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sources.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No source connections — re-seed the API database.
                  </td>
                </tr>
              ) : (
                sources.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                        {s.code}
                      </div>
                    </td>
                    <td>{s.platform}</td>
                    <td>
                      <StatusBadge status={s.mode} />
                    </td>
                    <td>{s.role_in_recon}</td>
                    <td>
                      {s.last_sync_status ? (
                        <>
                          <StatusBadge status={s.last_sync_status} />
                          <div style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                            {s.last_sync_at || ""}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {canRun ? (
                        <div className="actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busyId === s.id}
                            onClick={() => testConn(s.id)}
                          >
                            Test
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={busyId === s.id}
                            onClick={() => syncConn(s.id)}
                          >
                            {busyId === s.id ? "Working…" : "Sync"}
                          </button>
                        </div>
                      ) : (
                        <span className="hint">Controller required</span>
                      )}
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
