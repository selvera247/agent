import { useEffect, useState } from "react";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";

const EXAMPLE_CONFIG = {
  mysql: {
    host: "host.docker.internal",
    port: 3306,
    database: "findatagraph_mock",
    user: "root",
    password: "password",
  },
  snowflake: {
    account: "xy12345.us-east-1",
    database: "FINANCE",
    schema: "MOCK",
    warehouse: "COMPUTE_WH",
    token: "(or set SNOWFLAKE_TOKEN env)",
  },
  databricks: {
    host: "https://adb-xxxx.azuredatabricks.net",
    warehouse_id: "abc123",
    token: "(or set DATABRICKS_TOKEN env)",
  },
  postgres: {
    host: "host.docker.internal",
    port: 5432,
    database: "findatagraph_mock",
    user: "postgres",
    password: "postgres",
  },
};

export default function SourcesPage() {
  const { token, user } = useAuth();
  const [sources, setSources] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [editId, setEditId] = useState("");
  const [editMode, setEditMode] = useState("fixture");
  const [editConfig, setEditConfig] = useState("{}");

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

  function openEdit(s) {
    setEditId(s.id);
    setEditMode(s.mode);
    setEditConfig(JSON.stringify(s.config || {}, null, 2));
    setError("");
    setMessage("");
  }

  async function saveEdit(e) {
    e.preventDefault();
    setBusyId(editId);
    setError("");
    setMessage("");
    try {
      let config;
      try {
        config = JSON.parse(editConfig);
      } catch {
        throw new Error("Config must be valid JSON");
      }
      await api(`/sources/${editId}`, {
        token,
        method: "PATCH",
        body: { mode: editMode, config },
      });
      setMessage(`Saved ${editId} as ${editMode}`);
      setEditId("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

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
    <div className="stack" data-testid="sources-page">
      <header className="page-header">
        <div>
          <h1>Source platforms</h1>
          <p>
            Pull certified commercial + GL rows from Postgres, MySQL, Snowflake,
            Databricks, and similar — fixture mode works offline; switch to live
            against your mock warehouse.
          </p>
        </div>
      </header>

      {error ? (
        <p className="error" data-testid="sources-error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p style={{ color: "var(--ok)" }} data-testid="sources-message">
          {message}
        </p>
      ) : null}

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
          <table className="data" data-testid="sources-table">
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
                  <tr key={s.id} data-testid={`source-row-${s.platform}`}>
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
                            className="btn btn-ghost"
                            data-testid={`source-configure-${s.platform}`}
                            onClick={() => openEdit(s)}
                          >
                            Configure
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            data-testid={`source-test-${s.platform}`}
                            disabled={busyId === s.id}
                            onClick={() => testConn(s.id)}
                          >
                            Test
                          </button>
                          <button
                            type="button"
                            className="btn"
                            data-testid={`source-sync-${s.platform}`}
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

      {editId ? (
        <section className="panel" data-testid="source-configure-panel">
          <div className="panel-header">
            <h2>Configure connection</h2>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditId("")}
            >
              Close
            </button>
          </div>
          <form className="studio-form" onSubmit={saveEdit} style={{ padding: "1rem" }}>
            <div className="field">
              <label htmlFor="src-mode">Mode</label>
              <select
                id="src-mode"
                data-testid="source-mode"
                value={editMode}
                onChange={(e) => setEditMode(e.target.value)}
              >
                <option value="fixture">fixture (offline synthetic)</option>
                <option value="live">live (your mock / client warehouse)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="src-config">Config JSON</label>
              <textarea
                id="src-config"
                data-testid="source-config"
                rows={10}
                value={editConfig}
                onChange={(e) => setEditConfig(e.target.value)}
                spellCheck={false}
              />
              <p className="hint">
                Examples live under <code>data/mock-sources/</code>. From Docker,
                MySQL/Postgres hosts are usually <code>host.docker.internal</code>.
                Snowflake/Databricks tokens can also come from container env
                (<code>SNOWFLAKE_*</code>, <code>DATABRICKS_*</code>).
              </p>
              <p className="hint">
                Sample shapes:{" "}
                <code>{JSON.stringify(EXAMPLE_CONFIG.mysql)}</code>
              </p>
            </div>
            <div className="actions">
              <button
                className="btn"
                type="submit"
                data-testid="source-save"
                disabled={busyId === editId}
              >
                Save
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
