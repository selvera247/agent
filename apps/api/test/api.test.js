import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data/test-findatagraph.db");
const PORT = 4107;
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

async function login(email = "controller@findatagraph.demo") {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  assert.equal(res.status, 200);
  return res.json();
}

test("login and dashboard", async () => {
  const { token, user } = await login();
  assert.equal(user.role, "controller");

  const dash = await fetch(`${BASE}/dashboard/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(dash.status, 200);
  const body = await dash.json();
  assert.ok("open_exceptions" in body);
});

test("run reconciliation creates exceptions", async () => {
  const { token } = await login();
  const defs = await fetch(`${BASE}/reconciliations`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  assert.ok(defs.data.length >= 1);
  const defId = defs.data[0].id;

  const runRes = await fetch(`${BASE}/reconciliations/${defId}/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(runRes.status, 201);
  const run = await runRes.json();
  assert.equal(run.data.status, "completed");
  assert.ok(run.data.exception_count > 0);

  const ex = await fetch(`${BASE}/exceptions`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert.ok(ex.data.length > 0);
});

test("accountant entity scope enforced", async () => {
  const { token } = await login("accountant@findatagraph.demo");
  const entities = await fetch(`${BASE}/entities`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert.ok(entities.data.every((e) => ["US-EAST", "US-WEST"].includes(e.code)));
});

test("spec studio seeded path reuses CRM_GL_REV", async () => {
  const { token } = await login();
  const gen = await fetch(`${BASE}/specs/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      starting_point_id: "crm_to_accounting_revenue",
      need: "continuous CRM-to-accounting revenue reconciliation with SOX lineage",
    }),
  });
  assert.equal(gen.status, 201);
  const generated = await gen.json();
  assert.equal(generated.data.package.path, "seeded");
  assert.ok(generated.data.package.reused_definition_id);

  const impl = await fetch(`${BASE}/specs/${generated.data.id}/implement`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(impl.status, 200);
  const implemented = await impl.json();
  assert.equal(implemented.data.status, "implemented");
  assert.equal(
    implemented.data.definition_id,
    generated.data.package.reused_definition_id
  );
});

test("spec studio CC auth path generates and runs", async () => {
  const { token } = await login();
  const gen = await fetch(`${BASE}/specs/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      need: "reconcile CC auth, settlements, and what we received",
    }),
  });
  assert.equal(gen.status, 201);
  const generated = await gen.json();
  assert.equal(generated.data.template_id, "cc_auth_settle_cash");
  assert.equal(generated.data.package.path, "generate");

  const impl = await fetch(`${BASE}/specs/${generated.data.id}/implement`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(impl.status, 200);
  const implemented = await impl.json();
  assert.equal(implemented.data.status, "implemented");
  assert.ok(implemented.data.definition_id);

  const runRes = await fetch(
    `${BASE}/reconciliations/${implemented.data.definition_id}/runs`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  assert.equal(runRes.status, 201);
  const run = await runRes.json();
  assert.equal(run.data.status, "completed");
  assert.ok(run.data.exception_count > 0);

  const usage = await fetch(`${BASE}/specs/usage`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert.ok(usage.data.credits_used > 0);
});
