import { assertTestDatabase } from "../packages/database/testing.js";
if (process.env.TEST_MYSQL === "true") assertTestDatabase();
import type { Response as InjectResponse } from "light-my-request";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import {
  pool,
  rows,
  query,
  transaction,
  lockState,
  json,
} from "../packages/database/index.js";
import {
  createPoll,
  changePoll,
  current,
  vote,
} from "../apps/server/src/service.js";
import { buildApp } from "../apps/server/src/app.js";
import {
  digest,
  encrypt,
  decrypt,
  hashPassword,
} from "../apps/server/src/auth.js";
import { emailHash } from "../apps/server/src/participation.js";
import type { FastifyInstance } from "fastify";
const enabled = process.env.TEST_MYSQL === "true";
after(async () => {
  await pool.end();
});
test(
  "Verified participation, moderation, workflow, release gates and signed GitHub callbacks",
  { skip: !enabled },
  async () => {
    process.env.SITE_URL = "http://localhost:3000";
    process.env.SMTP_HOST = "test.invalid";
    process.env.SMTP_FROM = "test@example.invalid";
    process.env.GITHUB_REPOSITORY = "jtracht/community-platform";
    process.env.GITHUB_WEBHOOK_SECRET =
      "test-webhook-secret-at-least-32-characters";
    // This file runs independently of the concurrency suite; use a MySQL named lock to
    // serialize suites that intentionally operate on the same singleton official survey.
    const guard = await pool.getConnection();
    await guard.query("SELECT GET_LOCK('community-test-suites',60)");
    const app: FastifyInstance = await buildApp();
    const actor = randomUUID(),
      moderator = randomUUID(),
      ownerToken = randomBytes(32).toString("hex"),
      modToken = randomBytes(32).toString("hex");
    for (const [id, role, token] of [
      [actor, "owner", ownerToken],
      [moderator, "moderator", modToken],
    ] as const) {
      await pool.execute(
        "INSERT INTO admins(id,email,password_hash,totp_secret,role) VALUES(?,?,?,?,?)",
        [
          id,
          id + "@example.invalid",
          hashPassword("test-password-long-enough"),
          encrypt("JBSWY3DPEHPK3PXP"),
          role,
        ],
      );
      await pool.execute("INSERT INTO sessions VALUES(?,?,?)", [
        digest(token),
        id,
        new Date(Date.now() + 3600000),
      ]);
    }
    const owner = {
      origin: process.env.SITE_URL,
      cookie: "admin_session=" + ownerToken,
    };
    const mod = {
      origin: process.env.SITE_URL,
      cookie: "admin_session=" + modToken,
    };
    const clean = async () => {
      for (const p of await rows<{ id: string }>(
        "SELECT id FROM polls WHERE status IN ('active','scheduled')",
      ))
        await changePoll(p.id, "close", actor);
      await transaction(async (c) => {
        await lockState(c);
        await c.execute(
          "UPDATE platform_state SET paused=FALSE,transition_mode='results' WHERE id=1",
        );
        await c.execute(
          "UPDATE modules SET enabled=TRUE,version='1.0.0' WHERE id='polls'",
        );
      });
    };
    const input = (type: string, participation = "anonymous") => ({
      title: "Extended integration " + randomUUID(),
      description: "",
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 600000).toISOString(),
      rules: {
        type,
        options: type === "text" ? [] : ["A", "B"],
        participation,
        visibility: "after_release",
      },
    });
    try {
      await clean();
      for (const mode of ["email", "account"]) {
        const id = await createPoll(input("single", mode), actor);
        await changePoll(id, "schedule", actor);
        const guest: InjectResponse = await app.inject({
          method: "POST",
          url: "/api/poll/" + id + "/vote",
          headers: {
            origin: process.env.SITE_URL,
            cookie: "voter=" + randomUUID(),
          },
          payload: { answer: [0] },
        });
        assert.equal(guest.statusCode, 401);
        const email = randomUUID() + "@example.invalid";
        let cookie = "";
        for (let device = 0; device < 2; device++) {
          const request: InjectResponse = await app.inject({
            method: "POST",
            url: "/api/participation/request",
            headers: { origin: process.env.SITE_URL },
            payload: { pollId: id, email },
          });
          assert.equal(request.statusCode, 200);
          const jobs = await rows<{ payload_encrypted: string }>(
            "SELECT m.payload_encrypted FROM mail_jobs m JOIN verification_tokens t ON t.token_hash=m.verification_hash WHERE t.email_hash=? AND t.consumed=FALSE ORDER BY m.created_at DESC",
            [emailHash(email)],
          );
          const payload = JSON.parse(decrypt(jobs[0]!.payload_encrypted)) as {
            text: string;
          };
          const token = payload.text.match(/#verify=([a-f0-9]{64})/)![1]!;
          const verified: InjectResponse = await app.inject({
            method: "POST",
            url: "/api/participation/verify",
            headers: { origin: process.env.SITE_URL },
            payload: { token },
          });
          assert.equal(verified.statusCode, 200);
          cookie =
            "participant_session=" +
            verified.cookies.find((c) => c.name === "participant_session")!
              .value;
          const replay: InjectResponse = await app.inject({
            method: "POST",
            url: "/api/participation/verify",
            headers: { origin: process.env.SITE_URL },
            payload: { token },
          });
          assert.equal(replay.statusCode, 400);
          const submitted: InjectResponse = await app.inject({
            method: "POST",
            url: "/api/poll/" + id + "/vote",
            headers: { origin: process.env.SITE_URL, cookie },
            payload: { answer: [0] },
          });
          assert.equal(submitted.statusCode, device === 0 ? 200 : 409);
        }
        if (mode === "account") {
          const erased: InjectResponse = await app.inject({
            method: "DELETE",
            url: "/api/privacy/data",
            headers: { origin: process.env.SITE_URL, cookie },
            payload: { confirmed: true },
          });
          assert.equal(erased.statusCode, 200);
          assert.equal(
            (
              await rows("SELECT id FROM participants WHERE email_hash=?", [
                emailHash(email),
              ])
            ).length,
            0,
          );
        }
        await changePoll(id, "close", actor);
      }
      const text = await createPoll(input("text"), actor);
      await changePoll(text, "schedule", actor);
      const voter = randomUUID();
      await vote(text, voter, "Accessibilité pour tous.");
      await vote(text, randomUUID(), "Transparence des décisions.");
      const ideas = await rows<{ id: string }>(
        "SELECT id FROM ideas WHERE poll_id=?",
        [text],
      );
      const approve = await app.inject({
        method: "POST",
        url: "/api/admin/ideas/batch",
        headers: mod,
        payload: {
          ids: ideas.map((i) => i.id),
          status: "approved",
          reason: "Manually reviewed contributions.",
        },
      });
      assert.equal(approve.statusCode, 200);
      const view = await app.inject({
        url: "/api/admin/dashboard",
        headers: mod,
      });
      assert.equal(view.statusCode, 200);
      assert.deepEqual(view.json().audit, []);
      const denied = await app.inject({
        method: "POST",
        url: "/api/admin/polls",
        headers: mod,
        payload: input("single"),
      });
      assert.equal(denied.statusCode, 403);
      const ownIdea = (
        await rows<{ id: string }>(
          "SELECT id FROM ideas WHERE poll_id=? AND original='Accessibilité pour tous.'",
          [text],
        )
      )[0]!;
      const appeal = await app.inject({
        method: "POST",
        url: "/api/privacy/appeal",
        headers: { origin: process.env.SITE_URL, cookie: "voter=" + voter },
        payload: {
          ideaId: ownIdea.id,
          content: "Please reconsider this moderation decision.",
        },
      });
      assert.equal(appeal.statusCode, 200);
      const merged = await app.inject({
        method: "POST",
        url: "/api/admin/ideas/" + ideas[0]!.id + "/merge",
        headers: mod,
        payload: { targetId: ideas[1]!.id, reason: "Two related suggestions." },
      });
      assert.equal(merged.statusCode, 200);
      await changePoll(text, "close", actor);
      await changePoll(text, "release", actor);
      const decision = (
        await rows<{ id: string; result: unknown }>(
          "SELECT id,result FROM decisions WHERE poll_id=?",
          [text],
        )
      )[0]!;
      const step = await app.inject({
        method: "PATCH",
        url: "/api/admin/decisions/" + decision.id,
        headers: owner,
        payload: {
          step: "planning",
          requirements: "Clarified requirements",
          reason: "Owner reviewed the requirement scope.",
        },
      });
      assert.equal(step.statusCode, 200);
      const task = await app.inject({
        method: "POST",
        url: "/api/admin/tasks",
        headers: owner,
        payload: {
          decisionId: decision.id,
          title: "Implement clarified requirement",
          priority: 4,
        },
      });
      assert.equal(task.statusCode, 200);
      const taskId = task.json().id;
      const taskPayload = {
        requirements: "Required behavior",
        priority: 4,
        status: "released",
        testStatus: "pending",
        version: "1.0.0",
        dependencies: [],
        releaseApproved: true,
      };
      const noTests = await app.inject({
        method: "PATCH",
        url: "/api/admin/tasks/" + taskId,
        headers: owner,
        payload: taskPayload,
      });
      assert.equal(noTests.statusCode, 400);
      const passed = await app.inject({
        method: "PATCH",
        url: "/api/admin/tasks/" + taskId,
        headers: owner,
        payload: { ...taskPayload, testStatus: "passed" },
      });
      assert.equal(passed.statusCode, 200);
      const disabled = await app.inject({
        method: "POST",
        url: "/api/admin/modules/polls/configure",
        headers: owner,
        payload: {
          version: "1.0.0",
          enabled: false,
          decisionId: null,
          confirmed: true,
        },
      });
      assert.equal(disabled.statusCode, 200);
      assert.equal((await current()).mode, "waiting");
      const restored = await app.inject({
        method: "POST",
        url: "/api/admin/modules/polls/configure",
        headers: owner,
        payload: {
          version: "1.0.0",
          enabled: true,
          decisionId: null,
          confirmed: true,
        },
      });
      assert.equal(restored.statusCode, 200);
      await pool.execute(
        "INSERT INTO github_links(decision_id,state,issue_number,title,body) VALUES(?,'created',42,'Test','Test body')",
        [decision.id],
      );
      const payload = {
        repository: { full_name: process.env.GITHUB_REPOSITORY },
        issue: {
          number: 42,
          title: "Changed on GitHub",
          body: "Changed content",
          state: "closed",
          updated_at: "2026-10-10T10:00:00Z",
          html_url: "https://github.com/jtracht/community-platform/issues/42",
        },
      };
      const raw = JSON.stringify(payload);
      const signature =
        "sha256=" +
        createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET)
          .update(raw)
          .digest("hex");
      const delivery = randomUUID();
      const bad = await app.inject({
        method: "POST",
        url: "/api/github/webhook",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": "sha256=" + "0".repeat(64),
          "x-github-delivery": delivery,
          "x-github-event": "issues",
        },
        payload: raw,
      });
      assert.equal(bad.statusCode, 401);
      for (let i = 0; i < 2; i++) {
        const hook = await app.inject({
          method: "POST",
          url: "/api/github/webhook",
          headers: {
            "content-type": "application/json",
            "x-hub-signature-256": signature,
            "x-github-delivery": delivery,
            "x-github-event": "issues",
          },
          payload: raw,
        });
        assert.equal(hook.statusCode, 200);
      }
      assert.equal(
        (
          await rows(
            "SELECT delivery_id FROM github_deliveries WHERE delivery_id=?",
            [delivery],
          )
        ).length,
        1,
      );
      assert.equal(
        (
          await rows<{ workflow_step: string }>(
            "SELECT workflow_step FROM decisions WHERE id=?",
            [decision.id],
          )
        )[0]!.workflow_step,
        "planning",
      );
      assert.deepEqual(
        json(
          (
            await rows("SELECT result FROM decisions WHERE id=?", [decision.id])
          )[0]!.result,
        ),
        json(decision.result),
      );
    } finally {
      await clean();
      await app.close();
      await guard.query("SELECT RELEASE_LOCK('community-test-suites')");
      guard.release();
    }
  },
);
