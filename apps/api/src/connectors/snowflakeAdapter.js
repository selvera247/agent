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
function snowflakeHost(accountRaw) {
  let account = String(accountRaw || "").trim();
  account = account.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  // Allow pasting full hostname or account locator (xy12345.us-east-1 / org-account)
  if (account.toLowerCase().endsWith(".snowflakecomputing.com")) {
    return account;
  }
  return `${account}.snowflakecomputing.com`;
}

export class SnowflakeAdapter extends SourceAdapter {
  #baseUrl() {
    const account = cfg(this.config, "account") || process.env.SNOWFLAKE_ACCOUNT;
    if (!account) {
      const err = new Error("Snowflake account required (config.account or SNOWFLAKE_ACCOUNT)");
      err.status = 400;
      throw err;
    }
    if (/^xy12345\./i.test(String(account).trim())) {
      const err = new Error(
        "Replace placeholder account xy12345… with your real Snowflake account locator from Snowsight (Account menu → Account / URL host before .snowflakecomputing.com)."
      );
      err.status = 400;
      throw err;
    }
    return `https://${snowflakeHost(account)}`;
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

    const url = `${this.#baseUrl()}/api/v2/statements`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "FinDataGraph/0.1",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const detail = error?.cause?.message || error?.message || "fetch failed";
      const err = new Error(
        `Snowflake unreachable (${url}): ${detail}. Check account locator, network policy / PAT temporary access, and warehouse.`
      );
      err.status = 502;
      throw err;
    }

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
