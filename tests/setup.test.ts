import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { pool, rows } from "../packages/database/index.js";
import { assertTestDatabase } from "../packages/database/testing.js";
import { setupSchema, setupEnvironment } from "../apps/server/src/setup.js";
import { buildApp } from "../apps/server/src/app.js";
import { digest } from "../apps/server/src/auth.js";
const enabled = process.env.TEST_MYSQL === "true";
if (enabled) assertTestDatabase();
after(async () => { await pool.end(); });
const settings = { siteUrl: "https://community.example.org", operatorName: "O'Neil # Beispiel",
  operatorAddress: "Teststraße 1", operatorEmail: "contact@example.invalid", retentionDays: 90,
  mailDailyLimit: 100, githubRepository: "example/community" };
test("Setup exports only allowlisted draft fields with injection-safe values and no legal approval", () => {
  assert.ok(setupSchema.safeParse(settings).success);
  const env = parseEnv(setupEnvironment(settings));
  assert.equal(env.OPERATOR_NAME, settings.operatorName);
  assert.equal(env.LEGAL_REVIEWED, "false");
  assert.equal(env.SESSION_SECRET, "");
  assert.equal(env.DATABASE_URL, "");
  for (const change of [{ operatorName: "name\nSESSION_SECRET=attack" }, { siteUrl: "https://user:password@example.org" },
    { siteUrl: "http://example.org" }, { retentionDays: 1 }, { operatorEmail: "bad" },
    { GITHUB_TOKEN: "secret" }, { operatorName: "both'quotes\"" }, { operatorAddress: "slash\\n" }])
    assert.equal(setupSchema.safeParse({ ...settings, ...change }).success, false);
});
test("Setup is owner-only, audits exports and prevents stale or concurrent configuration writes", { skip: !enabled }, async () => {
  process.env.SITE_URL = "http://localhost:3000";
  const initialOrigin = process.env.SITE_URL;
  const app = await buildApp();
  const headers: Record<string, { origin: string; cookie: string }> = {};
  for (const role of ["owner", "viewer"] as const) {
    const id = randomUUID(), token = randomBytes(32).toString("hex");
    await pool.execute("INSERT INTO admins(id,email,password_hash,totp_secret,role) VALUES(?,?,?,?,?)", [id, id + "@example.invalid", "fixture", "fixture", role]);
    await pool.execute("INSERT INTO sessions VALUES(?,?,?)", [digest(token), id, new Date(Date.now() + 600000)]);
    if (role === "viewer") await pool.execute("INSERT INTO admin_grants VALUES(?,?)", [id, "operations.manage"]);
    headers[role] = { origin: initialOrigin, cookie: "admin_session=" + token };
  }
  try {
    assert.equal((await app.inject("/api/admin/setup")).statusCode, 401);
    for (const path of ["/api/admin/setup", "/api/admin/setup/export", "/api/admin/setup/acceptance"])
      assert.equal((await app.inject({ url: path, headers: headers.viewer! })).statusCode, 403);
    const old = (await app.inject({ url: "/api/admin/setup", headers: headers.owner! })).json();
    const write = (confirmed: boolean) => app.inject({ method: "PUT", url: "/api/admin/setup", headers: headers.owner!, payload: { revision: old.revision, settings, confirmed } });
    assert.equal((await write(false)).statusCode, 400);
    const concurrent = await Promise.all([write(true), write(true)]);
    assert.deepEqual(concurrent.map(r => r.statusCode).sort(), [200, 409]);
    const current = (await app.inject({ url: "/api/admin/setup", headers: headers.owner! })).json();
    assert.deepEqual(current.settings, settings);
    assert.equal(current.revision, old.revision + 1);
    assert.equal(process.env.SITE_URL, initialOrigin);
    const exported = await app.inject({ url: "/api/admin/setup/export", headers: headers.owner! });
    assert.equal(exported.statusCode, 200);
    assert.equal(exported.headers["cache-control"], "no-store");
    assert.equal(parseEnv(exported.body).OPERATOR_NAME, settings.operatorName);
    assert.ok(!exported.body.includes(process.env.SESSION_SECRET!));
    assert.ok(!exported.body.includes(process.env.DATABASE_URL!));
    const acceptance = (await app.inject({ url: "/api/admin/setup/acceptance", headers: headers.owner! })).json();
    assert.ok(acceptance.checks.every((c: { status: string }) => c.status === "pending"));
    assert.ok((await rows("SELECT id FROM audit_events WHERE action='setup.draft_exported' AND target_id=?", [String(current.revision)])).length > 0);
    assert.equal((await app.inject({ method: "PUT", url: "/api/admin/setup", headers: headers.viewer!, payload: { revision: current.revision, settings, confirmed: true } })).statusCode, 403);
  } finally { await app.close(); }
});
