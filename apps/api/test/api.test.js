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

test("auth config exposes mode for Okta/Clerk/local", async () => {
  const res = await fetch(`${BASE}/auth/config`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(["local", "okta", "clerk"].includes(body.data.mode));
  assert.equal(typeof body.data.allow_local, "boolean");
});

test("SoD blocks proposer from approving own correction", async () => {
  const { token } = await login();
  const defs = await fetch(`${BASE}/reconciliations`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  await fetch(`${BASE}/reconciliations/${defs.data[0].id}/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const ex = await fetch(`${BASE}/exceptions?status=open`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert.ok(ex.data.length > 0);
  const target = ex.data.find((e) => Math.abs(e.variance || 0) >= 10000) || ex.data[0];

  const proposed = await fetch(`${BASE}/exceptions/${target.id}/corrections`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      correction_type: "adjustment",
      amount: 15000,
      note: "material SoD test",
    }),
  });
  assert.equal(proposed.status, 201);
  const corr = await proposed.json();

  const decide = await fetch(
    `${BASE}/exceptions/corrections/${corr.data.id}/decide`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: "approved" }),
    }
  );
  assert.equal(decide.status, 403);
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

test("evidence recorded when reconciliation runs", async () => {
  const { token } = await login();
  const defs = await fetch(`${BASE}/reconciliations`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const defId = defs.data[0].id;

  await fetch(`${BASE}/reconciliations/${defId}/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const ev = await fetch(`${BASE}/evidence`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert.ok(ev.data.length > 0);
  assert.ok(ev.data[0].content_hash);
  assert.ok(ev.data[0].policy_version);
});

test("jumpstart report returns scorecard and variance memo", async () => {
  const { token } = await login();
  const defs = await fetch(`${BASE}/reconciliations`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  await fetch(`${BASE}/reconciliations/${defs.data[0].id}/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const reportRes = await fetch(`${BASE}/reports/jumpstart`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(reportRes.status, 200);
  const report = await reportRes.json();
  assert.equal(report.data.kind, "jumpstart_diagnostic");
  assert.ok(report.data.scorecard);
  assert.ok(typeof report.data.scorecard.match_rate === "number");
  assert.ok(Array.isArray(report.data.exception_list));
  assert.ok(report.data.variance_memo.includes("Variance memo"));
  assert.ok(report.data.evidence_id);
});

test("connector stub sync and registry packages", async () => {
  const { token } = await login();
  const list = await fetch(`${BASE}/connectors`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert.ok(list.data.length >= 2);
  const sf = list.data.find((c) => c.code === "salesforce.billing.read");
  assert.ok(sf);

  const syncRes = await fetch(
    `${BASE}/connectors/salesforce.billing.read/sync`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  assert.equal(syncRes.status, 201);
  const sync = await syncRes.json();
  assert.equal(sync.data.status, "completed");
  assert.equal(sync.data.mode, "stub");
  assert.ok(sync.data.rows_staged >= 0);

  const agents = await fetch(`${BASE}/registry/agents`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert.ok(agents.data.some((a) => a.id === "peak.close.crm-gl-revenue"));
  assert.ok(
    agents.data.some((a) => a.id === "peak.collections.recommendation")
  );

  const pack = await fetch(
    `${BASE}/registry/agents/peak-close-crm-gl`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then((r) => r.json());
  assert.equal(pack.data.agent.id, "peak.close.crm-gl-revenue");
  assert.ok(pack.data.sipoc);
  assert.ok(pack.data.acceptance);
});

test("cluster run sequences connectors detect investigate report", async () => {
  const { token } = await login();
  const res = await fetch(`${BASE}/cluster/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.data.status, "completed");
  assert.ok(body.data.recon_run_id);
  assert.ok(body.data.report);
  const steps = body.data.steps.map((s) => s.step);
  assert.ok(steps.includes("connector_sync"));
  assert.ok(steps.includes("detect"));
  assert.ok(steps.includes("investigate"));
  assert.ok(steps.includes("resolve"));
  assert.ok(steps.includes("report"));
  const resolve = body.data.steps.find((s) => s.step === "resolve");
  assert.equal(resolve.status, "awaiting_human");
  const investigate = body.data.steps.find((s) => s.step === "investigate");
  assert.equal(investigate.retrieval_mode, "hybrid_structured_bm25");
  assert.ok(investigate.packs_with_hits >= 1);
});

test("snowflake stub sync succeeds without CONNECTOR_LIVE", async () => {
  const { token } = await login();
  const syncRes = await fetch(
    `${BASE}/connectors/snowflake.invoices.read/sync`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  assert.equal(syncRes.status, 201);
  const sync = await syncRes.json();
  assert.equal(sync.data.mode, "stub");
});

test("hybrid investigate retrieve returns staging citations", async () => {
  const { token } = await login();
  const res = await fetch(`${BASE}/investigate/retrieve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reference: "INV-1002",
      query: "amount mismatch revenue",
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.mode, "hybrid_structured_bm25");
  assert.ok(body.data.hit_count >= 1);
  assert.ok(body.data.citations.some((c) => c.includes("INV-1002")));
});
