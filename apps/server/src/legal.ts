import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { rows } from "../../../packages/database/index.js";
import { supportConfig } from "./support.js";
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export async function legalRoutes(app: FastifyInstance) {
  app.get("/api/support", async () => {
    let url: string | null = null;
    try {
      const parsed = new URL(process.env.STRIPE_PAYMENT_LINK ?? "");
      if (
        parsed.protocol === "https:" &&
        ["buy.stripe.com", "donate.stripe.com"].includes(parsed.hostname) &&
        !parsed.username &&
        !parsed.password &&
        !parsed.port &&
        parsed.pathname !== "/" &&
        !(
          process.env.NODE_ENV === "production" &&
          parsed.pathname.startsWith("/test_")
        )
      )
        url = parsed.href;
    } catch {
      /* Missing or invalid links stay unavailable. */
    }
    const config = supportConfig();
    return {
      url,
      embedded: Boolean(config),
      publishableKey: config?.publishableKey ?? null,
    };
  });
  app.get("/ueber-das-projekt", async (_, reply) =>
    reply
      .type("text/html")
      .send(await readFile("apps/public/project.html", "utf8")),
  );
  app.get("/api/project", async () => {
    const stats = (
      await rows<{ polls: number; votes: number }>(
        `SELECT COUNT(*) AS polls,COALESCE(SUM(CASE WHEN p.released=TRUE THEN COALESCE((SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(d.result,'$.total')) AS UNSIGNED) FROM decisions d WHERE d.poll_id=p.id LIMIT 1),0) ELSE (SELECT COUNT(*) FROM votes v WHERE v.poll_id=p.id AND v.valid=TRUE) END),0) AS votes FROM polls p WHERE p.status IN ('active','closed','archived')`,
      )
    )[0]!;
    return {
      polls: Number(stats.polls),
      votes: Number(stats.votes),
      operator: process.env.OPERATOR_NAME ?? null,
    };
  });
  for (const [path, title, text] of [
    [
      "/impressum",
      "Impressum",
      () =>
        [
          process.env.OPERATOR_NAME,
          process.env.OPERATOR_ADDRESS,
          process.env.OPERATOR_EMAIL,
        ]
          .filter(Boolean)
          .join("\n"),
    ],
    ["/datenschutz", "Datenschutz", () => process.env.LEGAL_PRIVACY_TEXT ?? ""],
    [
      "/beitraege",
      "Beiträge und Rechte",
      () => process.env.LEGAL_CONTRIBUTION_TERMS ?? "",
    ],
  ] as const)
    app.get(path, async (_, reply) =>
      reply
        .type("text/html")
        .send(
          '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
            title +
            ' · Communityplattform</title><link rel="stylesheet" href="/assets/style.css"></head><body><header class="site-head"><a href="/">Zur Umfrage</a></header><main><h1>' +
            title +
            '</h1><p class="preserve">' +
            escape(
              text() ||
                "Vor dem Livegang werden geprüfte Betreiberangaben und Rechtstexte konfiguriert.",
            ) +
            '</p></main><footer><nav aria-label="Rechtliche Informationen"><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a><a href="/beitraege">Beiträge und Rechte</a></nav></footer></body></html>',
        ),
    );
}
