import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, requireRoles("admin", "controller"), (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT a.*, u.name AS actor_name, u.email AS actor_email
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.org_id = ?
       ORDER BY a.created_at DESC
       LIMIT 200`
    )
    .all(req.user.org_id)
    .map((r) => ({ ...r, payload: JSON.parse(r.payload || "{}") }));

  res.json({ data: rows });
});

export default router;
