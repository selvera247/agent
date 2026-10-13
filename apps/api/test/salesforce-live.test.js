import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data/test-sf-live.db");
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
    seed.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("seed failed"))
    );
  });

  child = spawn("node", ["src/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PATH: dbPath,
      JWT_SECRET: "test-secret",
      CORS_ORIGIN: "http://localhost:5173",
      CONNECTOR_LIVE: "1",
      SF_MODE: "sandbox",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForHealth();
});

after(() => {
  if (child) child.kill("SIGTERM");
});

test("CONNECTOR_LIVE sandbox pulls Salesforce fixture into staging", async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "controller@findatagraph.demo",
      password: "password123",
    }),
  }).then((r) => r.json());

  const syncRes = await fetch(
    `${BASE}/connectors/salesforce.billing.read/sync`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${login.token}` },
    }
  );
  assert.equal(syncRes.status, 201);
  const sync = await syncRes.json();
  assert.equal(sync.data.mode, "sandbox");
  assert.equal(sync.data.status, "completed");
  assert.ok(sync.data.rows_staged >= 7);

  const list = await fetch(`${BASE}/connectors`, {
    headers: { Authorization: `Bearer ${login.token}` },
  }).then((r) => r.json());
  const sf = list.data.find((c) => c.code === "salesforce.billing.read");
  assert.equal(sf.salesforce.mode, "sandbox");
  assert.ok(sf.staging_rows >= 7);
});
