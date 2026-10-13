import crypto from "node:crypto";
import { getDb } from "../db/connection.js";
import { id } from "./ids.js";

const POLICY_VERSION = process.env.POLICY_VERSION || "jumpstart-v1";

function hashPayload(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload ?? {}))
    .digest("hex");
}

/**
 * Append-only audit + first-class evidence (Trust Cloud substrate).
 * Returns { auditId, evidenceId }.
 */
export function writeAudit({
  orgId,
  actorId,
  action,
  resourceType,
  resourceId,
  payload = {},
  sourceCitations = [],
  policyVersion = POLICY_VERSION,
}) {
  const db = getDb();
  const auditId = id("aud");
  const evidenceId = id("evd");
  const payloadJson = JSON.stringify(payload);
  const contentHash = hashPayload({
    action,
    resourceType,
    resourceId,
    payload,
    sourceCitations,
    policyVersion,
  });

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO audit_log (id, org_id, actor_id, action, resource_type, resource_id, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      auditId,
      orgId,
      actorId ?? null,
      action,
      resourceType,
      resourceId ?? null,
      payloadJson
    );

    db.prepare(
      `INSERT INTO evidence
        (id, org_id, audit_id, actor_id, action, resource_type, resource_id,
         policy_version, content_hash, source_citations, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      evidenceId,
      orgId,
      auditId,
      actorId ?? null,
      action,
      resourceType,
      resourceId ?? null,
      policyVersion,
      contentHash,
      JSON.stringify(sourceCitations),
      payloadJson
    );
  });

  tx();

  return { auditId, evidenceId, contentHash };
}
