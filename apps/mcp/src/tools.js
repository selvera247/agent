import { z } from "zod";
import { MATERIALITY_USD } from "@findatagraph/shared";
import { toolError, toolResult } from "./client.js";

function citationsFromException(ex) {
  return [
    ex.id && { type: "exception_id", id: ex.id },
    ex.reference && { type: "document_reference", id: ex.reference },
    ex.run_id && { type: "reconciliation_run_id", id: ex.run_id },
    ex.entity_code && { type: "entity_code", id: ex.entity_code },
  ].filter(Boolean);
}

/**
 * Register FinDataGraph recon MCP tools on an McpServer instance.
 * Close Agent flux/commentary stays a separate MCP skill set.
 */
export function registerReconTools(server, client) {
  server.tool(
    "fdg_get_dashboard",
    "FinDataGraph control-tower summary: open exceptions, variance exposure, last run. Read-only.",
    {},
    async () => {
      try {
        const data = await client.request("/dashboard/summary");
        return toolResult(
          { dashboard: data },
          {
            citations: data.last_run?.id
              ? [{ type: "reconciliation_run_id", id: data.last_run.id }]
              : [],
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_list_sources",
    "List warehouse source connections (Postgres, MySQL, Snowflake, Databricks, …).",
    {},
    async () => {
      try {
        const data = await client.request("/sources");
        return toolResult({
          sources: data.data.map((s) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            platform: s.platform,
            mode: s.mode,
            role_in_recon: s.role_in_recon,
            last_sync_status: s.last_sync_status,
            last_sync_at: s.last_sync_at,
          })),
        });
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_test_source",
    "Test connectivity for a source connection (fixture or live). Read-only health check.",
    {
      connection_id: z.string(),
    },
    async ({ connection_id }) => {
      try {
        const data = await client.request(`/sources/${connection_id}/test`, {
          method: "POST",
        });
        return toolResult(
          { test: data.data },
          {
            citations: [{ type: "source_connection_id", id: connection_id }],
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_sync_source",
    "Pull commercial/GL rows from a source connection into certified staging. Controller-grade mutation — cite sync id; then run reconciliation.",
    {
      connection_id: z.string().describe("source_connections.id"),
    },
    async ({ connection_id }) => {
      try {
        const data = await client.request(`/sources/${connection_id}/sync`, {
          method: "POST",
        });
        return toolResult(
          { sync: data.data },
          {
            humanGate: false,
            citations: [
              { type: "source_sync_id", id: data.data.id },
              { type: "source_connection_id", id: connection_id },
            ],
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_list_reconciliations",
    "List reconciliation definitions available to run.",
    {},
    async () => {
      try {
        const data = await client.request("/reconciliations");
        return toolResult({
          definitions: data.data.map((d) => ({
            id: d.id,
            code: d.code,
            name: d.name,
            tolerance_abs: d.tolerance_abs,
            materiality_abs: d.materiality_abs,
          })),
        });
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_run_reconciliation",
    "Trigger a reconciliation run (matcher). Returns matched/exception counts with run id citation.",
    {
      definition_id: z
        .string()
        .describe("reconciliation_definitions.id, e.g. rec_crm_gl_revenue"),
    },
    async ({ definition_id }) => {
      try {
        const data = await client.request(`/reconciliations/${definition_id}/runs`, {
          method: "POST",
        });
        return toolResult(
          { run: data.data },
          {
            citations: [
              { type: "reconciliation_run_id", id: data.data.id },
              { type: "definition_id", id: definition_id },
            ],
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_list_exceptions",
    "List reconciliation exceptions. Filter by status. Always returns exception ids for citation.",
    {
      status: z
        .enum(["open", "assigned", "pending_approval", "resolved", "waived"])
        .optional()
        .describe("Optional status filter"),
    },
    async ({ status }) => {
      try {
        const q = status ? `?status=${status}` : "";
        const data = await client.request(`/exceptions${q}`);
        return toolResult({
          count: data.data.length,
          exceptions: data.data.map((ex) => ({
            id: ex.id,
            reference: ex.reference,
            title: ex.title,
            exception_type: ex.exception_type,
            status: ex.status,
            entity_code: ex.entity_code,
            variance: ex.variance,
            currency: ex.currency,
            left_amount: ex.left_amount,
            right_amount: ex.right_amount,
            run_id: ex.run_id,
            citations: citationsFromException(ex),
          })),
        });
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_get_exception",
    "Get one exception with corrections and citation bundle for investigate step.",
    {
      exception_id: z.string(),
    },
    async ({ exception_id }) => {
      try {
        const data = await client.request(`/exceptions/${exception_id}`);
        const ex = data.data;
        const material = Math.abs(ex.variance || 0) >= MATERIALITY_USD;
        return toolResult(
          {
            exception: ex,
            corrections: data.corrections,
            material,
            materiality_usd: MATERIALITY_USD,
          },
          {
            humanGate: material || ex.status === "pending_approval",
            citations: citationsFromException(ex),
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_propose_correction",
    "Propose a correction on an exception. Amounts ≥ materiality require controller approval (human gate). Prefer this over resolve/waive for agent-driven flows.",
    {
      exception_id: z.string(),
      correction_type: z.enum(["reclass", "adjustment", "timing"]),
      amount: z.number(),
      note: z.string().min(3),
    },
    async ({ exception_id, correction_type, amount, note }) => {
      try {
        const data = await client.request(`/exceptions/${exception_id}/corrections`, {
          method: "POST",
          body: { correction_type, amount, note },
        });
        const material = Math.abs(amount) >= MATERIALITY_USD;
        return toolResult(
          {
            correction: data.data,
            exception: data.exception,
            requires_controller_approval: material,
          },
          {
            humanGate: true,
            citations: [
              { type: "exception_id", id: exception_id },
              { type: "correction_id", id: data.data.id },
            ],
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_assign_exception",
    "Assign an exception owner (controller/admin). Cite exception + assignee ids.",
    {
      exception_id: z.string(),
      assignee_id: z.string().describe("users.id, e.g. usr_accountant"),
    },
    async ({ exception_id, assignee_id }) => {
      try {
        const data = await client.request(`/exceptions/${exception_id}/assign`, {
          method: "POST",
          body: { assignee_id },
        });
        return toolResult(
          { exception: data.data },
          {
            citations: [
              ...citationsFromException(data.data),
              { type: "assignee_id", id: assignee_id },
            ],
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_decide_correction",
    "Approve or reject a proposed correction. Controller-only human gate.",
    {
      correction_id: z.string(),
      decision: z.enum(["approved", "rejected"]),
      note: z.string().optional(),
    },
    async ({ correction_id, decision, note }) => {
      try {
        const data = await client.request(
          `/exceptions/corrections/${correction_id}/decide`,
          {
            method: "POST",
            body: { decision, note },
          }
        );
        return toolResult(
          { correction: data.data },
          {
            humanGate: true,
            citations: [{ type: "correction_id", id: correction_id }],
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_resolve_exception",
    "Mark exception resolved with a documented note. HUMAN GATE: only use when a controller has confirmed; never invent clearance.",
    {
      exception_id: z.string(),
      note: z.string().min(3),
      controller_confirmed: z
        .boolean()
        .describe("Must be true — agent affirms a human confirmed clearance"),
    },
    async ({ exception_id, note, controller_confirmed }) => {
      if (!controller_confirmed) {
        return toolResult(
          {
            rejected: true,
            reason:
              "controller_confirmed=false — will not resolve. Escalate to human review queue.",
          },
          { humanGate: true, citations: [{ type: "exception_id", id: exception_id }] }
        );
      }
      try {
        const data = await client.request(`/exceptions/${exception_id}/resolve`, {
          method: "POST",
          body: { note },
        });
        return toolResult(
          { exception: data.data },
          {
            humanGate: true,
            citations: citationsFromException(data.data),
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_waive_exception",
    "Waive an exception with a controllership note. HUMAN GATE: controller_confirmed required; material waives need controller role on API.",
    {
      exception_id: z.string(),
      note: z.string().min(5),
      controller_confirmed: z.boolean(),
    },
    async ({ exception_id, note, controller_confirmed }) => {
      if (!controller_confirmed) {
        return toolResult(
          {
            rejected: true,
            reason: "controller_confirmed=false — will not waive.",
          },
          { humanGate: true, citations: [{ type: "exception_id", id: exception_id }] }
        );
      }
      try {
        const data = await client.request(`/exceptions/${exception_id}/waive`, {
          method: "POST",
          body: { note },
        });
        return toolResult(
          { exception: data.data },
          {
            humanGate: true,
            citations: citationsFromException(data.data),
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_list_users",
    "List users for assignment (id, name, role). Controller/admin.",
    {},
    async () => {
      try {
        const data = await client.request("/users");
        return toolResult({
          users: data.data.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
          })),
        });
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "fdg_get_audit_trail",
    "Fetch recent audit log (logins, syncs, runs, assigns, resolves). Read-only evidence.",
    {},
    async () => {
      try {
        const data = await client.request("/audit");
        return toolResult({
          events: data.data.map((e) => ({
            id: e.id,
            action: e.action,
            resource_type: e.resource_type,
            resource_id: e.resource_id,
            actor_name: e.actor_name,
            created_at: e.created_at,
            payload: e.payload,
          })),
        });
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
