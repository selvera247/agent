import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import {
  getClusterRun,
  listClusterRuns,
  runJumpstartCluster,
} from "../services/cluster.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  res.json({ data: listClusterRuns(req.user.org_id) });
});

router.get("/:id", requireAuth, (req, res) => {
  const row = getClusterRun(req.user.org_id, req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ data: row });
});

router.post(
  "/run",
  requireAuth,
  requireRoles("admin", "controller"),
  async (req, res) => {
    try {
      const body = req.body || {};
      const authHeader = req.headers.authorization || "";
      const authToken = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;
      const result = await runJumpstartCluster({
        orgId: req.user.org_id,
        userId: req.user.id,
        definitionId: body.definition_id || null,
        agentId: body.agent_id || undefined,
        syncConnectors: body.sync_connectors !== false,
        authToken,
      });
      res.status(201).json({ data: result });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }
);

export default router;
