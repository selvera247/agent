import { test } from "node:test";
import assert from "node:assert/strict";
import { toolResult } from "../src/client.js";

test("toolResult always includes governance envelope", () => {
  const res = toolResult(
    { ok: true },
    {
      humanGate: true,
      citations: [{ type: "exception_id", id: "exc_1" }],
    }
  );
  const body = JSON.parse(res.content[0].text);
  assert.equal(body.ok, true);
  assert.equal(body.governance.human_gate_required, true);
  assert.equal(body.governance.citations[0].id, "exc_1");
});
