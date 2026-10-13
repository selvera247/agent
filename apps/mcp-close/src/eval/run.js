#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  enqueueDraft,
  listReviewQueue,
  loadSubledger,
  loadTrialBalance,
  resetReviewStore,
} from "../store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const suite = JSON.parse(
  fs.readFileSync(path.join(__dirname, "cases.json"), "utf8")
);

function varianceFlagged(periodA, periodB) {
  const tb = loadTrialBalance();
  const a = new Map(tb.periods[periodA].map((r) => [r.account, r.balance]));
  const b = new Map(tb.periods[periodB].map((r) => [r.account, r.balance]));
  const out = new Map();
  for (const account of new Set([...a.keys(), ...b.keys()])) {
    const left = a.get(account) ?? 0;
    const right = b.get(account) ?? 0;
    const delta = right - left;
    const pct = left === 0 ? (right === 0 ? 0 : 1) : delta / Math.abs(left);
    const flagged =
      Math.abs(pct) >= tb.policy.pct_threshold &&
      Math.abs(delta) >= tb.policy.abs_threshold;
    out.set(account, flagged);
  }
  return out;
}

resetReviewStore();
const { period_a, period_b } = suite.periods;
const flags = varianceFlagged(period_a, period_b);
let pass = 0;
const results = [];

for (const c of suite.cases) {
  const flagged = flags.get(c.expect_account);
  let ok = flagged === c.expect_flagged;

  if (ok && c.min_citations_on_draft) {
    const lines = loadSubledger()[c.expect_account]?.[period_b] || [];
    const item = enqueueDraft({
      account: c.expect_account,
      period_a,
      period_b,
      confidence: lines.length ? "high" : "low",
      draft_text: `Draft for ${c.expect_account}`,
      citations: lines.map((l) => ({ type: "txn_id", id: l.txn_id })),
    });
    ok = item.citations.length >= c.min_citations_on_draft;
  }

  if (ok) pass += 1;
  results.push({ id: c.id, name: c.name, pass: ok, flagged });
  console.log(`${ok ? "PASS" : "FAIL"} ${c.id} ${c.name}`);
}

const pending = listReviewQueue().length;
const report = {
  suite: suite.name,
  total: suite.cases.length,
  passed: pass,
  pass_rate: pass / suite.cases.length,
  review_queue_pending: pending,
  results,
};

const outDir = path.join(__dirname, "../../exports");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "eval_report.json"),
  JSON.stringify(report, null, 2)
);

console.log(
  `\nScore: ${pass}/${suite.cases.length} (${(report.pass_rate * 100).toFixed(0)}%)`
);
if (pass !== suite.cases.length) process.exitCode = 1;
