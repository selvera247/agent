import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { listConnectors, syncConnector } from "../services/connectors.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  res.json({ data: listConnectors(req.user.org_id) });
});

router.post(
  "/:code/sync",
  requireAuth,
  requireRoles("admin", "controller"),
  async (req, res) => {
    try {
      const sync = await syncConnector({
        orgId: req.user.org_id,
        userId: req.user.id,
        connectorCode: req.params.code,
      });
      res.status(201).json({ data: sync });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }
);

export default router;
