import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data/test-sources.db");
const PORT = 4108;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;

let child;

async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("API did not become healthy");
}

before(async () => {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const seed = spawn("node", ["src/db/seed.js"], {
      cwd: root,
      env: { ...process.env, DATABASE_PATH: dbPath },
      stdio: "inherit",
    });
    seed.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("seed failed"))));
  });

  child = spawn("node", ["src/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PATH: dbPath,
      JWT_SECRET: "test-secret",
      CORS_ORIGIN: "http://localhost:5173",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForHealth();
});

after(() => {
  if (child) child.kill("SIGTERM");
});

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "controller@findatagraph.demo",
      password: "password123",
    }),
  });
  assert.equal(res.status, 200);
  return res.json();
}

test("lists warehouse source platforms and connections", async () => {
  const { token } = await login();
  const platforms = await fetch(`${BASE}/sources/platforms`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert.ok(platforms.data.includes("postgres"));
  assert.ok(platforms.data.includes("mysql"));
  assert.ok(platforms.data.includes("snowflake"));
  assert.ok(platforms.data.includes("databricks"));

  const sources = await fetch(`${BASE}/sources`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert.ok(sources.data.length >= 4);
});

test("fixture sync from postgres connection loads staging", async () => {
  const { token } = await login();
  const sources = await fetch(`${BASE}/sources`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const pg = sources.data.find((s) => s.platform === "postgres");
  assert.ok(pg);

  const testRes = await fetch(`${BASE}/sources/${pg.id}/test`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(testRes.status, 200);

  const syncRes = await fetch(`${BASE}/sources/${pg.id}/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(syncRes.status, 201);
  const sync = await syncRes.json();
  assert.equal(sync.data.status, "completed");
  assert.ok(sync.data.commercial_count >= 1);
  assert.ok(sync.data.gl_count >= 1);
});
