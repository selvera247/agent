import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { runReconciliation } from "../services/matching.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  const defs = getDb()
    .prepare(
      `SELECT * FROM reconciliation_definitions WHERE org_id = ? ORDER BY name`
    )
    .all(req.user.org_id);
  res.json({ data: defs });
});

router.get("/runs", requireAuth, (req, res) => {
  const runs = getDb()
    .prepare(
      `SELECT r.*, d.name AS definition_name, d.code AS definition_code
       FROM reconciliation_runs r
       JOIN reconciliation_definitions d ON d.id = r.definition_id
       WHERE r.org_id = ?
       ORDER BY COALESCE(r.completed_at, r.started_at) DESC
       LIMIT 50`
    )
    .all(req.user.org_id);
  res.json({ data: runs });
});

router.get("/:id", requireAuth, (req, res) => {
  const def = getDb()
    .prepare(
      `SELECT * FROM reconciliation_definitions WHERE id = ? AND org_id = ?`
    )
    .get(req.params.id, req.user.org_id);
  if (!def) return res.status(404).json({ error: "Not found" });

  const runs = getDb()
    .prepare(
      `SELECT * FROM reconciliation_runs WHERE definition_id = ? ORDER BY started_at DESC LIMIT 20`
    )
    .all(def.id);

  res.json({ data: def, runs });
});

router.post(
  "/:id/runs",
  requireAuth,
  requireRoles("admin", "controller"),
  (req, res) => {
    try {
      const run = runReconciliation({
        definitionId: req.params.id,
        orgId: req.user.org_id,
        userId: req.user.id,
      });
      res.status(201).json({ data: run });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }
);

export default router;
