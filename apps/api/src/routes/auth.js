import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { AUDIT_ACTIONS } from "@findatagraph/shared";
import { getDb } from "../db/connection.js";
import { signToken, requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import {
  allowLocalLogin,
  authMode,
  authPublicConfig,
} from "../lib/authConfig.js";
import { upsertUserFromOidc, verifyOidcToken } from "../lib/oidc.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Public IdP config for the web login page (no secrets). */
router.get("/config", (_req, res) => {
  res.json({ data: authPublicConfig() });
});

router.post("/login", (req, res) => {
  if (!allowLocalLogin()) {
    return res.status(403).json({
      error: `Local login disabled (AUTH_MODE=${authMode()}). Use Okta or Clerk.`,
    });
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid credentials payload" });
  }

  const { email, password } = parsed.data;
  const user = getDb()
    .prepare(
      `SELECT id, org_id, email, name, role, password_hash, entity_ids, auth_provider
       FROM users WHERE email = ?`
    )
    .get(email.toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (user.auth_provider && user.auth_provider !== "local" && !allowLocalLogin()) {
    return res.status(403).json({ error: "Use IdP login for this account" });
  }

  writeAudit({
    orgId: user.org_id,
    actorId: user.id,
    action: AUDIT_ACTIONS.LOGIN,
    resourceType: "user",
    resourceId: user.id,
    payload: { provider: "local" },
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
      auth_provider: "local",
    },
  });
});

/**
 * Optional bootstrap: client sends IdP access token, server verifies + returns
 * mirrored user (same token is reused as Bearer for API calls).
 */
router.post("/oidc/session", async (req, res) => {
  const mode = authMode();
  if (mode !== "okta" && mode !== "clerk") {
    return res.status(400).json({ error: "AUTH_MODE is not okta or clerk" });
  }

  const token =
    req.body?.access_token ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(400).json({ error: "access_token required" });
  }

  try {
    const { claims, provider, settings } = await verifyOidcToken(token);
    const user = upsertUserFromOidc({ claims, provider, settings });
    writeAudit({
      orgId: user.org_id,
      actorId: user.id,
      action: AUDIT_ACTIONS.LOGIN,
      resourceType: "user",
      resourceId: user.id,
      payload: { provider },
    });
    res.json({ token, user, provider });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message || "Unauthorized" });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
