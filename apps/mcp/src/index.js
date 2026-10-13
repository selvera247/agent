#!/usr/bin/env node
/**
 * FinDataGraph Recon MCP server (stdio).
 *
 * Skill split:
 *   - Close Agent MCP (portfolio) → flux / commentary over GL
 *   - This server → recon: sources, runs, exceptions, corrections, audit
 *
 * Both share governance: cite IDs, human gate on material actions, planted-break evals.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FinDataGraphClient } from "./client.js";
import { registerReconTools } from "./tools.js";

const server = new McpServer({
  name: "findatagraph-recon",
  version: "0.1.0",
});

const client = new FinDataGraphClient();
registerReconTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
