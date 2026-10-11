import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db/connection.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import entityRoutes from "./routes/entities.js";
import reconciliationRoutes from "./routes/reconciliations.js";
import exceptionRoutes from "./routes/exceptions.js";
import auditRoutes from "./routes/audit.js";
import userRoutes from "./routes/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

// Ensure DB + schema exist on boot
getDb();

const app = express();
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(
  cors({
    origin: CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "peak-close-api", version: "0.1.0" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/entities", entityRoutes);
app.use("/api/v1/reconciliations", reconciliationRoutes);
app.use("/api/v1/exceptions", exceptionRoutes);
app.use("/api/v1/audit", auditRoutes);
app.use("/api/v1/users", userRoutes);

// Optional: serve built web client in production single-host mode
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

app.listen(PORT, () => {
  console.log(`Peak Close API listening on http://localhost:${PORT}`);
});
