import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { createAdapter, listSupportedPlatforms } from "../connectors/registry.js";
import { syncSourceConnection } from "../services/sourceSync.js";

const router = Router();

function mapConnection(row) {
  return {
    ...row,
    config: JSON.parse(row.config || "{}"),
    enabled: Boolean(row.enabled),
  };
}

router.get("/platforms", requireAuth, (_req, res) => {
  res.json({ data: listSupportedPlatforms() });
});

router.get("/", requireAuth, (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT * FROM source_connections WHERE org_id = ? ORDER BY platform, name`
    )
    .all(req.user.org_id)
    .map(mapConnection);
  res.json({ data: rows });
});

router.get("/:id", requireAuth, (req, res) => {
  const row = getDb()
    .prepare(`SELECT * FROM source_connections WHERE id = ? AND org_id = ?`)
    .get(req.params.id, req.user.org_id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ data: mapConnection(row) });
});

router.post(
  "/:id/test",
  requireAuth,
  requireRoles("admin", "controller"),
  async (req, res) => {
    const row = getDb()
      .prepare(`SELECT * FROM source_connections WHERE id = ? AND org_id = ?`)
      .get(req.params.id, req.user.org_id);
    if (!row) return res.status(404).json({ error: "Not found" });
    try {
      const result = await createAdapter(row).testConnection();
      res.json({ data: result });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }
);

router.post(
  "/:id/sync",
  requireAuth,
  requireRoles("admin", "controller"),
  async (req, res) => {
    try {
      const sync = await syncSourceConnection({
        connectionId: req.params.id,
        orgId: req.user.org_id,
        userId: req.user.id,
      });
      res.status(201).json({ data: sync });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }
);

router.get("/:id/syncs", requireAuth, (req, res) => {
  const conn = getDb()
    .prepare(`SELECT id FROM source_connections WHERE id = ? AND org_id = ?`)
    .get(req.params.id, req.user.org_id);
  if (!conn) return res.status(404).json({ error: "Not found" });

  const rows = getDb()
    .prepare(
      `SELECT * FROM source_syncs
       WHERE connection_id = ? AND org_id = ?
       ORDER BY started_at DESC LIMIT 50`
    )
    .all(req.params.id, req.user.org_id);
  res.json({ data: rows });
});

export default router;
