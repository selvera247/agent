#!/usr/bin/env node
/**
 * Planted-break eval harness for FinDataGraph recon MCP skill set.
 * Runs against a live API: sync fixture source → reconciliation → assert cases.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FinDataGraphClient } from "../client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const casesPath = path.join(__dirname, "cases.json");
const suite = JSON.parse(fs.readFileSync(casesPath, "utf8"));

const client = new FinDataGraphClient();

async function main() {
  console.log(`Eval: ${suite.name}`);
  console.log(`API: ${client.baseUrl}`);

  await client.request(`/sources/${suite.setup.source_connection_id}/sync`, {
    method: "POST",
  });
  console.log("Synced fixture source");

  const run = await client.request(
    `/reconciliations/${suite.setup.definition_id}/runs`,
    { method: "POST" }
  );
  console.log(
    `Run ${run.data.id}: matched=${run.data.matched_count} exceptions=${run.data.exception_count}`
  );

  const ex = await client.request("/exceptions");
  const byRef = new Map(ex.data.map((e) => [e.reference, e]));

  let pass = 0;
  const results = [];

  for (const c of suite.cases) {
    const found = byRef.get(c.expect.reference);
    const ok =
      found && found.exception_type === c.expect.exception_type;
    if (ok) pass += 1;
    results.push({
      id: c.id,
      name: c.name,
      pass: Boolean(ok),
      expected: c.expect,
      actual: found
        ? {
            id: found.id,
            reference: found.reference,
            exception_type: found.exception_type,
            variance: found.variance,
          }
        : null,
    });
    console.log(`${ok ? "PASS" : "FAIL"} ${c.id} ${c.name}`);
  }

  const report = {
    suite: suite.name,
    total: suite.cases.length,
    passed: pass,
    pass_rate: pass / suite.cases.length,
    run_id: run.data.id,
    results,
  };

  const outDir = path.join(__dirname, "../../exports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "eval_report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    `\nScore: ${pass}/${suite.cases.length} (${(report.pass_rate * 100).toFixed(0)}%)`
  );
  console.log(`Wrote ${outPath}`);

  if (pass !== suite.cases.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
