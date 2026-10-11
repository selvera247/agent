import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireAuth, entityFilterSql } from "../middleware/auth.js";

const router = Router();

router.get("/summary", requireAuth, (req, res) => {
  const db = getDb();
  const orgId = req.user.org_id;
  const scope = entityFilterSql(req.user, "exceptions");

  const open = db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(ABS(variance)), 0) AS variance_abs
       FROM exceptions
       WHERE org_id = ?
         AND status IN ('open', 'assigned', 'pending_approval')
         ${scope.clause}`
    )
    .get(orgId, ...scope.params);

  const byType = db
    .prepare(
      `SELECT exception_type, COUNT(*) AS count
       FROM exceptions
       WHERE org_id = ?
         AND status IN ('open', 'assigned', 'pending_approval')
         ${scope.clause}
       GROUP BY exception_type
       ORDER BY count DESC`
    )
    .all(orgId, ...scope.params);

  const byEntity = db
    .prepare(
      `SELECT e.code AS entity_code, e.name AS entity_name,
              COUNT(*) AS count,
              COALESCE(SUM(ABS(x.variance)), 0) AS variance_abs
       FROM exceptions x
       JOIN entities e ON e.id = x.entity_id
       WHERE x.org_id = ?
         AND x.status IN ('open', 'assigned', 'pending_approval')
         ${scope.clause.replaceAll("exceptions.", "x.")}
       GROUP BY e.id
       ORDER BY variance_abs DESC`
    )
    .all(orgId, ...scope.params);

  const lastRun = db
    .prepare(
      `SELECT r.*, d.name AS definition_name
       FROM reconciliation_runs r
       JOIN reconciliation_definitions d ON d.id = r.definition_id
       WHERE r.org_id = ?
       ORDER BY COALESCE(r.completed_at, r.started_at) DESC
       LIMIT 1`
    )
    .get(orgId);

  const resolvedThisWeek = db
    .prepare(
      `SELECT COUNT(*) AS count FROM exceptions
       WHERE org_id = ?
         AND status IN ('resolved', 'waived')
         AND updated_at >= datetime('now', '-7 days')
         ${scope.clause}`
    )
    .get(orgId, ...scope.params);

  res.json({
    open_exceptions: open.count,
    open_variance_abs: open.variance_abs,
    resolved_last_7_days: resolvedThisWeek.count,
    by_type: byType,
    by_entity: byEntity,
    last_run: lastRun ?? null,
  });
});

export default router;
