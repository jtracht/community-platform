import { test } from "node:test";
import assert from "node:assert/strict";
import {
  grants,
  requiredPermission,
} from "../packages/modules/src/permissions.js";
test("Critical owner permissions cannot be granted to other roles", () => {
  assert.ok(grants("moderator").includes("ideas.moderate"));
  assert.ok(
    !grants("moderator", ["github.manage", "users.manage"]).includes(
      "github.manage",
    ),
  );
  assert.ok(grants("viewer", ["ideas.read"]).includes("ideas.read"));
  assert.equal(
    requiredPermission("POST", "/api/admin/decisions/x/github"),
    "github.manage",
  );
  assert.equal(
    requiredPermission("PATCH", "/api/admin/ideas/x"),
    "ideas.moderate",
  );
});
