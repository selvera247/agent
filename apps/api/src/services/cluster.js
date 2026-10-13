import { AUDIT_ACTIONS, CLUSTER_STEPS, JUMPSTART_AGENTS } from "@findatagraph/shared";
import { getDb } from "../db/connection.js";
import { id } from "../lib/ids.js";
import { writeAudit } from "../lib/audit.js";
import { recordUsage } from "../lib/usage.js";
import { runReconciliation } from "./matching.js";
import { buildJumpstartReport } from "./report.js";
import { listConnectors, syncConnector } from "./connectors.js";
import { investigateRun } from "./investigate.js";

function orchestratorUrl() {
  return (process.env.ORCHESTRATOR_URL || "").replace(/\/$/, "");
}

/**
 * Prefer LangGraph Python orchestrator when ORCHESTRATOR_URL is set;
 * otherwise run the equivalent graph locally (parity fallback).
 */
export async function runJumpstartCluster({
  orgId,
  userId,
  definitionId = null,
  agentId = JUMPSTART_AGENTS.CRM_GL,
  syncConnectors = true,
  authToken = null,
}) {
  const base = orchestratorUrl();
  if (base) {
    return runViaLangGraph({
      base,
      orgId,
      userId,
      definitionId,
      agentId,
      syncConnectors,
      authToken,
    });
  }
  return runLocalGraph({
    orgId,
    userId,
    definitionId,
    agentId,
    syncConnectors,
  });
}

async function runViaLangGraph({
  base,
  orgId,
  userId,
  definitionId,
  agentId,
  syncConnectors,
  authToken,
}) {
  const db = getDb();
  const clusterId = id("clrun");
  const startedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO cluster_runs
      (id, org_id, agent_id, definition_id, status, steps_json, triggered_by, started_at)
     VALUES (?, ?, ?, ?, 'running', '[]', ?, ?)`
  ).run(clusterId, orgId, agentId, definitionId, userId, startedAt);

  writeAudit({
    orgId,
    actorId: userId,
    action: AUDIT_ACTIONS.CLUSTER_STARTED,
    resourceType: "cluster_run",
    resourceId: clusterId,
    payload: { agent_id: agentId, engine: "langgraph" },
  });

  try {
    const res = await fetch(`${base}/v1/cluster/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        "X-Org-Id": orgId,
        "X-User-Id": userId,
      },
      body: JSON.stringify({
        org_id: orgId,
        user_id: userId,
        definition_id: definitionId,
        agent_id: agentId,
        sync_connectors: syncConnectors,
        control_plane_url:
          process.env.CONTROL_PLANE_URL ||
          `http://127.0.0.1:${process.env.PORT || 4000}`,
        auth_token: authToken,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw Object.assign(
        new Error(`LangGraph orchestrator failed: ${res.status} ${text}`),
        { status: 502 }
      );
    }
    const body = await res.json();
    const result = body.data || body;
    const steps = result.steps || [];
    const completedAt = new Date().toISOString();
    db.prepare(
      `UPDATE cluster_runs
       SET status = ?, steps_json = ?, recon_run_id = ?, report_json = ?,
           completed_at = ?, definition_id = COALESCE(?, definition_id),
           error_message = ?
       WHERE id = ?`
    ).run(
      result.status === "failed" ? "failed" : "completed",
      JSON.stringify(steps),
      result.recon_run_id || null,
      result.report ? JSON.stringify(result.report) : null,
      completedAt,
      result.definition_id || null,
      result.error || null,
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
        engine: "langgraph",
        recon_run_id: result.recon_run_id,
        steps: steps.map((s) => s.step),
      },
    });

    recordUsage({
      orgId,
      actorId: userId,
      action: "cluster.run",
      resourceType: "cluster_run",
      resourceId: clusterId,
    });

    return { ...getClusterRun(orgId, clusterId), engine: "langgraph" };
  } catch (error) {
    db.prepare(
      `UPDATE cluster_runs
       SET status = 'failed', error_message = ?, completed_at = ?
       WHERE id = ?`
    ).run(String(error.message), new Date().toISOString(), clusterId);
    throw error;
  }
}

async function runLocalGraph({
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
    payload: {
      agent_id: agentId,
      definition_id: definition.id,
      engine: "node-fallback",
    },
    sourceCitations: [`reconciliation_definitions:${definition.id}`],
  });

  try {
    if (syncConnectors) {
      const catalog = listConnectors(orgId);
      const needed =
        definition.match_kind === "cc_auth_settle_cash"
          ? ["processor.auth.read", "processor.settle.read", "bank.deposit.read"]
          : ["salesforce.billing.read", "netsuite.gl.read"];

      for (const code of needed) {
        if (!catalog.find((c) => c.code === code)) continue;
        const sync = await syncConnector({ orgId, userId, connectorCode: code });
        steps.push({
          step: "connector_sync",
          connector_code: code,
          status: sync.status,
          mode: sync.mode,
          sync_id: sync.id,
          rows_staged: sync.rows_staged,
        });
      }
    }

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

    const investigation = investigateRun({ orgId, runId: recon.id });
    steps.push({
      step: CLUSTER_STEPS[1],
      status: "completed",
      open_count: investigation.investigated_count,
      retrieval_mode: investigation.summary.mode,
      packs_with_hits: investigation.summary.with_hits,
      top_references: investigation.packs
        .slice(0, 5)
        .map((p) => p.reference),
      sample_citations: investigation.packs
        .flatMap((p) => p.retrieval.citations)
        .slice(0, 8),
      hitl: "Human investigates RAG packs in control plane before resolve",
    });

    steps.push({
      step: CLUSTER_STEPS[2],
      status: "awaiting_human",
      hitl: true,
      message:
        "Material waive/correct requires controller dual-control in Exceptions UI",
      open_exception_ids: investigation.packs.map((p) => p.exception_id),
    });

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
        investigation_summary: investigation.summary,
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
        engine: "node-fallback",
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

    return { ...getClusterRun(orgId, clusterId), engine: "node-fallback" };
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
