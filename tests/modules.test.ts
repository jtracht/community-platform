import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ModuleRegistry,
  type Manifest,
} from "../packages/modules/src/index.js";
const polls: Manifest = {
  id: "polls",
  version: "1.0.0",
  apiVersion: 1,
  public: true,
  dependencies: [],
  permissions: ["poll.read"],
  health: async () => true,
};
test("Modules require known dependencies and explicit owner/community approvals", () => {
  const r = new ModuleRegistry();
  assert.throws(() =>
    r.register({ ...polls, id: "future", dependencies: ["missing"] }),
  );
  r.register(polls);
  assert.throws(() => r.register(polls));
  assert.equal(r.activate("polls", false, true).id, "polls");
  r.register({ ...polls, id: "future", dependencies: ["polls"] });
  assert.throws(() => r.activate("future", false, true));
  assert.throws(() => r.activate("future", true, false));
  assert.equal(r.activate("future", true, true).id, "future");
});
