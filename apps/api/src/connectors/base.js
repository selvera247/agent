/**
 * @typedef {object} CommercialRow
 * @property {string} external_id
 * @property {string} entity_code
 * @property {string} document_number
 * @property {string} counterparty
 * @property {string} document_date
 * @property {number} amount
 * @property {string} currency
 *
 * @typedef {object} GlRow
 * @property {string} external_id
 * @property {string} entity_code
 * @property {string} reference
 * @property {string} account_code
 * @property {string} posting_date
 * @property {number} amount
 * @property {string} currency
 */

export class SourceAdapter {
  /**
   * @param {{ id: string, platform: string, mode: string, config: object, name: string }} connection
   */
  constructor(connection) {
    this.connection = connection;
    this.platform = connection.platform;
    this.mode = connection.mode;
    this.config = connection.config || {};
  }

  async testConnection() {
    throw new Error("testConnection() not implemented");
  }

  /** @returns {Promise<CommercialRow[]>} */
  async pullCommercial() {
    throw new Error("pullCommercial() not implemented");
  }

  /** @returns {Promise<GlRow[]>} */
  async pullGlLines() {
    throw new Error("pullGlLines() not implemented");
  }
}

export function requireConfig(config, keys) {
  const missing = keys.filter((k) => !config[k] && !process.env[config[`${k}_env`] || ""]);
  if (missing.length) {
    const err = new Error(`Missing config: ${missing.join(", ")}`);
    err.status = 400;
    throw err;
  }
}

/** Resolve config value or env indirection: { host_env: "PGHOST" } */
export function cfg(config, key, fallback = undefined) {
  if (config[key] !== undefined && config[key] !== "") return config[key];
  const envKey = config[`${key}_env`];
  if (envKey && process.env[envKey]) return process.env[envKey];
  return fallback;
}
