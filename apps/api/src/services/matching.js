import {
  EXCEPTION_STATUS,
  EXCEPTION_TYPES,
  RUN_STATUS,
  AUDIT_ACTIONS,
} from "@findatagraph/shared";
import { getDb } from "../db/connection.js";
import { id } from "../lib/ids.js";
import { writeAudit } from "../lib/audit.js";

/**
 * CRM invoice ↔ GL revenue matcher.
 * Scalable seam: swap this module for a queue worker later.
 */
export function runReconciliation({ definitionId, orgId, userId }) {
  const db = getDb();
  const definition = db
    .prepare(
      `SELECT * FROM reconciliation_definitions WHERE id = ? AND org_id = ? AND active = 1`
    )
    .get(definitionId, orgId);

  if (!definition) {
    const err = new Error("Reconciliation definition not found");
    err.status = 404;
    throw err;
  }

  const runId = id("run");
  const startedAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO reconciliation_runs
      (id, org_id, definition_id, status, started_at, triggered_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(runId, orgId, definitionId, RUN_STATUS.RUNNING, startedAt, userId);

  writeAudit({
    orgId,
    actorId: userId,
    action: AUDIT_ACTIONS.RUN_STARTED,
    resourceType: "reconciliation_run",
    resourceId: runId,
    payload: { definition_id: definitionId },
  });

  try {
    const invoices = db
      .prepare(`SELECT * FROM crm_invoices WHERE org_id = ?`)
      .all(orgId);
    const glLines = db
      .prepare(`SELECT * FROM gl_revenue_lines WHERE org_id = ?`)
      .all(orgId);

    const glByRef = new Map(glLines.map((g) => [g.reference, g]));
    const invByRef = new Map(invoices.map((i) => [i.invoice_number, i]));

    let matched = 0;
    const exceptions = [];
    const tol = definition.tolerance_abs ?? 0.01;

    for (const inv of invoices) {
      const gl = glByRef.get(inv.invoice_number);
      if (!gl) {
        exceptions.push({
          type: EXCEPTION_TYPES.MISSING_IN_GL,
          entityId: inv.entity_id,
          reference: inv.invoice_number,
          left: inv.amount,
          right: null,
          variance: inv.amount,
          title: `CRM invoice ${inv.invoice_number} missing in GL`,
          details: { customer: inv.customer_name, invoice_date: inv.invoice_date },
        });
        continue;
      }

      if (gl.entity_id !== inv.entity_id) {
        exceptions.push({
          type: EXCEPTION_TYPES.ENTITY_MISMATCH,
          entityId: inv.entity_id,
          reference: inv.invoice_number,
          left: inv.amount,
          right: gl.amount,
          variance: inv.amount - gl.amount,
          title: `Entity mismatch for ${inv.invoice_number}`,
          details: {
            crm_entity: inv.entity_id,
            gl_entity: gl.entity_id,
          },
        });
        continue;
      }

      const variance = Number((inv.amount - gl.amount).toFixed(2));
      if (Math.abs(variance) > tol) {
        exceptions.push({
          type: EXCEPTION_TYPES.AMOUNT_MISMATCH,
          entityId: inv.entity_id,
          reference: inv.invoice_number,
          left: inv.amount,
          right: gl.amount,
          variance,
          title: `Amount mismatch ${inv.invoice_number}`,
          details: { customer: inv.customer_name },
        });
        continue;
      }

      matched += 1;
    }

    for (const gl of glLines) {
      if (!invByRef.has(gl.reference)) {
        exceptions.push({
          type: EXCEPTION_TYPES.MISSING_IN_CRM,
          entityId: gl.entity_id,
          reference: gl.reference,
          left: null,
          right: gl.amount,
          variance: -gl.amount,
          title: `GL line ${gl.reference} missing in CRM`,
          details: { account_code: gl.account_code, posting_date: gl.posting_date },
        });
      }
    }

    const insertEx = db.prepare(
      `INSERT INTO exceptions
        (id, org_id, run_id, definition_id, entity_id, exception_type, status,
         reference, left_amount, right_amount, variance, currency, title, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?)`
    );

    const tx = db.transaction(() => {
      for (const ex of exceptions) {
        insertEx.run(
          id("exc"),
          orgId,
          runId,
          definitionId,
          ex.entityId,
          ex.type,
          EXCEPTION_STATUS.OPEN,
          ex.reference,
          ex.left,
          ex.right,
          ex.variance,
          ex.title,
          JSON.stringify(ex.details)
        );
      }

      db.prepare(
        `UPDATE reconciliation_runs
         SET status = ?, completed_at = ?, matched_count = ?, exception_count = ?
         WHERE id = ?`
      ).run(
        RUN_STATUS.COMPLETED,
        new Date().toISOString(),
        matched,
        exceptions.length,
        runId
      );
    });

    tx();

    writeAudit({
      orgId,
      actorId: userId,
      action: AUDIT_ACTIONS.RUN_COMPLETED,
      resourceType: "reconciliation_run",
      resourceId: runId,
      payload: { matched, exception_count: exceptions.length },
    });

    return db.prepare(`SELECT * FROM reconciliation_runs WHERE id = ?`).get(runId);
  } catch (error) {
    db.prepare(
      `UPDATE reconciliation_runs SET status = ?, completed_at = ?, error_message = ? WHERE id = ?`
    ).run(RUN_STATUS.FAILED, new Date().toISOString(), String(error.message), runId);
    throw error;
  }
}
