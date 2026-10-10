import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../apps/server/src/app.js";
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "../packages/database/testing.js";
import { pool } from "../packages/database/index.js";
test("Support uses approved Stripe hosts and never exposes production test payments", async () => {
  const saved = {
    link: process.env.STRIPE_PAYMENT_LINK,
    mode: process.env.NODE_ENV,
  };
  const app = await buildApp();
  try {
    for (const link of [
      "",
      "javascript:alert(1)",
      "https://buy.stripe.com.evil.example/payment",
      "https://user@buy.stripe.com/payment",
      "http://buy.stripe.com/payment",
    ]) {
      process.env.STRIPE_PAYMENT_LINK = link;
      assert.equal((await app.inject("/api/support")).json().url, null);
    }
    for (const host of ["buy.stripe.com", "donate.stripe.com"]) {
      process.env.STRIPE_PAYMENT_LINK = "https://" + host + "/example";
      assert.equal(
        (await app.inject("/api/support")).json().url,
        process.env.STRIPE_PAYMENT_LINK,
      );
    }
    process.env.NODE_ENV = "production";
    process.env.STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_example";
    assert.equal((await app.inject("/api/support")).json().url, null);
  } finally {
    if (saved.link === undefined) delete process.env.STRIPE_PAYMENT_LINK;
    else process.env.STRIPE_PAYMENT_LINK = saved.link;
    if (saved.mode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved.mode;
    await app.close();
  }
});
test(
  "Embedded support validates amounts, preserves retries and binds paid status to its browser",
  { skip: process.env.TEST_MYSQL !== "true" },
  async () => {
    assertTestDatabase();
    const saved = {
      key: process.env.STRIPE_SECRET_KEY,
      pub: process.env.STRIPE_PUBLISHABLE_KEY,
      mode: process.env.NODE_ENV,
      site: process.env.SITE_URL,
    };
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_fixture";
    process.env.NODE_ENV = "development";
    process.env.SITE_URL = "http://localhost:3000";
    const originalFetch = globalThis.fetch;
    const calls: Array<{
      method: string;
      body: URLSearchParams;
      key: string | null;
    }> = [];
    globalThis.fetch = async (input, init) => {
      assert.ok(String(input).startsWith("https://api.stripe.com/"));
      const headers = new Headers(init?.headers);
      calls.push({
        method: init?.method ?? "GET",
        body: new URLSearchParams(String(init?.body ?? "")),
        key: headers.get("Idempotency-Key"),
      });
      return new Response(
        JSON.stringify({
          id: "cs_test_fixture",
          client_secret: "cs_test_fixture_secret_fixture",
          expires_at: Math.floor(Date.now() / 1000) + 1800,
          status: "complete",
          payment_status: "paid",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const app = await buildApp();
    const requestId = randomUUID();
    const headers = { origin: process.env.SITE_URL };
    const remoteAddress = "192.0.2." + (Math.floor(Math.random() * 240) + 1);
    try {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/support/session",
        headers,
        payload: { amount: 99, requestId },
        remoteAddress,
      });
      assert.equal(invalid.statusCode, 400);
      assert.equal(calls.length, 0);
      const first = await app.inject({
        method: "POST",
        url: "/api/support/session",
        headers,
        payload: { amount: 500, requestId },
        remoteAddress,
      });
      assert.equal(first.statusCode, 200, first.body);
      const cookie = first.cookies.find((c) => c.name === "support_owner")!;
      assert.ok(cookie.httpOnly);
      const owner = cookie.name + "=" + cookie.value;
      const second = await app.inject({
        method: "POST",
        url: "/api/support/session",
        headers: { ...headers, cookie: owner },
        payload: { amount: 500, requestId },
        remoteAddress,
      });
      assert.equal(second.statusCode, 200);
      assert.equal(calls[0]!.key, calls[1]!.key);
      assert.equal(calls[0]!.body.get("ui_mode"), "embedded_page");
      assert.equal(calls[0]!.body.get("redirect_on_completion"), "never");
      assert.equal(
        calls[0]!.body.get("allowed_payment_method_types[0]"),
        "card",
      );
      assert.equal(
        calls[0]!.body.get("line_items[0][price_data][unit_amount]"),
        "500",
      );
      const { id, expires, proof } = first.json();
      const denied = await app.inject({
        method: "POST",
        url: "/api/support/status",
        headers,
        payload: { id, expires, proof },
      });
      assert.equal(denied.statusCode, 403);
      assert.equal(calls.length, 2);
      const confirmed = await app.inject({
        method: "POST",
        url: "/api/support/status",
        headers: { ...headers, cookie: owner },
        payload: { id, expires, proof },
      });
      assert.equal(confirmed.statusCode, 200, confirmed.body);
      assert.equal(confirmed.json().paid, true);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries({
        STRIPE_SECRET_KEY: saved.key,
        STRIPE_PUBLISHABLE_KEY: saved.pub,
        NODE_ENV: saved.mode,
        SITE_URL: saved.site,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await app.close();
      await pool.end();
    }
  },
);
