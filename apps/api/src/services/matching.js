import {
  EXCEPTION_STATUS,
  EXCEPTION_TYPES,
  RUN_STATUS,
  AUDIT_ACTIONS,
  MATCH_KINDS,
} from "@findatagraph/shared";
import { getDb } from "../db/connection.js";
import { id } from "../lib/ids.js";
import { writeAudit } from "../lib/audit.js";
import { recordUsage } from "../lib/usage.js";

function insertExceptions(db, { orgId, runId, definitionId, exceptions }) {
  const insertEx = db.prepare(
    `INSERT INTO exceptions
      (id, org_id, run_id, definition_id, entity_id, exception_type, status,
       reference, left_amount, right_amount, variance, currency, title, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?)`
  );

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
      JSON.stringify(ex.details || {})
    );
  }
}

function matchCrmGl(db, { orgId, definitionId, tol }) {
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
        details: {
          account_code: gl.account_code,
          posting_date: gl.posting_date,
        },
      });
    }
  }

  return { matched, exceptions };
}

/**
 * Three-way: CardAuth → Settlement → BankDeposit (received).
 */
function matchCcAuthSettleCash(db, { orgId, tol }) {
  const auths = db.prepare(`SELECT * FROM cc_auths WHERE org_id = ?`).all(orgId);
  const settlements = db
    .prepare(`SELECT * FROM cc_settlements WHERE org_id = ?`)
    .all(orgId);
  const receipts = db
    .prepare(`SELECT * FROM cc_receipts WHERE org_id = ?`)
    .all(orgId);

  const settleByAuth = new Map(settlements.map((s) => [s.auth_code, s]));
  const receiptsByBatch = new Map();
  for (const r of receipts) {
    const list = receiptsByBatch.get(r.batch_id) || [];
    list.push(r);
    receiptsByBatch.set(r.batch_id, list);
  }

  let matched = 0;
  const exceptions = [];
  const settledBatches = new Set();

  for (const auth of auths) {
    const settle = settleByAuth.get(auth.auth_code);
    if (!settle) {
      exceptions.push({
        type: EXCEPTION_TYPES.AUTH_NOT_SETTLED,
        entityId: auth.entity_id,
        reference: auth.auth_code,
        left: auth.amount,
        right: null,
        variance: auth.amount,
        title: `Auth ${auth.auth_code} not settled`,
        details: {
          card_last4: auth.card_last4,
          auth_date: auth.auth_date,
          leg: "auth→settlement",
        },
      });
      continue;
    }

    settledBatches.add(settle.batch_id);

    const authVar = Number((auth.amount - settle.gross_amount).toFixed(2));
    if (Math.abs(authVar) > tol) {
      exceptions.push({
        type: EXCEPTION_TYPES.AUTH_SETTLE_AMOUNT_MISMATCH,
        entityId: auth.entity_id,
        reference: auth.auth_code,
        left: auth.amount,
        right: settle.gross_amount,
        variance: authVar,
        title: `Auth vs settle amount mismatch ${auth.auth_code}`,
        details: {
          batch_id: settle.batch_id,
          leg: "auth→settlement",
        },
      });
      continue;
    }

    // High fee rate demo signal (> 5% of gross)
    const feeRate = settle.gross_amount
      ? settle.fee_amount / settle.gross_amount
      : 0;
    if (feeRate > 0.05) {
      exceptions.push({
        type: EXCEPTION_TYPES.FEE_VARIANCE,
        entityId: auth.entity_id,
        reference: auth.auth_code,
        left: settle.gross_amount,
        right: settle.net_amount,
        variance: settle.fee_amount,
        title: `Fee variance on ${auth.auth_code}`,
        details: {
          batch_id: settle.batch_id,
          fee_amount: settle.fee_amount,
          fee_rate: Number(feeRate.toFixed(4)),
          leg: "settlement fees",
        },
      });
      continue;
    }

    matched += 1;
  }

  // Settlement batches without matching bank receipt
  const batchNets = new Map();
  for (const s of settlements) {
    batchNets.set(s.batch_id, (batchNets.get(s.batch_id) || 0) + s.net_amount);
  }

  for (const [batchId, netTotal] of batchNets) {
    const rcpts = receiptsByBatch.get(batchId) || [];
    if (rcpts.length === 0) {
      const sample = settlements.find((s) => s.batch_id === batchId);
      exceptions.push({
        type: EXCEPTION_TYPES.SETTLED_NOT_RECEIVED,
        entityId: sample.entity_id,
        reference: batchId,
        left: Number(netTotal.toFixed(2)),
        right: null,
        variance: Number(netTotal.toFixed(2)),
        title: `Settlement batch ${batchId} not received in bank`,
        details: { leg: "settlement→received", net_total: netTotal },
      });
    } else {
      const received = rcpts.reduce((sum, r) => sum + r.amount, 0);
      const variance = Number((netTotal - received).toFixed(2));
      if (Math.abs(variance) > tol) {
        exceptions.push({
          type: EXCEPTION_TYPES.AMOUNT_MISMATCH,
          entityId: rcpts[0].entity_id,
          reference: batchId,
          left: Number(netTotal.toFixed(2)),
          right: Number(received.toFixed(2)),
          variance,
          title: `Batch ${batchId} net vs deposit mismatch`,
          details: { leg: "settlement→received" },
        });
      }
    }
  }

  // Orphan deposits
  for (const r of receipts) {
    if (!batchNets.has(r.batch_id)) {
      exceptions.push({
        type: EXCEPTION_TYPES.RECEIVED_UNMATCHED,
        entityId: r.entity_id,
        reference: r.deposit_ref,
        left: null,
        right: r.amount,
        variance: -r.amount,
        title: `Deposit ${r.deposit_ref} unmatched to settlements`,
        details: {
          batch_id: r.batch_id,
          received_date: r.received_date,
          leg: "received",
        },
      });
    }
  }

  return { matched, exceptions };
}

/**
 * Dispatch matcher by definition.match_kind.
 */
export function runReconciliation({ definitionId, orgId, userId }) {
  const db = getDb();
  const definition = db
    .prepare(
      `SELECT * FROM reconciliation_definitions WHERE id = ? AND org_id = ? AND active = 1`
    )
    .get(definitionId, orgId);

  if (!definition) {
    const err = new Error("Reconciliation definition not found or inactive");
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
    payload: {
      definition_id: definitionId,
      match_kind: definition.match_kind,
    },
  });

  try {
    const tol = definition.tolerance_abs ?? 0.01;
    const matchKind = definition.match_kind || MATCH_KINDS.CRM_GL;

    let result;
    if (matchKind === MATCH_KINDS.CC_AUTH_SETTLE_CASH) {
      result = matchCcAuthSettleCash(db, { orgId, tol });
    } else {
      result = matchCrmGl(db, { orgId, definitionId, tol });
    }

    const { matched, exceptions } = result;

    const tx = db.transaction(() => {
      insertExceptions(db, { orgId, runId, definitionId, exceptions });
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
      payload: {
        matched,
        exception_count: exceptions.length,
        match_kind: matchKind,
      },
    });

    recordUsage({
      orgId,
      actorId: userId,
      action: "recon.run",
      resourceType: "reconciliation_run",
      resourceId: runId,
    });

    return db.prepare(`SELECT * FROM reconciliation_runs WHERE id = ?`).get(runId);
  } catch (error) {
    db.prepare(
      `UPDATE reconciliation_runs SET status = ?, completed_at = ?, error_message = ? WHERE id = ?`
    ).run(
      RUN_STATUS.FAILED,
      new Date().toISOString(),
      String(error.message),
      runId
    );
    throw error;
  }
}
