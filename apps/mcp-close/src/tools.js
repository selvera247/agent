import { z } from "zod";
import { toolError, toolResult } from "./governance.js";
import {
  decideReview,
  enqueueDraft,
  getToolCallLog,
  listReviewQueue,
  loadSubledger,
  loadTrialBalance,
  logToolCall,
} from "./store.js";

function varianceRows(periodA, periodB, policy) {
  const tb = loadTrialBalance();
  const a = new Map((tb.periods[periodA] || []).map((r) => [r.account, r]));
  const b = new Map((tb.periods[periodB] || []).map((r) => [r.account, r]));
  const accounts = new Set([...a.keys(), ...b.keys()]);
  const rows = [];

  for (const account of accounts) {
    const left = a.get(account)?.balance ?? 0;
    const right = b.get(account)?.balance ?? 0;
    const delta = right - left;
    const pct = left === 0 ? (right === 0 ? 0 : 1) : delta / Math.abs(left);
    const over =
      Math.abs(pct) >= policy.pct_threshold &&
      Math.abs(delta) >= policy.abs_threshold;
    rows.push({
      account,
      name: b.get(account)?.name || a.get(account)?.name,
      period_a: periodA,
      period_b: periodB,
      balance_a: left,
      balance_b: right,
      delta,
      pct: Number(pct.toFixed(4)),
      flagged: over,
      citations: [{ type: "account", id: account }],
    });
  }
  return rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

export function registerCloseTools(server) {
  server.tool(
    "close_get_trial_balance",
    "Synthetic trial balance for an entity/period. Read-only; cite account codes.",
    {
      period: z.string().describe("YYYY-MM, e.g. 2026-09"),
      entity: z.string().optional().default("ND-US"),
    },
    async ({ period, entity }) => {
      try {
        const tb = loadTrialBalance();
        const rows = tb.periods[period];
        if (!rows) throw new Error(`Unknown period ${period}`);
        logToolCall("close_get_trial_balance", { period, entity }, `${rows.length} accounts`);
        return toolResult(
          {
            entity: entity || tb.entity,
            period,
            currency: tb.currency,
            accounts: rows,
          },
          {
            citations: rows.map((r) => ({ type: "account", id: r.account })),
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "close_get_account_variance",
    "MoM / period variance with policy flags (>10% AND >$50K). Read-only.",
    {
      period_a: z.string().describe("Prior period YYYY-MM"),
      period_b: z.string().describe("Current period YYYY-MM"),
      flagged_only: z.boolean().optional().default(true),
    },
    async ({ period_a, period_b, flagged_only }) => {
      try {
        const tb = loadTrialBalance();
        let rows = varianceRows(period_a, period_b, tb.policy);
        if (flagged_only) rows = rows.filter((r) => r.flagged);
        logToolCall(
          "close_get_account_variance",
          { period_a, period_b, flagged_only },
          `${rows.length} rows`
        );
        return toolResult({
          policy: tb.policy,
          count: rows.length,
          variances: rows,
        });
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "close_get_subledger_detail",
    "Subledger / JE drivers for an account and period. Cite txn_ids in any draft.",
    {
      account: z.string(),
      period: z.string(),
    },
    async ({ account, period }) => {
      try {
        const sub = loadSubledger();
        const lines = sub[account]?.[period] || [];
        logToolCall(
          "close_get_subledger_detail",
          { account, period },
          `${lines.length} lines`
        );
        return toolResult(
          { account, period, lines },
          {
            citations: lines.map((l) => ({ type: "txn_id", id: l.txn_id })),
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "close_list_open_close_tasks",
    "Open close tasks derived from flagged variances (synthetic checklist).",
    {
      period_a: z.string().default("2026-08"),
      period_b: z.string().default("2026-09"),
    },
    async ({ period_a, period_b }) => {
      try {
        const tb = loadTrialBalance();
        const flagged = varianceRows(period_a, period_b, tb.policy).filter(
          (r) => r.flagged
        );
        const tasks = flagged.map((r, i) => ({
          task_id: `TASK-${period_b}-${r.account}`,
          seq: i + 1,
          account: r.account,
          name: r.name,
          delta: r.delta,
          status: "open",
          action: "Draft flux commentary with subledger citations",
        }));
        logToolCall("close_list_open_close_tasks", { period_a, period_b }, `${tasks.length} tasks`);
        return toolResult({ tasks });
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "close_draft_flux_commentary",
    "Draft flux commentary for an account. Always enqueues for human review — never final.",
    {
      account: z.string(),
      period_a: z.string(),
      period_b: z.string(),
      confidence: z.enum(["high", "med", "low"]).default("med"),
    },
    async ({ account, period_a, period_b, confidence }) => {
      try {
        const tb = loadTrialBalance();
        const rows = varianceRows(period_a, period_b, tb.policy);
        const row = rows.find((r) => r.account === account);
        if (!row) throw new Error(`No variance row for account ${account}`);

        const lines = loadSubledger()[account]?.[period_b] || [];
        const txnIds = lines.map((l) => l.txn_id);
        const driverText = lines.length
          ? lines.map((l) => `${l.txn_id}: ${l.description} (${l.amount})`).join("; ")
          : "No subledger support found — low confidence.";

        const conf =
          lines.length === 0 ? "low" : confidence === "high" && lines.length < 2 ? "med" : confidence;

        const draft_text = [
          `${row.name} (${account}) moved ${row.delta} from ${period_a} to ${period_b} (${(row.pct * 100).toFixed(1)}%).`,
          `Drivers: ${driverText}`,
          txnIds.length
            ? `Cited txns: ${txnIds.join(", ")}.`
            : "No txn citations available — route to review.",
        ].join(" ");

        const item = enqueueDraft({
          account,
          period_a,
          period_b,
          delta: row.delta,
          confidence: conf,
          draft_text,
          citations: txnIds.map((id) => ({ type: "txn_id", id })),
        });

        logToolCall(
          "close_draft_flux_commentary",
          { account, period_a, period_b, confidence: conf },
          item.id
        );

        return toolResult(
          {
            review_id: item.id,
            draft_text,
            confidence: conf,
            queued: true,
          },
          {
            humanGate: true,
            citations: [
              { type: "review_id", id: item.id },
              { type: "account", id: account },
              ...txnIds.map((id) => ({ type: "txn_id", id })),
            ],
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "close_list_review_queue",
    "Pending flux drafts awaiting approve / edit / reject.",
    {},
    async () => {
      try {
        const items = listReviewQueue();
        logToolCall("close_list_review_queue", {}, `${items.length} pending`);
        return toolResult({
          pending: items.length,
          items: items.map((i) => ({
            id: i.id,
            account: i.account,
            confidence: i.confidence,
            draft_text: i.draft_text,
            citations: i.citations,
            created_at: i.created_at,
          })),
        });
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "close_submit_review_decision",
    "Human gate: approve, edit, or reject a queued flux draft.",
    {
      review_id: z.string(),
      decision: z.enum(["approved", "edited", "rejected"]),
      edited_text: z
        .string()
        .optional()
        .describe("Required when decision=edited"),
    },
    async ({ review_id, decision, edited_text }) => {
      try {
        if (decision === "edited" && !edited_text) {
          throw new Error("edited_text required when decision=edited");
        }
        const item = decideReview(review_id, decision, edited_text);
        logToolCall(
          "close_submit_review_decision",
          { review_id, decision },
          item.status
        );
        return toolResult(
          { item },
          {
            humanGate: true,
            citations: [
              { type: "review_id", id: review_id },
              { type: "account", id: item.account },
            ],
          }
        );
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "close_get_tool_call_log",
    "Audit log of Close Agent MCP tool calls (timestamp, tool, inputs, summary).",
    {
      limit: z.number().int().positive().max(200).optional().default(50),
    },
    async ({ limit }) => {
      try {
        const events = getToolCallLog(limit);
        return toolResult({ events });
      } catch (error) {
        return toolError(error);
      }
    }
  );
}
