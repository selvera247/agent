import { Router } from "express";
import { z } from "zod";
import { ROLES } from "@findatagraph/shared";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import {
  listStartingPoints,
  listSpecs,
  getSpec,
  generateSpec,
  implementSpec,
} from "../services/specStudio.js";
import { usageSummary } from "../lib/usage.js";

const router = Router();

router.use(requireAuth);

router.get("/starting-points", (_req, res) => {
  res.json({ data: listStartingPoints() });
});

router.get("/usage", (req, res) => {
  res.json({ data: usageSummary(req.user.org_id) });
});

router.get("/", (req, res) => {
  res.json({ data: listSpecs(req.user.org_id) });
});

router.get("/:id", (req, res) => {
  const spec = getSpec(req.user.org_id, req.params.id);
  if (!spec) return res.status(404).json({ error: "Spec not found" });
  res.json({ data: spec });
});

router.post(
  "/generate",
  requireRoles(ROLES.ADMIN, ROLES.CONTROLLER, ROLES.ACCOUNTANT),
  (req, res) => {
    const parsed = z
      .object({
        need: z.string().max(2000).optional(),
        starting_point_id: z.string().max(80).optional(),
      })
      .safeParse(req.body || {});

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const spec = generateSpec({
        orgId: req.user.org_id,
        userId: req.user.id,
        need: parsed.data.need,
        startingPointId: parsed.data.starting_point_id,
      });
      res.status(201).json({ data: spec });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

router.post(
  "/:id/implement",
  requireRoles(ROLES.ADMIN, ROLES.CONTROLLER),
  (req, res) => {
    try {
      const spec = implementSpec({
        orgId: req.user.org_id,
        userId: req.user.id,
        specId: req.params.id,
      });
      res.json({ data: spec });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
);

export default router;
