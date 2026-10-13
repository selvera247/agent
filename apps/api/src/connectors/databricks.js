import { SourceAdapter, cfg } from "./base.js";
import { FixtureAdapter } from "./fixtureAdapter.js";

/**
 * Databricks SQL Statement Execution API (HTTP).
 *
 * Config / env:
 *   host (workspace URL), warehouse_id / path
 *   token or DATABRICKS_TOKEN
 */
export class DatabricksAdapter extends SourceAdapter {
  async #sql(statement) {
    const host = (cfg(this.config, "host") || process.env.DATABRICKS_HOST || "").replace(
      /\/$/,
      ""
    );
    const token = cfg(this.config, "token") || process.env.DATABRICKS_TOKEN;
    const warehouseId =
      cfg(this.config, "warehouse_id") || process.env.DATABRICKS_WAREHOUSE_ID;

    if (!host || !token || !warehouseId) {
      const err = new Error(
        "Databricks live mode needs host, token, warehouse_id (config or DATABRICKS_* env)"
      );
      err.status = 400;
      throw err;
    }

    const res = await fetch(`${host}/api/2.0/sql/statements`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        warehouse_id: warehouseId,
        statement,
        wait_timeout: "30s",
        disposition: "INLINE",
        format: "JSON_ARRAY",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Databricks SQL API ${res.status}: ${text.slice(0, 400)}`);
      err.status = 502;
      throw err;
    }

    const json = await res.json();
    if (json.status?.state && json.status.state !== "SUCCEEDED") {
      const err = new Error(
        `Databricks statement ${json.status.state}: ${JSON.stringify(json.status.error || {})}`
      );
      err.status = 502;
      throw err;
    }

    const cols = (json.manifest?.schema?.columns || []).map((c) => c.name.toLowerCase());
    const data = json.result?.data_array || [];
    return data.map((arr) => {
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
    const rows = await this.#sql("SELECT 1 AS ok");
    return { ok: true, mode: "live", platform: "databricks", result: rows[0] };
  }

  async pullCommercial() {
    if (this.mode === "fixture") return new FixtureAdapter(this.connection).pullCommercial();
    const sql =
      cfg(this.config, "commercial_sql") ||
      `SELECT external_id, entity_code, document_number, counterparty,
              CAST(document_date AS STRING) AS document_date, amount, currency
       FROM findatagraph_commercial_v`;
    return this.#sql(sql);
  }

  async pullGlLines() {
    if (this.mode === "fixture") return new FixtureAdapter(this.connection).pullGlLines();
    const sql =
      cfg(this.config, "gl_sql") ||
      `SELECT external_id, entity_code, reference, account_code,
              CAST(posting_date AS STRING) AS posting_date, amount, currency
       FROM findatagraph_gl_v`;
    return this.#sql(sql);
  }
}
