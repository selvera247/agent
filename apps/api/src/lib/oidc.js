import { createRemoteJWKSet, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getDb } from "../db/connection.js";
import { id } from "./ids.js";
import {
  mapEntityIdsFromClaims,
  mapRoleFromClaims,
  oidcSettings,
} from "./authConfig.js";

const jwksCache = new Map();

function getJwks(uri) {
  if (!jwksCache.has(uri)) {
    jwksCache.set(uri, createRemoteJWKSet(new URL(uri)));
  }
  return jwksCache.get(uri);
}

/**
 * Verify Okta or Clerk access/session JWT via JWKS.
 */
export async function verifyOidcToken(token) {
  const settings = oidcSettings();
  if (!settings?.jwksUri || !settings?.issuer) {
    const err = new Error(
      `OIDC not configured for provider ${settings?.provider || "unknown"}`
    );
    err.status = 503;
    throw err;
  }

  const JWKS = getJwks(settings.jwksUri);
  const options = {
    issuer: settings.issuer,
  };
  if (settings.audience) options.audience = settings.audience;

  const { payload } = await jwtVerify(token, JWKS, options);
  return { claims: payload, provider: settings.provider, settings };
}

/**
 * Upsert local user mirror for RBAC / entity scope / audit actor_id.
 * Password is a non-usable sentinel for IdP users.
 */
export function upsertUserFromOidc({ claims, provider, settings }) {
  const db = getDb();
  const email = String(
    claims.email || claims.preferred_username || claims.sub || ""
  )
    .toLowerCase()
    .trim();
  if (!email) {
    const err = new Error("IdP token missing email/sub");
    err.status = 401;
    throw err;
  }

  const externalId = String(claims.sub);
  const name =
    claims.name ||
    [claims.given_name, claims.family_name].filter(Boolean).join(" ") ||
    email;
  const role = mapRoleFromClaims(claims);
  const entityIds = mapEntityIdsFromClaims(claims);
  const orgId =
    claims[settings.orgClaim] ||
    claims.org_id ||
    settings.defaultOrgId ||
    "org_fdg_demo";

  // Ensure org exists (Jumpstart single-tenant default)
  const org = db.prepare(`SELECT id FROM organizations WHERE id = ?`).get(orgId);
  if (!org) {
    db.prepare(`INSERT INTO organizations (id, name) VALUES (?, ?)`).run(
      orgId,
      `Org ${orgId}`
    );
  }

  const existing =
    db
      .prepare(
        `SELECT * FROM users WHERE org_id = ? AND (external_id = ? OR email = ?)`
      )
      .get(orgId, externalId, email) ||
    db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);

  if (existing) {
    db.prepare(
      `UPDATE users
       SET name = ?, role = ?, entity_ids = ?, auth_provider = ?, external_id = ?,
           email = ?
       WHERE id = ?`
    ).run(
      name,
      role,
      JSON.stringify(entityIds.length ? entityIds : JSON.parse(existing.entity_ids || "[]")),
      provider,
      externalId,
      email,
      existing.id
    );
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(existing.id);
    return normalizeUser(user);
  }

  const userId = id("usr");
  const sentinel = bcrypt.hashSync(`oidc:${provider}:${externalId}`, 8);
  db.prepare(
    `INSERT INTO users
      (id, org_id, email, name, password_hash, role, entity_ids, auth_provider, external_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    orgId,
    email,
    name,
    sentinel,
    role,
    JSON.stringify(entityIds),
    provider,
    externalId
  );

  return normalizeUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId));
}

function normalizeUser(user) {
  return {
    id: user.id,
    org_id: user.org_id,
    email: user.email,
    name: user.name,
    role: user.role,
    entity_ids: JSON.parse(user.entity_ids || "[]"),
    auth_provider: user.auth_provider || "local",
    external_id: user.external_id || null,
  };
}
