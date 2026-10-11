import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { pool, rows, json } from "../packages/database/index.js";
import { assertTestDatabase } from "../packages/database/testing.js";
import { auditSnapshot, reviewSchema } from "../apps/server/src/security-reports.js";
import { buildApp } from "../apps/server/src/app.js";
import { digest } from "../apps/server/src/auth.js";

const enabled = process.env.TEST_MYSQL === "true";
if (enabled) assertTestDatabase();
after(async () => { await pool.end(); });

test("Security report audit bounds and explicit review validation never imply unperformed verification", () => {
  assert.equal(auditSnapshot([]).status, "valid");
  const event = { id: "test", actor_id: null, action: "test", target_id: "test", created_at: "2026-10-11 12:00:00.000", previous_hash: "invalid", event_hash: "invalid" };
  assert.equal(auditSnapshot([event]).status, "invalid");
  const large = auditSnapshot(Array.from({ length: 5001 }, () => event));
  assert.equal(large.status, "not_checked");
  assert.equal(large.checkedEvents, 0);
  assert.equal(large.endHash, null);
  const input = { title: "Testprüfung", topic: "permissions", outcome: "passed", notes: "Geprüft im Test", assignedTo: randomUUID(), confirmed: true };
  assert.ok(reviewSchema.safeParse(input).success);
  for (const change of [{ confirmed: false }, { notes: "" }, { outcome: "approved" }, { token: "not-allowed" }])
    assert.equal(reviewSchema.safeParse({ ...input, ...change }).success, false);
});

test("Owner-only reports preserve snapshots, audit exports and retain concurrent review history", { skip: !enabled }, async () => {
  process.env.SITE_URL = "http://localhost:3000";
  const app = await buildApp();
  const owner = randomUUID(), viewer = randomUUID();
  const headers: Record<string, { origin: string; cookie: string }> = {};
  for (const [id, role] of [[owner, "owner"], [viewer, "viewer"]] as const) {
    const token = randomBytes(32).toString("hex");
    await pool.execute("INSERT INTO admins(id,email,password_hash,totp_secret,role) VALUES(?,?,?,?,?)", [id, id + "@example.invalid", "fixture", "fixture", role]);
    await pool.execute("INSERT INTO sessions VALUES(?,?,?)", [digest(token), id, new Date(Date.now() + 600000)]);
    headers[role] = { origin: process.env.SITE_URL, cookie: "admin_session=" + token };
  }
  await pool.execute("INSERT INTO admin_grants VALUES(?,?)", [viewer, "operations.manage"]);
  const path = "/api/admin/security/reports";
  const request = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object, role = "owner") =>
    app.inject({ method, url, headers: headers[role]!, ...(payload ? { payload } : {}) });
  try {
    assert.equal((await app.inject(path)).statusCode, 401);
    assert.equal((await request("GET", path, undefined, "viewer")).statusCode, 403);
    assert.equal((await request("POST", path, { days: 7, confirmed: true }, "viewer")).statusCode, 403);
    assert.equal((await request("POST", path, { days: 7, confirmed: false })).statusCode, 400);
    const created = await request("POST", path, { days: 7, confirmed: true });
    assert.equal(created.statusCode, 200, created.body);
    const id = created.json().id;
    const detailPath = path + "/" + id;
    const initial = (await request("GET", detailPath)).json();
    assert.equal(initial.snapshot.days, 7);
    assert.equal(initial.snapshot.audit.status, "valid");
    const serialized = JSON.stringify(initial.snapshot);
    assert.ok(!serialized.includes("source_hash"));
    assert.ok(!serialized.includes(process.env.SESSION_SECRET!));
    assert.ok(!serialized.includes(process.env.DATABASE_URL!));
    const input = { title: "Berechtigungen geprüft", topic: "permissions", outcome: "failed", assignedTo: owner, notes: "Korrektur im Test erforderlich", confirmed: true };
    const first = await request("POST", detailPath + "/reviews", input);
    assert.equal(first.statusCode, 200, first.body);
    const oldId = first.json().id;
    const followed = await Promise.all(Array.from({ length: 2 }, () => request("POST", detailPath + "/reviews", { ...input, outcome: "passed", notes: "Nachprüfung erfolgreich", supersedesId: oldId })));
    assert.deepEqual(followed.map(r => r.statusCode).sort(), [200, 409]);
    const final = (await request("GET", detailPath)).json();
    assert.deepEqual(final.snapshot, initial.snapshot);
    assert.equal(final.reviews.length, 2);
    assert.equal(final.reviews.find((r: { id: string }) => r.id === oldId).outcome, "failed");
    assert.equal(Number(final.reviews.find((r: { id: string }) => r.id === oldId).superseded), 1);
    assert.equal((await request("POST", detailPath + "/reviews", { ...input, assignedTo: randomUUID() })).statusCode, 400);
    const other = (await request("POST", path, { days: 1, confirmed: true })).json().id;
    assert.equal((await request("POST", path + "/" + other + "/reviews", { ...input, supersedesId: oldId })).statusCode, 409);
    assert.equal((await request("GET", detailPath + "/export", undefined, "viewer")).statusCode, 403);
    const exported = await request("GET", detailPath + "/export");
    assert.equal(exported.statusCode, 200);
    assert.match(String(exported.headers["content-disposition"]), /attachment/);
    assert.equal(exported.headers["cache-control"], "no-store");
    assert.equal(exported.json().reviews.length, 2);
    assert.equal((await rows("SELECT id FROM audit_events WHERE action='security.report_exported' AND target_id=?", [id])).length, 1);
    assert.equal((await request("PATCH", detailPath, { snapshot: {} })).statusCode, 404);
    assert.equal((await request("DELETE", detailPath)).statusCode, 404);
    const stored = (await rows<{ snapshot: unknown }>("SELECT snapshot FROM security_reports WHERE id=?", [id]))[0]!;
    assert.deepEqual(json(stored.snapshot), initial.snapshot);
    const listed = await request("GET", path + "?page=0");
    assert.equal(listed.statusCode, 200);
    assert.ok(listed.json().reports.some((r: { id: string }) => r.id === id));
  } finally { await app.close(); }
});
