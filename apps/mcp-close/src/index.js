#!/usr/bin/env node
/**
 * Close Agent MCP (stdio) — flux / commentary skill set.
 * Pair with @findatagraph/mcp for recon. Shared governance: cite IDs, human gate, evals.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCloseTools } from "./tools.js";

const server = new McpServer({
  name: "findatagraph-close-agent",
  version: "0.1.0",
});

registerCloseTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
