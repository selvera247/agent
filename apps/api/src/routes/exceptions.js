import { Router } from "express";
import { z } from "zod";
import {
  AUDIT_ACTIONS,
  EXCEPTION_STATUS,
  MATERIALITY_USD,
  ROLES,
} from "@findatagraph/shared";
import { getDb } from "../db/connection.js";
import { requireAuth, requireRoles, entityFilterSql } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { id } from "../lib/ids.js";

const router = Router();

function getScopedException(user, exceptionId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT x.*, e.code AS entity_code, e.name AS entity_name,
              u.name AS assignee_name
       FROM exceptions x
       JOIN entities e ON e.id = x.entity_id
       LEFT JOIN users u ON u.id = x.assignee_id
       WHERE x.id = ? AND x.org_id = ?`
    )
    .get(exceptionId, user.org_id);

  if (!row) return null;
  if (
    user.role === ROLES.ACCOUNTANT &&
    !user.entity_ids.includes(row.entity_id)
  ) {
    return null;
  }
  row.details = JSON.parse(row.details || "{}");
  return row;
}

router.get("/", requireAuth, (req, res) => {
  const status = req.query.status;
  const scope = entityFilterSql(req.user, "x");
  const params = [req.user.org_id];
  let statusClause = "";

  if (status) {
    statusClause = " AND x.status = ? ";
    params.push(status);
  }

  params.push(...scope.params);

  const rows = getDb()
    .prepare(
      `SELECT x.*, e.code AS entity_code, e.name AS entity_name,
              u.name AS assignee_name
       FROM exceptions x
       JOIN entities e ON e.id = x.entity_id
       LEFT JOIN users u ON u.id = x.assignee_id
       WHERE x.org_id = ?
         ${statusClause}
         ${scope.clause}
       ORDER BY ABS(COALESCE(x.variance, 0)) DESC, x.created_at DESC
       LIMIT 200`
    )
    .all(...params)
    .map((r) => ({ ...r, details: JSON.parse(r.details || "{}") }));

  res.json({ data: rows });
});

router.get("/:id", requireAuth, (req, res) => {
  const row = getScopedException(req.user, req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  const corrections = getDb()
    .prepare(
      `SELECT c.*, p.name AS proposed_by_name, a.name AS approved_by_name
       FROM corrections c
       JOIN users p ON p.id = c.proposed_by
       LEFT JOIN users a ON a.id = c.approved_by
       WHERE c.exception_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(row.id);

  res.json({ data: row, corrections });
});

