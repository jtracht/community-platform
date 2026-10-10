import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  pool,
  rows,
  transaction,
  lockState,
  query,
} from "../packages/database/index.js";
import {
  createPoll,
  changePoll,
  current,
  vote,
  aggregate,
} from "../apps/server/src/service.js";
import { buildApp } from "../apps/server/src/app.js";
import { toPoll } from "../packages/database/index.js";
import { hashPassword, encrypt } from "../apps/server/src/auth.js";
import * as OTPAuth from "otpauth";
const enabled = process.env.TEST_MYSQL === "true";
after(async () => {
  await pool.end();
});
test(
  "MySQL: concurrency, immutable rules, visibility, phases and authorization",
  { skip: !enabled },
  async () => {
    process.env.SITE_URL = "http://localhost:3000";
    const actor = randomUUID();
    const data = {
      title: "Integration concurrency test",
      description: "",
      rules: {
        type: "single",
        options: ["A", "B"],
        participation: "anonymous",
        visibility: "after_release",
        quorum: 2,
        tieRule: "runoff",
      },
      startsAt: new Date(Date.now() - 10000).toISOString(),
      endsAt: new Date(Date.now() + 600000).toISOString(),
    };
    const ids = await Promise.all([
      createPoll(data, actor),
      createPoll(data, actor),
    ]);
    const published = await Promise.allSettled(
      ids.map((id) => changePoll(id, "schedule", actor)),
    );
    assert.equal(published.filter((r) => r.status === "fulfilled").length, 1);
    const active = await current();
    assert.equal(active.mode, "poll");
    const id = active.poll!.id;
    assert.equal(active.results, null);
    const voter = randomUUID();
    const votes = await Promise.allSettled(
      Array.from({ length: 12 }, () => vote(id, voter, [0])),
    );
    assert.equal(votes.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (await rows("SELECT id FROM votes WHERE poll_id=?", [id])).length,
      1,
    );
    await assert.rejects(() => vote(id, randomUUID(), [3]));
    await vote(id, randomUUID(), [1]);
    assert.equal((await current(voter)).results, null);
    const app = await buildApp();
    const forbidden = await app.inject({
      method: "POST",
      url: "/api/admin/polls",
      headers: { origin: "http://evil.invalid" },
      payload: data,
    });
    assert.equal(forbidden.statusCode, 403);
    const unauthorized = await app.inject({ url: "/api/admin/dashboard" });
    assert.equal(unauthorized.statusCode, 401);
    const html = await app.inject({ url: "/" });
    assert.equal(html.statusCode, 200);
    assert.ok(html.headers["content-security-policy"]);
    const adminId = randomUUID();
    const secret = new OTPAuth.Secret({ size: 20 });
    const password = "test-admin-long-password-only";
    const email = adminId + "@example.invalid";
    await pool.execute(
      "INSERT INTO admins(id,email,password_hash,totp_secret,role) VALUES(?,?,?,?,?)",
      [
        adminId,
        email,
        hashPassword(password),
        encrypt(secret.base32),
        "viewer",
      ],
    );
    const token = new OTPAuth.TOTP({ secret }).generate();
    const authenticated = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      headers: { origin: process.env.SITE_URL },
      payload: { email, password, token },
    });
    assert.equal(authenticated.statusCode, 200);
    const sessionCookie = authenticated.cookies.find(
      (c) => c.name === "admin_session",
    )!;
    assert.ok(sessionCookie.httpOnly);
    const replay = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      headers: { origin: process.env.SITE_URL },
      payload: { email, password, token },
    });
    assert.equal(replay.statusCode, 401);
    const cannotWrite = await app.inject({
      method: "POST",
      url: "/api/admin/polls",
      headers: {
        origin: process.env.SITE_URL,
        cookie: `admin_session=${sessionCookie.value}`,
      },
      payload: data,
    });
    assert.equal(cannotWrite.statusCode, 403);
    await changePoll(id, "close", actor);
    await changePoll(id, "release", actor);
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "UPDATE platform_state SET transition_mode='results' WHERE id=1",
      );
    });
    const released = await current();
    assert.equal(released.results?.total, 2);
    assert.equal(released.results?.tie, true);
    assert.equal(released.results?.runoffRequired, true);
    await assert.rejects(() => changePoll(id, "release", actor));
    assert.equal(
      (await rows("SELECT id FROM decisions WHERE poll_id=?", [id])).length,
      1,
    );
    await assert.rejects(() => vote(id, randomUUID(), [0]));
    const exported = await app.inject({
      url: "/api/privacy/export",
      headers: { cookie: `voter=${voter}` },
    });
    assert.equal(exported.statusCode, 200);
    assert.equal(exported.json().entries.length, 1);
    const erasure = await app.inject({
      method: "DELETE",
      url: "/api/privacy/data",
      headers: { origin: process.env.SITE_URL, cookie: `voter=${voter}` },
      payload: { confirmed: true },
    });
    assert.equal(erasure.statusCode, 200);
    assert.equal(
      (await rows("SELECT id FROM votes WHERE poll_id=?", [id])).length,
      1,
    );
    assert.equal(
      (await current()).results?.total,
      2,
      "Released aggregates remain immutable after privacy erasure",
    );
    await app.close();
    // Leave test data for inspection only in dedicated test database; never run against production.
  },
);
