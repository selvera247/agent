import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, requireRoles("admin", "controller"), (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT id, email, name, role, entity_ids FROM users WHERE org_id = ? ORDER BY name`
    )
    .all(req.user.org_id)
    .map((r) => ({ ...r, entity_ids: JSON.parse(r.entity_ids || "[]") }));
  res.json({ data: rows });
});

export default router;
