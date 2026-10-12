import { getDb } from "../db/connection.js";
import { id } from "./ids.js";

export function writeAudit({ orgId, actorId, action, resourceType, resourceId, payload = {} }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log (id, org_id, actor_id, action, resource_type, resource_id, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id("aud"),
    orgId,
    actorId ?? null,
    action,
    resourceType,
    resourceId ?? null,
    JSON.stringify(payload)
  );
}
