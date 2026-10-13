import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const queuePath = path.join(dataDir, "review_queue.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadTrialBalance() {
  return readJson(path.join(dataDir, "trial_balance.json"));
}

export function loadSubledger() {
  return readJson(path.join(dataDir, "subledger.json"));
}

function ensureQueue() {
  if (!fs.existsSync(queuePath)) {
    fs.writeFileSync(queuePath, JSON.stringify({ items: [], tool_calls: [] }, null, 2));
  }
  return readJson(queuePath);
}

function writeQueue(q) {
  fs.writeFileSync(queuePath, JSON.stringify(q, null, 2));
}

export function logToolCall(name, input, summary) {
  const q = ensureQueue();
  const entry = {
    id: `tc_${randomUUID().slice(0, 8)}`,
    tool: name,
    input,
    summary,
    at: new Date().toISOString(),
  };
  q.tool_calls.unshift(entry);
  q.tool_calls = q.tool_calls.slice(0, 200);
  writeQueue(q);
  return entry;
}

export function listReviewQueue() {
  return ensureQueue().items.filter((i) => i.status === "pending");
}

export function enqueueDraft(draft) {
  const q = ensureQueue();
  const item = {
    id: `rev_${randomUUID().slice(0, 8)}`,
    status: "pending",
    created_at: new Date().toISOString(),
    ...draft,
  };
  q.items.unshift(item);
  writeQueue(q);
  return item;
}

export function decideReview(id, decision, edited_text) {
  const q = ensureQueue();
  const item = q.items.find((i) => i.id === id);
  if (!item) {
    const err = new Error(`Review item not found: ${id}`);
    err.status = 404;
    throw err;
  }
  if (item.status !== "pending") {
    const err = new Error(`Review item already ${item.status}`);
    err.status = 409;
    throw err;
  }
  item.status = decision;
  item.decided_at = new Date().toISOString();
  if (decision === "edited" && edited_text) {
    item.final_text = edited_text;
  } else if (decision === "approved") {
    item.final_text = item.draft_text;
  }
  writeQueue(q);
  return item;
}

export function getToolCallLog(limit = 50) {
  return ensureQueue().tool_calls.slice(0, limit);
}

/** Reset queue file (evals) */
export function resetReviewStore() {
  writeQueue({ items: [], tool_calls: [] });
}
