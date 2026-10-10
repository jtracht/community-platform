import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../apps/server/src/app.js";
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
