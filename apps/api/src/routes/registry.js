import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getRegistryAgent, listRegistryAgents } from "../services/registry.js";

const router = Router();

router.get("/agents", requireAuth, (_req, res) => {
  res.json({ data: listRegistryAgents() });
});

router.get("/agents/:id", requireAuth, (req, res) => {
  const agent = getRegistryAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent package not found" });
  res.json({ data: agent });
});

export default router;
