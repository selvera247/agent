import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/connection.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { createAdapter, listSupportedPlatforms } from "../connectors/registry.js";
import { syncSourceConnection } from "../services/sourceSync.js";

const router = Router();

const patchSchema = z.object({
  mode: z.enum(["fixture", "live"]).optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(200).optional(),
});

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

/** Flip fixture→live and attach connection config for mock / client warehouses */
router.patch(
  "/:id",
  requireAuth,
  requireRoles("admin", "controller"),
  (req, res) => {
    const parsed = patchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM source_connections WHERE id = ? AND org_id = ?`)
      .get(req.params.id, req.user.org_id);
    if (!row) return res.status(404).json({ error: "Not found" });

    const next = {
      mode: parsed.data.mode ?? row.mode,
      name: parsed.data.name ?? row.name,
      enabled:
        parsed.data.enabled === undefined
          ? row.enabled
          : parsed.data.enabled
            ? 1
            : 0,
      config:
        parsed.data.config !== undefined
          ? JSON.stringify(parsed.data.config)
          : row.config,
    };

    db.prepare(
      `UPDATE source_connections
       SET mode = ?, name = ?, enabled = ?, config = ?
       WHERE id = ? AND org_id = ?`
    ).run(
      next.mode,
      next.name,
      next.enabled,
      next.config,
      req.params.id,
      req.user.org_id
    );

    const updated = db
      .prepare(`SELECT * FROM source_connections WHERE id = ?`)
      .get(req.params.id);
    res.json({ data: mapConnection(updated) });
  }
);

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
