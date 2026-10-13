import { SourceAdapter, cfg } from "./base.js";
import { FixtureAdapter } from "./fixtureAdapter.js";

const DEFAULT_COMMERCIAL_SQL = `
  SELECT external_id, entity_code, document_number, counterparty,
         DATE_FORMAT(document_date, '%Y-%m-%d') AS document_date,
         amount, currency
  FROM findatagraph_commercial_v
`;

const DEFAULT_GL_SQL = `
  SELECT external_id, entity_code, reference, account_code,
         DATE_FORMAT(posting_date, '%Y-%m-%d') AS posting_date,
         amount, currency
  FROM findatagraph_gl_v
`;

export class MysqlAdapter extends SourceAdapter {
  async #conn() {
    let mysql;
    try {
      mysql = await import("mysql2/promise");
    } catch {
      const err = new Error(
        "MySQL live mode requires the 'mysql2' package. Use mode=fixture or npm i mysql2."
      );
      err.status = 501;
      throw err;
    }

    return mysql.createConnection({
      host: cfg(this.config, "host", "127.0.0.1"),
      port: Number(cfg(this.config, "port", 3306)),
      database: cfg(this.config, "database"),
      user: cfg(this.config, "user"),
      password: cfg(this.config, "password"),
      uri: cfg(this.config, "connection_string") || process.env.MYSQL_URL,
    });
  }

  async testConnection() {
    if (this.mode === "fixture") return new FixtureAdapter(this.connection).testConnection();
    const conn = await this.#conn();
    try {
      const [rows] = await conn.query("SELECT 1 AS ok");
      return { ok: true, mode: "live", platform: "mysql", result: rows[0] };
    } finally {
      await conn.end();
    }
  }

  async pullCommercial() {
    if (this.mode === "fixture") return new FixtureAdapter(this.connection).pullCommercial();
    const conn = await this.#conn();
    try {
      const sql = cfg(this.config, "commercial_sql", DEFAULT_COMMERCIAL_SQL);
      const [rows] = await conn.query(sql);
      return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
    } finally {
      await conn.end();
    }
  }

  async pullGlLines() {
    if (this.mode === "fixture") return new FixtureAdapter(this.connection).pullGlLines();
    const conn = await this.#conn();
    try {
      const sql = cfg(this.config, "gl_sql", DEFAULT_GL_SQL);
      const [rows] = await conn.query(sql);
      return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
    } finally {
      await conn.end();
    }
  }
}
