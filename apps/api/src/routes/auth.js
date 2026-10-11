import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { AUDIT_ACTIONS } from "@peak-close/shared";
import { getDb } from "../db/connection.js";
import { signToken, requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid credentials payload" });
  }

  const { email, password } = parsed.data;
  const user = getDb()
    .prepare(
      `SELECT id, org_id, email, name, role, password_hash, entity_ids FROM users WHERE email = ?`
    )
    .get(email.toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  writeAudit({
    orgId: user.org_id,
    actorId: user.id,
    action: AUDIT_ACTIONS.LOGIN,
    resourceType: "user",
    resourceId: user.id,
  });

  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      org_id: user.org_id,
      entity_ids: JSON.parse(user.entity_ids || "[]"),
    },
  });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
