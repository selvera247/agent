import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRoleFromClaims } from "../src/lib/authConfig.js";

test("mapRoleFromClaims prefers explicit role claim", () => {
  assert.equal(mapRoleFromClaims({ role: "controller" }), "controller");
  assert.equal(mapRoleFromClaims({ fnd_role: "admin" }), "admin");
});

test("mapRoleFromClaims maps Okta groups", () => {
  assert.equal(
    mapRoleFromClaims({ groups: ["findatagraph-controller", "everyone"] }),
    "controller"
  );
  assert.equal(
    mapRoleFromClaims({ groups: ["findatagraph-admin"] }),
    "admin"
  );
});

test("mapRoleFromClaims maps Clerk org_role", () => {
  assert.equal(mapRoleFromClaims({ org_role: "org:controller" }), "controller");
});
