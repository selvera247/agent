import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  enqueueDraft,
  listReviewQueue,
  decideReview,
  resetReviewStore,
  loadTrialBalance,
} from "../src/store.js";

before(() => {
  resetReviewStore();
});

test("trial balance has dual periods", () => {
  const tb = loadTrialBalance();
  assert.ok(tb.periods["2026-08"].length >= 5);
  assert.ok(tb.periods["2026-09"].length >= 5);
});

test("review queue human gate flow", () => {
  resetReviewStore();
  const item = enqueueDraft({
    account: "6200",
    period_a: "2026-08",
    period_b: "2026-09",
    confidence: "high",
    draft_text: "Cloud spend up on RI true-up.",
    citations: [{ type: "txn_id", id: "JE-6200-0912" }],
  });
  assert.equal(listReviewQueue().length, 1);
  const decided = decideReview(item.id, "approved");
  assert.equal(decided.status, "approved");
  assert.equal(listReviewQueue().length, 0);
});
