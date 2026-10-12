import { ACTION_CREDITS } from "@findatagraph/shared";
import { getDb } from "../db/connection.js";
import { id } from "./ids.js";

export function recordUsage({
  orgId,
  actorId,
  action,
  resourceType = null,
  resourceId = null,
  credits,
}) {
  const db = getDb();
  const amount =
    typeof credits === "number" ? credits : ACTION_CREDITS[action] ?? 1;
  db.prepare(
    `INSERT INTO usage_events
      (id, org_id, actor_id, action, credits, resource_type, resource_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id("use"),
    orgId,
    actorId ?? null,
    action,
    amount,
    resourceType,
    resourceId
  );
  return amount;
}

export function usageSummary(orgId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(credits), 0) AS credits_used, COUNT(*) AS events
       FROM usage_events WHERE org_id = ?`
    )
    .get(orgId);
  return {
    credits_used: row.credits_used,
    events: row.events,
  };
}
