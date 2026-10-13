import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db/connection.js";
import { seedDatabase } from "./db/seed.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import entityRoutes from "./routes/entities.js";
import reconciliationRoutes from "./routes/reconciliations.js";
import exceptionRoutes from "./routes/exceptions.js";
import auditRoutes from "./routes/audit.js";
import userRoutes from "./routes/users.js";
import specRoutes from "./routes/specs.js";
import reportRoutes from "./routes/reports.js";
import evidenceRoutes from "./routes/evidence.js";
import connectorRoutes from "./routes/connectors.js";
import clusterRoutes from "./routes/cluster.js";
import registryRoutes from "./routes/registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

// Ensure DB + schema exist, then seed demo data if empty
getDb();
seedDatabase({ force: false });

const app = express();
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

const corsOrigins = CORS_ORIGIN.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.includes("*") ? true : corsOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "findatagraph-api", version: "0.1.0" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/entities", entityRoutes);
app.use("/api/v1/reconciliations", reconciliationRoutes);
app.use("/api/v1/exceptions", exceptionRoutes);
app.use("/api/v1/audit", auditRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/specs", specRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/evidence", evidenceRoutes);
app.use("/api/v1/connectors", connectorRoutes);
app.use("/api/v1/cluster", clusterRoutes);
app.use("/api/v1/registry", registryRoutes);

// Production: serve built web client from the same host
const webDist = path.join(__dirname, "../../web/dist");
app.use(express.static(webDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path === "/health") return next();
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FinDataGraph listening on http://0.0.0.0:${PORT}`);
});
