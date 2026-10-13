import { AUDIT_ACTIONS, CLUSTER_STEPS, JUMPSTART_AGENTS } from "@findatagraph/shared";
import { getDb } from "../db/connection.js";
import { id } from "../lib/ids.js";
import { writeAudit } from "../lib/audit.js";
import { recordUsage } from "../lib/usage.js";
import { runReconciliation } from "./matching.js";
import { buildJumpstartReport } from "./report.js";
import { listConnectors, syncConnector } from "./connectors.js";

/**
 * Thin multi-agent cluster orchestrator.
 * Sequences connector freshness → detect → investigate → report
 * with human-on-the-loop resolve left to the control plane UI.
 */
export function runJumpstartCluster({
  orgId,
  userId,
  definitionId = null,
  agentId = JUMPSTART_AGENTS.CRM_GL,
  syncConnectors = true,
}) {
  const db = getDb();

  let definition;
  if (definitionId) {
    definition = db
      .prepare(
        `SELECT * FROM reconciliation_definitions
         WHERE id = ? AND org_id = ? AND active = 1`
      )
      .get(definitionId, orgId);
  } else {
    definition = db
      .prepare(
        `SELECT * FROM reconciliation_definitions
         WHERE org_id = ? AND active = 1
         ORDER BY CASE code WHEN 'CRM_GL_REV' THEN 0 ELSE 1 END, name
         LIMIT 1`
      )
      .get(orgId);
  }

  if (!definition) {
    const err = new Error("No active reconciliation definition for cluster run");
    err.status = 404;
    throw err;
  }

  const clusterId = id("clrun");
  const startedAt = new Date().toISOString();
  const steps = [];

  db.prepare(
    `INSERT INTO cluster_runs
      (id, org_id, agent_id, definition_id, status, steps_json, triggered_by, started_at)
     VALUES (?, ?, ?, ?, 'running', '[]', ?, ?)`
  ).run(clusterId, orgId, agentId, definition.id, userId, startedAt);

  writeAudit({
    orgId,
    actorId: userId,
    action: AUDIT_ACTIONS.CLUSTER_STARTED,
    resourceType: "cluster_run",
    resourceId: clusterId,
    payload: { agent_id: agentId, definition_id: definition.id },
    sourceCitations: [`reconciliation_definitions:${definition.id}`],
  });

  try {
    // 0) Connector freshness (optional stub sync for CRM/ERP)
    if (syncConnectors) {
      const catalog = listConnectors(orgId);
      const needed =
        definition.match_kind === "cc_auth_settle_cash"
          ? ["processor.auth.read", "processor.settle.read", "bank.deposit.read"]
          : ["salesforce.billing.read", "netsuite.gl.read"];

      for (const code of needed) {
        if (!catalog.find((c) => c.code === code)) continue;
        const sync = syncConnector({ orgId, userId, connectorCode: code });
        steps.push({
          step: "connector_sync",
          connector_code: code,
          status: sync.status,
          sync_id: sync.id,
          rows_staged: sync.rows_staged,
        });
      }
    }

    // 1) Detect
    const recon = runReconciliation({
      definitionId: definition.id,
      orgId,
      userId,
    });
    steps.push({
      step: CLUSTER_STEPS[0],
      status: recon.status,
      recon_run_id: recon.id,
      matched_count: recon.matched_count,
      exception_count: recon.exception_count,
    });

    // 2) Investigate — summarize open breaks (no auto-resolve)
    const openBreaks = db
      .prepare(
        `SELECT id, reference, exception_type, variance, status
         FROM exceptions
         WHERE org_id = ? AND run_id = ?
           AND status IN ('open', 'assigned', 'pending_approval')
         ORDER BY ABS(COALESCE(variance, 0)) DESC
         LIMIT 25`
      )
      .all(orgId, recon.id);
    steps.push({
      step: CLUSTER_STEPS[1],
      status: "completed",
      open_count: openBreaks.length,
      top_references: openBreaks.slice(0, 5).map((x) => x.reference),
      hitl: "Human investigates exceptions in the control plane before resolve",
    });

    // 3) Resolve — checkpoint only (human-on-the-loop)
    steps.push({
      step: CLUSTER_STEPS[2],
      status: "awaiting_human",
      hitl: true,
      message:
        "Material waive/correct requires controller dual-control in Exceptions UI",
      open_exception_ids: openBreaks.map((x) => x.id),
    });

    // 4) Report — Jumpstart diagnostic pack
    const report = buildJumpstartReport({
      orgId,
      userId,
      runId: recon.id,
    });
    steps.push({
      step: CLUSTER_STEPS[3],
      status: "completed",
      evidence_id: report.evidence_id,
      match_rate: report.scorecard.match_rate,
      open_variance_abs: report.scorecard.open_variance_abs,
    });

    const completedAt = new Date().toISOString();
    db.prepare(
      `UPDATE cluster_runs
       SET status = 'completed', steps_json = ?, recon_run_id = ?,
           report_json = ?, completed_at = ?
       WHERE id = ?`
    ).run(
      JSON.stringify(steps),
      recon.id,
      JSON.stringify({
        evidence_id: report.evidence_id,
        scorecard: report.scorecard,
        variance_memo: report.variance_memo,
      }),
      completedAt,
      clusterId
    );

    writeAudit({
      orgId,
      actorId: userId,
      action: AUDIT_ACTIONS.CLUSTER_COMPLETED,
      resourceType: "cluster_run",
      resourceId: clusterId,
      payload: {
        agent_id: agentId,
        recon_run_id: recon.id,
        steps: steps.map((s) => s.step),
      },
      sourceCitations: [
        `cluster_runs:${clusterId}`,
        `reconciliation_runs:${recon.id}`,
        report.evidence_id ? `evidence:${report.evidence_id}` : null,
      ].filter(Boolean),
    });

    recordUsage({
      orgId,
      actorId: userId,
      action: "cluster.run",
      resourceType: "cluster_run",
      resourceId: clusterId,
    });

    return getClusterRun(orgId, clusterId);
  } catch (error) {
    db.prepare(
      `UPDATE cluster_runs
       SET status = 'failed', steps_json = ?, error_message = ?, completed_at = ?
       WHERE id = ?`
    ).run(
      JSON.stringify(steps),
      String(error.message),
      new Date().toISOString(),
      clusterId
    );
    throw error;
  }
}

export function getClusterRun(orgId, clusterId) {
  const row = getDb()
    .prepare(`SELECT * FROM cluster_runs WHERE id = ? AND org_id = ?`)
    .get(clusterId, orgId);
  if (!row) return null;
  return {
    ...row,
    steps: JSON.parse(row.steps_json || "[]"),
    report: row.report_json ? JSON.parse(row.report_json) : null,
  };
}

export function listClusterRuns(orgId, limit = 20) {
  return getDb()
    .prepare(
      `SELECT id, org_id, agent_id, definition_id, status, recon_run_id,
              triggered_by, started_at, completed_at, error_message, created_at,
              steps_json
       FROM cluster_runs WHERE org_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(orgId, limit)
    .map((row) => ({
      ...row,
      steps: JSON.parse(row.steps_json || "[]"),
      steps_json: undefined,
    }));
}
