import jwt from "jsonwebtoken";
import { getDb } from "../db/connection.js";

const JWT_SECRET = () => process.env.JWT_SECRET || "dev-secret-change-me";

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      org_id: user.org_id,
      role: user.role,
      email: user.email,
    },
    JWT_SECRET(),
    { expiresIn: "12h" }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET());
    const user = getDb()
      .prepare(
        `SELECT id, org_id, email, name, role, entity_ids FROM users WHERE id = ?`
      )
      .get(payload.sub);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    user.entity_ids = JSON.parse(user.entity_ids || "[]");
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
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
