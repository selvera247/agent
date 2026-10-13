import { SOURCE_PLATFORMS } from "@findatagraph/shared";
import { PostgresAdapter } from "./postgres.js";
import { MysqlAdapter } from "./mysql.js";
import { SnowflakeAdapter } from "./snowflake.js";
import { DatabricksAdapter } from "./databricks.js";
import { FixtureAdapter } from "./fixtureAdapter.js";

const FACTORIES = {
  [SOURCE_PLATFORMS.POSTGRES]: (conn) => new PostgresAdapter(conn),
  [SOURCE_PLATFORMS.MYSQL]: (conn) => new MysqlAdapter(conn),
  [SOURCE_PLATFORMS.SNOWFLAKE]: (conn) => new SnowflakeAdapter(conn),
  [SOURCE_PLATFORMS.DATABRICKS]: (conn) => new DatabricksAdapter(conn),
  // Same contract — stub via fixture until live adapters land
  [SOURCE_PLATFORMS.BIGQUERY]: (conn) => new FixtureAdapter({ ...conn, platform: "bigquery" }),
  [SOURCE_PLATFORMS.FABRIC]: (conn) => new FixtureAdapter({ ...conn, platform: "fabric" }),
};

export function listSupportedPlatforms() {
  return Object.keys(FACTORIES);
}

export function createAdapter(connectionRow) {
  const config =
    typeof connectionRow.config === "string"
      ? JSON.parse(connectionRow.config || "{}")
      : connectionRow.config || {};

  const connection = {
    id: connectionRow.id,
    name: connectionRow.name,
    platform: connectionRow.platform,
    mode: connectionRow.mode,
    config,
  };

  const factory = FACTORIES[connection.platform];
  if (!factory) {
    const err = new Error(`Unsupported platform: ${connection.platform}`);
    err.status = 400;
    throw err;
  }
  return factory(connection);
}
