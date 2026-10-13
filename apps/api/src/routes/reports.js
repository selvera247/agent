import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { buildJumpstartReport } from "../services/report.js";

const router = Router();

/** Week-1 Jumpstart diagnostic: exception list + DQ scorecard + variance memo */
router.get(
  "/jumpstart",
  requireAuth,
  requireRoles("admin", "controller", "accountant"),
  (req, res) => {
    try {
      const report = buildJumpstartReport({
        orgId: req.user.org_id,
        userId: req.user.id,
        runId: req.query.run_id || null,
        definitionId: req.query.definition_id || null,
      });
      res.json({ data: report });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  }
);

export default router;
