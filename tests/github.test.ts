import { assertTestDatabase } from "../packages/database/testing.js";
if (process.env.TEST_MYSQL === "true") assertTestDatabase();
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { pool, rows } from "../packages/database/index.js";
import { createPoll, changePoll } from "../apps/server/src/service.js";
import { buildApp } from "../apps/server/src/app.js";
import { digest, hashPassword, encrypt } from "../apps/server/src/auth.js";
const enabled = process.env.TEST_MYSQL === "true";
after(async () => {
  await pool.end();
});
test(
  "GitHub write actions need explicit approval, resist duplicates and detect remote conflicts",
  { skip: !enabled },
  async () => {
    process.env.SITE_URL = "http://localhost:3000";
    process.env.GITHUB_REPOSITORY = "jtracht/community-platform";
    process.env.GITHUB_TOKEN = "test-only-no-real-token";
    const actor = randomUUID(),
      token = randomBytes(32).toString("hex");
    await pool.execute(
      "INSERT INTO admins(id,email,password_hash,totp_secret,role) VALUES(?,?,?,?,?)",
      [
        actor,
        actor + "@example.invalid",
        hashPassword("test-long-admin-password"),
        encrypt("JBSWY3DPEHPK3PXP"),
        "owner",
      ],
    );
    await pool.execute("INSERT INTO sessions VALUES(?,?,?)", [
      digest(token),
      actor,
      new Date(Date.now() + 3600000),
    ]);
    const headers = {
      origin: process.env.SITE_URL,
      cookie: "admin_session=" + token,
    };
    const id = await createPoll(
      {
        title: "GitHub contract test",
        description: "",
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 60000).toISOString(),
        rules: {
          type: "single",
          options: ["A", "B"],
          visibility: "hidden",
          participation: "anonymous",
        },
      },
      actor,
    );
    await changePoll(id, "schedule", actor);
    await changePoll(id, "close", actor);
    await changePoll(id, "release", actor);
    const decision = (
      await rows<{ id: string }>("SELECT id FROM decisions WHERE poll_id=?", [
        id,
      ])
    )[0]!.id;
    const app = await buildApp(),
      originalFetch = globalThis.fetch;
    let posts = 0,
      patches = 0;
    let remote = {
      number: 77,
      state: "open",
      title: "Approved title",
      body: "Approved public body",
      updated_at: "2026-10-10T12:00:00Z",
      html_url: "https://github.com/jtracht/community-platform/issues/77",
    };
    globalThis.fetch = async (url, init) => {
      assert.ok(
        String(url).startsWith(
          "https://api.github.com/repos/jtracht/community-platform/",
        ),
      );
      const method = init?.method ?? "GET";
      if (method === "POST") {
        posts++;
        const body = JSON.parse(String(init?.body));
        remote = { ...remote, title: body.title, body: body.body };
      }
      if (method === "PATCH") {
        patches++;
        const body = JSON.parse(String(init?.body));
        remote = {
          ...remote,
          title: body.title,
          body: body.body,
          updated_at: "2026-10-10T12:01:00Z",
        };
      }
      return new Response(JSON.stringify(remote), {
        status: method === "POST" ? 201 : 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const preview = await app.inject({
        url: "/api/admin/decisions/" + decision + "/github-preview",
        headers,
      });
      assert.equal(preview.statusCode, 200);
      assert.equal(posts, 0);
      const payload = {
        title: "Approved title",
        body: "Approved public body",
        labels: [],
        confirmed: false,
      };
      const denied = await app.inject({
        method: "POST",
        url: "/api/admin/decisions/" + decision + "/github",
        headers,
        payload,
      });
      assert.equal(denied.statusCode, 400);
      assert.equal(posts, 0);
      const created = await app.inject({
        method: "POST",
        url: "/api/admin/decisions/" + decision + "/github",
        headers,
        payload: { ...payload, confirmed: true },
      });
      assert.equal(created.statusCode, 200);
      assert.equal(posts, 1);
      const duplicate = await app.inject({
        method: "POST",
        url: "/api/admin/decisions/" + decision + "/github",
        headers,
        payload: { ...payload, confirmed: true },
      });
      assert.equal(duplicate.statusCode, 409);
      assert.equal(posts, 1);
      const refresh = await app.inject({
        method: "POST",
        url: "/api/admin/decisions/" + decision + "/github-refresh",
        headers,
      });
      assert.equal(refresh.statusCode, 200);
      const stale = await app.inject({
        method: "POST",
        url: "/api/admin/decisions/" + decision + "/github-update",
        headers,
        payload: {
          title: "Revised title",
          body: "Revised public description",
          expectedUpdatedAt: "old",
          confirmed: true,
        },
      });
      assert.equal(stale.statusCode, 400);
      assert.equal(patches, 0);
      const edited = await app.inject({
        method: "POST",
        url: "/api/admin/decisions/" + decision + "/github-update",
        headers,
        payload: {
          title: "Revised title",
          body: "Revised public description",
          expectedUpdatedAt: remote.updated_at,
          confirmed: true,
        },
      });
      assert.equal(edited.statusCode, 200);
      assert.equal(patches, 1);
      const evaluation = await app.inject({
        method: "POST",
        url: "/api/admin/evaluations",
        headers,
        payload: {
          decisionId: decision,
          sentiment: "negative",
          content: "A reviewed improvement request.",
          origin: "Recorded owner review",
        },
      });
      assert.equal(evaluation.statusCode, 200);
      const evaluationId = evaluation.json().id;
      const evalPreview = await app.inject({
        url: "/api/admin/evaluations/" + evaluationId + "/github-preview",
        headers,
      });
      assert.equal(evalPreview.statusCode, 200);
      assert.equal(posts, 1);
      const evalCreated = await app.inject({
        method: "POST",
        url: "/api/admin/evaluations/" + evaluationId + "/github",
        headers,
        payload: {
          title: evalPreview.json().title,
          body: evalPreview.json().body,
          confirmed: true,
        },
      });
      assert.equal(evalCreated.statusCode, 200);
      assert.equal(posts, 2);
      const evalDuplicate = await app.inject({
        method: "POST",
        url: "/api/admin/evaluations/" + evaluationId + "/github",
        headers,
        payload: {
          title: evalPreview.json().title,
          body: evalPreview.json().body,
          confirmed: true,
        },
      });
      assert.equal(evalDuplicate.statusCode, 409);
      assert.equal(posts, 2);
    } finally {
      globalThis.fetch = originalFetch;
      await app.close();
    }
  },
);