router.post("/:id/assign", requireAuth, requireRoles("admin", "controller"), (req, res) => {
  const schema = z.object({ assignee_id: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "assignee_id required" });

  const ex = getScopedException(req.user, req.params.id);
  if (!ex) return res.status(404).json({ error: "Not found" });

  const assignee = getDb()
    .prepare(`SELECT id FROM users WHERE id = ? AND org_id = ?`)
    .get(parsed.data.assignee_id, req.user.org_id);
  if (!assignee) return res.status(400).json({ error: "Invalid assignee" });

  getDb()
    .prepare(
      `UPDATE exceptions
       SET assignee_id = ?, status = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(parsed.data.assignee_id, EXCEPTION_STATUS.ASSIGNED, ex.id);

  writeAudit({
    orgId: req.user.org_id,
    actorId: req.user.id,
    action: AUDIT_ACTIONS.EXCEPTION_ASSIGNED,
    resourceType: "exception",
    resourceId: ex.id,
    payload: { assignee_id: parsed.data.assignee_id },
  });

  res.json({ data: getScopedException(req.user, ex.id) });
});

router.post("/:id/resolve", requireAuth, (req, res) => {
  const schema = z.object({ note: z.string().min(3) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "note required" });

  const ex = getScopedException(req.user, req.params.id);
  if (!ex) return res.status(404).json({ error: "Not found" });
  if (["resolved", "waived"].includes(ex.status)) {
    return res.status(409).json({ error: "Already closed" });
  }

  getDb()
    .prepare(
      `UPDATE exceptions
       SET status = ?, resolved_by = ?, resolution_note = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(EXCEPTION_STATUS.RESOLVED, req.user.id, parsed.data.note, ex.id);

  writeAudit({
    orgId: req.user.org_id,
    actorId: req.user.id,
    action: AUDIT_ACTIONS.EXCEPTION_RESOLVED,
    resourceType: "exception",
    resourceId: ex.id,
    payload: { note: parsed.data.note },
  });

  res.json({ data: getScopedException(req.user, ex.id) });
});

router.post(
  "/:id/waive",
  requireAuth,
  requireRoles("admin", "controller"),
  (req, res) => {
    const schema = z.object({ note: z.string().min(5) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "note required" });

    const ex = getScopedException(req.user, req.params.id);
    if (!ex) return res.status(404).json({ error: "Not found" });
    if (["resolved", "waived"].includes(ex.status)) {
      return res.status(409).json({ error: "Already closed" });
    }

    const material = Math.abs(ex.variance || 0) >= MATERIALITY_USD;
    if (material && req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.CONTROLLER) {
      return res.status(403).json({ error: "Material waive requires controller" });
    }

    getDb()
      .prepare(
        `UPDATE exceptions
         SET status = ?, resolved_by = ?, resolution_note = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(EXCEPTION_STATUS.WAIVED, req.user.id, parsed.data.note, ex.id);

    writeAudit({
      orgId: req.user.org_id,
      actorId: req.user.id,
      action: AUDIT_ACTIONS.EXCEPTION_WAIVED,
      resourceType: "exception",
      resourceId: ex.id,
      payload: { note: parsed.data.note, material },
    });

    res.json({ data: getScopedException(req.user, ex.id) });
  }
);

router.post("/:id/corrections", requireAuth, (req, res) => {
  const schema = z.object({
    correction_type: z.enum(["reclass", "adjustment", "timing"]),
    amount: z.number(),
    note: z.string().min(3),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid correction" });

  const ex = getScopedException(req.user, req.params.id);
  if (!ex) return res.status(404).json({ error: "Not found" });

  const correctionId = id("cor");
  const material = Math.abs(parsed.data.amount) >= MATERIALITY_USD;
  const status = material ? "proposed" : "approved";

  getDb()
    .prepare(
      `INSERT INTO corrections
        (id, org_id, exception_id, proposed_by, approved_by, status, correction_type, amount, note, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      correctionId,
      req.user.org_id,
      ex.id,
      req.user.id,
      material ? null : req.user.id,
      status,
      parsed.data.correction_type,
      parsed.data.amount,
      parsed.data.note,
      material ? null : new Date().toISOString()
    );

  getDb()
    .prepare(
      `UPDATE exceptions
       SET status = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      material ? EXCEPTION_STATUS.PENDING_APPROVAL : EXCEPTION_STATUS.RESOLVED,
      ex.id
    );

  if (!material) {
    getDb()
      .prepare(
        `UPDATE exceptions SET resolved_by = ?, resolution_note = ? WHERE id = ?`
      )
      .run(req.user.id, parsed.data.note, ex.id);
  }

  writeAudit({
    orgId: req.user.org_id,
    actorId: req.user.id,
    action: AUDIT_ACTIONS.CORRECTION_PROPOSED,
    resourceType: "correction",
    resourceId: correctionId,
    payload: { ...parsed.data, material, status },
  });

  res.status(201).json({
    data: getDb().prepare(`SELECT * FROM corrections WHERE id = ?`).get(correctionId),
    exception: getScopedException(req.user, ex.id),
  });
});

router.post(
  "/corrections/:correctionId/decide",
  requireAuth,
  requireRoles("admin", "controller"),
  (req, res) => {
    const schema = z.object({
      decision: z.enum(["approved", "rejected"]),
      note: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid decision" });

    const correction = getDb()
      .prepare(`SELECT * FROM corrections WHERE id = ? AND org_id = ?`)
      .get(req.params.correctionId, req.user.org_id);

    if (!correction) return res.status(404).json({ error: "Not found" });
    if (correction.status !== "proposed") {
      return res.status(409).json({ error: "Already decided" });
    }
    // SoD: proposer cannot approve/reject their own material correction
    if (correction.proposed_by === req.user.id) {
      return res.status(403).json({
        error: "Separation of duties: proposer cannot decide their own correction",
      });
    }

    getDb()
      .prepare(
        `UPDATE corrections
         SET status = ?, approved_by = ?, decided_at = datetime('now'),
             note = CASE WHEN ? IS NULL OR ? = '' THEN note ELSE note || ' | ' || ? END
         WHERE id = ?`
      )
      .run(
        parsed.data.decision,
        req.user.id,
        parsed.data.note ?? null,
        parsed.data.note ?? null,
        parsed.data.note ?? null,
        correction.id
      );

    if (parsed.data.decision === "approved") {
      getDb()
        .prepare(
          `UPDATE exceptions
           SET status = ?, resolved_by = ?, resolution_note = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          EXCEPTION_STATUS.RESOLVED,
          req.user.id,
          correction.note,
          correction.exception_id
        );
    } else {
      getDb()
        .prepare(
          `UPDATE exceptions
           SET status = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(EXCEPTION_STATUS.ASSIGNED, correction.exception_id);
    }

    writeAudit({
      orgId: req.user.org_id,
      actorId: req.user.id,
      action:
        parsed.data.decision === "approved"
          ? AUDIT_ACTIONS.CORRECTION_APPROVED
          : AUDIT_ACTIONS.CORRECTION_REJECTED,
      resourceType: "correction",
      resourceId: correction.id,
      payload: parsed.data,
    });

    res.json({
      data: getDb().prepare(`SELECT * FROM corrections WHERE id = ?`).get(correction.id),
    });
  }
);

export default router;
