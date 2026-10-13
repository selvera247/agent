import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

const router = Router();

function mapEvidence(row) {
  return {
    ...row,
    payload: JSON.parse(row.payload || "{}"),
    source_citations: JSON.parse(row.source_citations || "[]"),
  };
}

router.get("/", requireAuth, requireRoles("admin", "controller"), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = getDb()
    .prepare(
      `SELECT e.*, u.name AS actor_name, u.email AS actor_email
       FROM evidence e
       LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.org_id = ?
       ORDER BY e.created_at DESC
       LIMIT ?`
    )
    .all(req.user.org_id, limit)
    .map(mapEvidence);

  res.json({ data: rows });
});

router.get("/:id", requireAuth, requireRoles("admin", "controller"), (req, res) => {
  const row = getDb()
    .prepare(
      `SELECT e.*, u.name AS actor_name, u.email AS actor_email
       FROM evidence e
       LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.id = ? AND e.org_id = ?`
    )
    .get(req.params.id, req.user.org_id);

  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ data: mapEvidence(row) });
});

export default router;
