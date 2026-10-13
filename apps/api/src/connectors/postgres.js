import { SourceAdapter, cfg } from "./base.js";
import { FixtureAdapter } from "./fixtureAdapter.js";

const DEFAULT_COMMERCIAL_SQL = `
  SELECT external_id, entity_code, document_number, counterparty,
         document_date::text AS document_date, amount::float8 AS amount, currency
  FROM findatagraph_commercial_v
`;

const DEFAULT_GL_SQL = `
  SELECT external_id, entity_code, reference, account_code,
         posting_date::text AS posting_date, amount::float8 AS amount, currency
  FROM findatagraph_gl_v
`;

export class PostgresAdapter extends SourceAdapter {
  async #client() {
    let pg;
    try {
      pg = await import("pg");
    } catch {
      const err = new Error(
        "Postgres live mode requires the 'pg' package. Use mode=fixture or npm i pg."
      );
      err.status = 501;
      throw err;
    }

    const connectionString =
      cfg(this.config, "connection_string") ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL;

    const Client = pg.default?.Client || pg.Client;
    const client = connectionString
      ? new Client({ connectionString })
      : new Client({
          host: cfg(this.config, "host", "127.0.0.1"),
          port: Number(cfg(this.config, "port", 5432)),
          database: cfg(this.config, "database"),
          user: cfg(this.config, "user"),
          password: cfg(this.config, "password"),
          ssl: cfg(this.config, "ssl") ? { rejectUnauthorized: false } : undefined,
        });

    await client.connect();
    return client;
  }

  async testConnection() {
    if (this.mode === "fixture") return new FixtureAdapter(this.connection).testConnection();
    const client = await this.#client();
    try {
      const r = await client.query("select 1 as ok");
      return { ok: true, mode: "live", platform: "postgres", result: r.rows[0] };
    } finally {
      await client.end();
    }
  }

  async pullCommercial() {
    if (this.mode === "fixture") return new FixtureAdapter(this.connection).pullCommercial();
    const client = await this.#client();
    try {
      const sql = cfg(this.config, "commercial_sql", DEFAULT_COMMERCIAL_SQL);
      const r = await client.query(sql);
      return r.rows.map((row) => ({ ...row, amount: Number(row.amount) }));
    } finally {
      await client.end();
    }
  }

  async pullGlLines() {
    if (this.mode === "fixture") return new FixtureAdapter(this.connection).pullGlLines();
    const client = await this.#client();
    try {
      const sql = cfg(this.config, "gl_sql", DEFAULT_GL_SQL);
      const r = await client.query(sql);
      return r.rows.map((row) => ({ ...row, amount: Number(row.amount) }));
    } finally {
      await client.end();
    }
  }
}
