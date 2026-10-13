import { AUDIT_ACTIONS } from "@findatagraph/shared";
import { getDb } from "../db/connection.js";
import { writeAudit } from "../lib/audit.js";
import { recordUsage } from "../lib/usage.js";

/**
 * Week-1 Jumpstart diagnostic pack:
 * exception list + data-quality scorecard + variance memo.
 */
export function buildJumpstartReport({
  orgId,
  userId,
  runId = null,
  definitionId = null,
}) {
  const db = getDb();

  let run = null;
  if (runId) {
    run = db
      .prepare(
        `SELECT r.*, d.name AS definition_name, d.code AS definition_code,
                d.match_kind, d.tolerance_abs, d.materiality_abs
         FROM reconciliation_runs r
         JOIN reconciliation_definitions d ON d.id = r.definition_id
         WHERE r.id = ? AND r.org_id = ?`
      )
      .get(runId, orgId);
    if (!run) {
      const err = new Error("Reconciliation run not found");
      err.status = 404;
      throw err;
    }
  } else {
    const defClause = definitionId ? "AND r.definition_id = ?" : "";
    const params = definitionId ? [orgId, definitionId] : [orgId];
    run = db
      .prepare(
        `SELECT r.*, d.name AS definition_name, d.code AS definition_code,
                d.match_kind, d.tolerance_abs, d.materiality_abs
         FROM reconciliation_runs r
         JOIN reconciliation_definitions d ON d.id = r.definition_id
         WHERE r.org_id = ? ${defClause}
         ORDER BY COALESCE(r.completed_at, r.started_at) DESC
         LIMIT 1`
      )
      .get(...params);
  }

  if (!run) {
    const err = new Error("No reconciliation runs available for report");
    err.status = 404;
    throw err;
  }

  const exceptions = db
    .prepare(
      `SELECT x.*, e.code AS entity_code, e.name AS entity_name
       FROM exceptions x
       JOIN entities e ON e.id = x.entity_id
       WHERE x.org_id = ? AND x.run_id = ?
       ORDER BY ABS(COALESCE(x.variance, 0)) DESC`
    )
    .all(orgId, run.id)
    .map((row) => ({
      ...row,
      details: JSON.parse(row.details || "{}"),
    }));

  const openStatuses = new Set(["open", "assigned", "pending_approval"]);
  const open = exceptions.filter((x) => openStatuses.has(x.status));
  const material = open.filter(
    (x) => Math.abs(x.variance || 0) >= (run.materiality_abs || 10000)
  );

  const byType = {};
  for (const ex of exceptions) {
    byType[ex.exception_type] = (byType[ex.exception_type] || 0) + 1;
  }

  const totalTouched = (run.matched_count || 0) + (run.exception_count || 0);
  const matchRate =
    totalTouched === 0
      ? 1
      : Number(((run.matched_count || 0) / totalTouched).toFixed(4));
  const openVariance = open.reduce(
    (sum, x) => sum + Math.abs(x.variance || 0),
    0
  );

  const scorecard = {
    run_id: run.id,
    definition_code: run.definition_code,
    definition_name: run.definition_name,
    match_kind: run.match_kind,
    matched_count: run.matched_count,
    exception_count: run.exception_count,
    match_rate: matchRate,
    open_exception_count: open.length,
    material_exception_count: material.length,
    open_variance_abs: Number(openVariance.toFixed(2)),
    completeness_score: matchRate,
    freshness: {
      run_completed_at: run.completed_at,
      staging_note:
        "Validate against source-system controls before expanding the Jumpstart",
    },
    by_type: byType,
  };

  const topBreaks = open.slice(0, 5).map((x) => ({
    reference: x.reference,
    type: x.exception_type,
    entity: x.entity_code,
    variance: x.variance,
    title: x.title,
  }));

  const varianceMemo = [
    `# Variance memo — ${run.definition_name}`,
    ``,
    `Period control run \`${run.id}\` (${run.definition_code}) completed with ` +
      `${run.matched_count} matches and ${run.exception_count} exceptions ` +
      `(match rate ${(matchRate * 100).toFixed(1)}%).`,
    ``,
    `Open exposure is $${openVariance.toFixed(2)} across ${open.length} open ` +
      `breaks; ${material.length} sit at or above materiality ` +
      `($${run.materiality_abs}).`,
    ``,
    topBreaks.length
      ? `Top open breaks:\n` +
        topBreaks
          .map(
            (b, i) =>
              `${i + 1}. ${b.reference} (${b.entity}) — ${b.type.replaceAll("_", " ")} · variance $${Number(b.variance || 0).toFixed(2)}`
          )
          .join("\n")
      : `No open breaks remain for this run.`,
    ``,
    `Recommendation: clear material exceptions against the source system of ` +
      `record, then expand the Jumpstart into the domain cluster only after ` +
      `finance and IT sign the acceptance checklist.`,
  ].join("\n");

  const report = {
    kind: "jumpstart_diagnostic",
    generated_at: new Date().toISOString(),
    run: {
      id: run.id,
      definition_id: run.definition_id,
      definition_code: run.definition_code,
      definition_name: run.definition_name,
      status: run.status,
      started_at: run.started_at,
      completed_at: run.completed_at,
    },
    scorecard,
    exception_list: exceptions.map((x) => ({
      id: x.id,
      reference: x.reference,
      entity_code: x.entity_code,
      exception_type: x.exception_type,
      status: x.status,
      left_amount: x.left_amount,
      right_amount: x.right_amount,
      variance: x.variance,
      title: x.title,
    })),
    variance_memo: varianceMemo,
  };

  const { evidenceId, contentHash } = writeAudit({
    orgId,
    actorId: userId,
    action: AUDIT_ACTIONS.REPORT_GENERATED,
    resourceType: "jumpstart_report",
    resourceId: run.id,
    payload: {
      run_id: run.id,
      open_exception_count: open.length,
      open_variance_abs: scorecard.open_variance_abs,
      match_rate: matchRate,
    },
    sourceCitations: [
      `reconciliation_runs:${run.id}`,
      `reconciliation_definitions:${run.definition_id}`,
      ...exceptions.slice(0, 20).map((x) => `exceptions:${x.id}`),
    ],
  });

  recordUsage({
    orgId,
    actorId: userId,
    action: "report.generate",
    resourceType: "jumpstart_report",
    resourceId: run.id,
  });

  return { ...report, evidence_id: evidenceId, content_hash: contentHash };
}
