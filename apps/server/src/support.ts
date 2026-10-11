import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { z } from "zod";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sharedLimit } from "./limits.js";
export function supportConfig() {
  const secret = process.env.STRIPE_SECRET_KEY ?? "",
    publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? "";
  const mode = /^sk_(test|live)_[a-zA-Z0-9]+$/.exec(secret)?.[1];
  if (
    !mode ||
    !new RegExp("^pk_" + mode + "_[a-zA-Z0-9]+$").test(publishableKey)
  )
    return null;
  if (
    mode === "live" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.LEGAL_REVIEWED !== "true" ||
      !process.env.SITE_URL?.startsWith("https://"))
  )
    return null;
  return { secret, publishableKey };
}
function proof(id: string, owner: string, expires: number) {
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update("checkout:" + id + ":" + owner + ":" + expires)
    .digest("hex");
}
export async function supportRoutes(app: FastifyInstance) {
  app.post(
    "/api/support/session",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const body = z
        .object({
          amount: z.number().int().min(100).max(100000),
          requestId: z.uuid(),
        })
        .strict()
        .parse(req.body);
      const config = supportConfig();
      if (!config)
        return reply
          .code(503)
          .send({
            error:
              "Die Zahlung direkt auf dieser Seite ist noch nicht eingerichtet.",
          });
      if (!(await sharedLimit("support:" + req.ip, 5, 900)))
        return reply
          .code(429)
          .send({ error: "Bitte später erneut versuchen." });
      let owner = z.uuid().safeParse(req.cookies.support_owner).data;
      if (!owner) {
        owner = randomUUID();
        reply.setCookie("support_owner", owner, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
          maxAge: 3600,
        });
      }
      const stripe = new Stripe(config.secret, {
        apiVersion: "2026-09-30.endive",
        maxNetworkRetries: 1,
        timeout: 15000,
        httpClient: Stripe.createFetchHttpClient(),
      });
      try {
        const session = await stripe.checkout.sessions.create(
          {
            ui_mode: "embedded_page",
            mode: "payment",
            redirect_on_completion: "never",
            allowed_payment_method_types: ["card"],
            submit_type: "donate",
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "eur",
                  unit_amount: body.amount,
                  product_data: { name: "Freiwillige Projektunterstützung" },
                },
              },
            ],
          },
          { idempotencyKey: proof(body.requestId, owner, body.amount) },
        );
        if (!session.client_secret) throw new Error("Missing checkout secret");
        return {
          clientSecret: session.client_secret,
          id: session.id,
          expires: session.expires_at,
          proof: proof(session.id, owner, session.expires_at),
        };
      } catch {
        return reply
          .code(502)
          .send({
            error:
              "Das Zahlungsformular ist gerade nicht erreichbar. Es wurde keine Zahlung durch die Plattform ausgelöst.",
          });
      }
    },
  );
  app.post(
    "/api/support/status",
    { config: { rateLimit: { max: 20, timeWindow: "5 minutes" } } },
    async (req, reply) => {
      const body = z
        .object({
          id: z.string().regex(/^cs_(test_|live_)?[A-Za-z0-9]+$/),
          expires: z.number().int(),
          proof: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .parse(req.body);
      const owner = z.uuid().safeParse(req.cookies.support_owner).data;
      if (
        !owner ||
        body.expires < Math.floor(Date.now() / 1000) ||
        !timingSafeEqual(
          Buffer.from(body.proof, "hex"),
          Buffer.from(proof(body.id, owner, body.expires), "hex"),
        )
      )
        return reply
          .code(403)
          .send({ error: "Zahlungsstatus nicht zuordenbar." });
      const config = supportConfig();
      if (!config)
        return reply
          .code(503)
          .send({ error: "Zahlungsstatus nicht erreichbar." });
      try {
        const session = await new Stripe(config.secret, {
          apiVersion: "2026-09-30.endive",
          timeout: 15000,
          maxNetworkRetries: 1,
          httpClient: Stripe.createFetchHttpClient(),
        }).checkout.sessions.retrieve(body.id);
        return {
          paid:
            session.status === "complete" && session.payment_status === "paid",
        };
      } catch {
        return reply
          .code(502)
          .send({
            error:
              "Zahlungsstatus gerade nicht erreichbar. Bitte deine Stripe-Bestätigung prüfen.",
          });
      }
    },
  );
}
