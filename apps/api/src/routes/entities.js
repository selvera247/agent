import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  let rows = db
    .prepare(
      `SELECT id, code, name, currency FROM entities WHERE org_id = ? ORDER BY code`
    )
    .all(req.user.org_id);

  if (req.user.role === "accountant") {
    rows = rows.filter((r) => req.user.entity_ids.includes(r.id));
  }

  res.json({ data: rows });
});

export default router;
