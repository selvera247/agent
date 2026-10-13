import jwt from "jsonwebtoken";
import { getDb } from "../db/connection.js";
import { allowLocalLogin, authMode } from "../lib/authConfig.js";
import { upsertUserFromOidc, verifyOidcToken } from "../lib/oidc.js";

const JWT_SECRET = () => process.env.JWT_SECRET || "dev-secret-change-me";

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      org_id: user.org_id,
      role: user.role,
      email: user.email,
      provider: "local",
    },
    JWT_SECRET(),
    { expiresIn: "12h" }
  );
}

function loadLocalUser(userId) {
  const user = getDb()
    .prepare(
      `SELECT id, org_id, email, name, role, entity_ids, auth_provider, external_id
       FROM users WHERE id = ?`
    )
    .get(userId);
  if (!user) return null;
  user.entity_ids = JSON.parse(user.entity_ids || "[]");
  return user;
}

async function authenticateBearer(token) {
  const mode = authMode();

  // 1) Local app JWT (demo / AUTH_ALLOW_LOCAL)
  if (allowLocalLogin()) {
    try {
      const payload = jwt.verify(token, JWT_SECRET());
      if (payload.provider === "local" || !payload.iss) {
        const user = loadLocalUser(payload.sub);
        if (user) return user;
      }
    } catch {
      // fall through to OIDC
    }
  }

  // 2) Preferred IdP: Okta or Clerk
  if (mode === "okta" || mode === "clerk") {
    const { claims, provider, settings } = await verifyOidcToken(token);
    return upsertUserFromOidc({ claims, provider, settings });
  }

  // 3) Local-only mode: require valid local JWT
  const payload = jwt.verify(token, JWT_SECRET());
  const user = loadLocalUser(payload.sub);
  if (!user) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return user;
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  Promise.resolve(authenticateBearer(token))
    .then((user) => {
      req.user = user;
      req.authToken = token;
      next();
    })
    .catch((err) => {
      const status = err.status || 401;
      res.status(status).json({
        error: status === 503 ? err.message : "Unauthorized",
      });
    });
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

/** Accountants only see their assigned entities */
export function entityFilterSql(user, alias = "e") {
  if (user.role === "accountant" && user.entity_ids.length > 0) {
    const placeholders = user.entity_ids.map(() => "?").join(",");
    return {
      clause: ` AND ${alias}.entity_id IN (${placeholders}) `,
      params: [...user.entity_ids],
    };
  }
  if (user.role === "accountant" && user.entity_ids.length === 0) {
    return { clause: " AND 1=0 ", params: [] };
  }
  return { clause: "", params: [] };
}
