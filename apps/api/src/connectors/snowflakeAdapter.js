import { SourceAdapter, cfg } from "./base.js";
import { FixtureAdapter } from "./fixtureAdapter.js";

/**
 * Snowflake via SQL API (HTTP) — no native SDK required.
 * Docs: https://docs.snowflake.com/en/developer-guide/sql-api/index
 *
 * Config / env:
 *   account, user, warehouse, database, schema
 *   token or SNOWFLAKE_TOKEN (PAT / key-pair exchange token)
 */
export class SnowflakeAdapter extends SourceAdapter {
  #baseUrl() {
    const account = cfg(this.config, "account") || process.env.SNOWFLAKE_ACCOUNT;
    if (!account) {
      const err = new Error("Snowflake account required (config.account or SNOWFLAKE_ACCOUNT)");
      err.status = 400;
      throw err;
    }
    const host = account.includes(".") ? account : `${account}.snowflakecomputing.com`;
    return `https://${host}`;
  }

  async #sql(statement) {
    const token = cfg(this.config, "token") || process.env.SNOWFLAKE_TOKEN;
    if (!token) {
      const err = new Error("Snowflake token required (config.token or SNOWFLAKE_TOKEN)");
      err.status = 400;
      throw err;
    }

    const body = {
      statement,
      timeout: 60,
      database: cfg(this.config, "database") || process.env.SNOWFLAKE_DATABASE,
      schema: cfg(this.config, "schema") || process.env.SNOWFLAKE_SCHEMA,
      warehouse: cfg(this.config, "warehouse") || process.env.SNOWFLAKE_WAREHOUSE,
      role: cfg(this.config, "role") || process.env.SNOWFLAKE_ROLE,
    };

    const res = await fetch(`${this.#baseUrl()}/api/v2/statements`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "FinDataGraph/0.1",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Snowflake SQL API ${res.status}: ${text.slice(0, 400)}`);
      err.status = 502;
      throw err;
    }

    const json = await res.json();
    const cols = (json.resultSetMetaData?.rowType || []).map((c) => c.name.toLowerCase());
    const rows = json.data || [];
    return rows.map((arr) => {
      const obj = {};
      cols.forEach((c, i) => {
        obj[c] = arr[i];
      });
      if (obj.amount !== undefined) obj.amount = Number(obj.amount);
      return obj;
    });
  }

  async testConnection() {
    if (this.mode === "fixture") return new FixtureAdapter(this.connection).testConnection();
    const rows = await this.#sql("SELECT 1 AS OK");
    return { ok: true, mode: "live", platform: "snowflake", result: rows[0] };
  }

  async pullCommercial() {
    if (this.mode === "fixture") return new FixtureAdapter(this.connection).pullCommercial();
    const sql =
      cfg(this.config, "commercial_sql") ||
      `SELECT external_id, entity_code, document_number, counterparty,
              TO_VARCHAR(document_date) AS document_date, amount, currency
       FROM findatagraph_commercial_v`;
    return this.#sql(sql);
  }

  async pullGlLines() {
    if (this.mode === "fixture") return new FixtureAdapter(this.connection).pullGlLines();
    const sql =
      cfg(this.config, "gl_sql") ||
      `SELECT external_id, entity_code, reference, account_code,
              TO_VARCHAR(posting_date) AS posting_date, amount, currency
       FROM findatagraph_gl_v`;
    return this.#sql(sql);
  }
}
