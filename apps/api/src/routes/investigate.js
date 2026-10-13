import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { hybridRetrieve, investigateRun } from "../services/investigate.js";
import { writeAudit } from "../lib/audit.js";
import { AUDIT_ACTIONS } from "@findatagraph/shared";

const router = Router();

router.post(
  "/retrieve",
  requireAuth,
  requireRoles("admin", "controller", "accountant"),
  (req, res) => {
    try {
      const body = req.body || {};
      const pack = hybridRetrieve({
        orgId: req.user.org_id,
        query: body.query || "",
        reference: body.reference || null,
        entityCode: body.entity_code || null,
        limit: Math.min(Number(body.limit) || 8, 25),
      });
      writeAudit({
        orgId: req.user.org_id,
        actorId: req.user.id,
        action: AUDIT_ACTIONS.EVIDENCE_RECORDED || "evidence_recorded",
        resourceType: "investigate_retrieve",
        resourceId: pack.content_hash.slice(0, 16),
        payload: {
          query: body.query || null,
          reference: body.reference || null,
          hit_count: pack.hit_count,
        },
        sourceCitations: pack.citations,
      });
      res.json({ data: pack });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }
);

router.post(
  "/run/:runId",
  requireAuth,
  requireRoles("admin", "controller"),
  (req, res) => {
    try {
      const result = investigateRun({
        orgId: req.user.org_id,
        runId: req.params.runId,
      });
      res.json({ data: result });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }
);

export default router;
