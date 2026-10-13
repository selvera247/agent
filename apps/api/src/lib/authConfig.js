/**
 * Auth providers: local (Jumpstart demo) | okta | clerk (preferred for client tenancy).
 *
 * AUTH_MODE=local|okta|clerk
 * AUTH_ALLOW_LOCAL=1 keeps demo password login alongside IdP (dev only).
 */

export function authMode() {
  const mode = (process.env.AUTH_MODE || "local").toLowerCase();
  if (["local", "okta", "clerk"].includes(mode)) return mode;
  return "local";
}

export function allowLocalLogin() {
  if (authMode() === "local") return true;
  return process.env.AUTH_ALLOW_LOCAL === "1" || process.env.AUTH_ALLOW_LOCAL === "true";
}

export function authPublicConfig() {
  const mode = authMode();
  return {
    mode,
    allow_local: allowLocalLogin(),
    clerk:
      mode === "clerk"
        ? {
            publishable_key: process.env.CLERK_PUBLISHABLE_KEY || null,
            // Frontend needs this; secret stays server-side
          }
        : null,
    okta:
      mode === "okta"
        ? {
            issuer: process.env.OKTA_ISSUER || null,
            client_id: process.env.OKTA_CLIENT_ID || null,
            redirect_uri:
              process.env.OKTA_REDIRECT_URI ||
              (process.env.PUBLIC_APP_URL
                ? `${process.env.PUBLIC_APP_URL.replace(/\/$/, "")}/login/callback`
                : null),
          }
        : null,
  };
}

export function oidcSettings() {
  const mode = authMode();
  if (mode === "clerk") {
    const issuer =
      process.env.CLERK_JWT_ISSUER ||
      (process.env.CLERK_FRONTEND_API
        ? process.env.CLERK_FRONTEND_API.replace(/\/$/, "")
        : null);
    const jwksUri =
      process.env.CLERK_JWKS_URI ||
      (issuer ? `${issuer}/.well-known/jwks.json` : null);
    return {
      provider: "clerk",
      issuer,
      audience: process.env.CLERK_JWT_AUDIENCE || null,
      jwksUri,
      orgClaim: process.env.AUTH_ORG_CLAIM || "org_id",
      defaultOrgId: process.env.AUTH_DEFAULT_ORG_ID || "org_fdg_demo",
    };
  }
  if (mode === "okta") {
    const issuer = (process.env.OKTA_ISSUER || "").replace(/\/$/, "");
    return {
      provider: "okta",
      issuer,
      audience: process.env.OKTA_AUDIENCE || process.env.OKTA_CLIENT_ID || null,
      jwksUri:
        process.env.OKTA_JWKS_URI ||
        (issuer ? `${issuer}/v1/keys` : null),
      orgClaim: process.env.AUTH_ORG_CLAIM || "org_id",
      defaultOrgId: process.env.AUTH_DEFAULT_ORG_ID || "org_fdg_demo",
    };
  }
  return null;
}

/**
 * Map IdP claims → app role.
 * Prefers explicit role claim, then group membership lists.
 */
export function mapRoleFromClaims(claims = {}) {
  const roleClaim = process.env.AUTH_ROLE_CLAIM || "role";
  const direct = String(claims[roleClaim] || claims.fnd_role || "")
    .toLowerCase()
    .trim();
  if (["admin", "controller", "accountant"].includes(direct)) return direct;

  // Clerk orgRole / publicMetadata
  const orgRole = String(
    claims.org_role || claims.organization_role || ""
  ).toLowerCase();
  if (orgRole.includes("admin")) return "admin";
  if (orgRole.includes("controller") || orgRole.includes("finance"))
    return "controller";
  if (orgRole.includes("accountant") || orgRole.includes("analyst"))
    return "accountant";

  const metaRole = String(claims.metadata?.role || claims.public_metadata?.role || "")
    .toLowerCase();
  if (["admin", "controller", "accountant"].includes(metaRole)) return metaRole;

  const groups = []
    .concat(claims.groups || [])
    .concat(claims.roles || [])
    .map((g) => String(g).toLowerCase());

  const adminGroup = (process.env.AUTH_GROUP_ADMIN || "findatagraph-admin").toLowerCase();
  const controllerGroup = (
    process.env.AUTH_GROUP_CONTROLLER || "findatagraph-controller"
  ).toLowerCase();
  const accountantGroup = (
    process.env.AUTH_GROUP_ACCOUNTANT || "findatagraph-accountant"
  ).toLowerCase();

  if (groups.some((g) => g === adminGroup || g.endsWith(adminGroup))) return "admin";
  if (groups.some((g) => g === controllerGroup || g.endsWith(controllerGroup)))
    return "controller";
  if (groups.some((g) => g === accountantGroup || g.endsWith(accountantGroup)))
    return "accountant";

  return process.env.AUTH_DEFAULT_ROLE || "accountant";
}

export function mapEntityIdsFromClaims(claims = {}) {
  const raw =
    claims.entity_ids ||
    claims.entities ||
    claims[process.env.AUTH_ENTITY_CLAIM || "entity_ids"] ||
    [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}
