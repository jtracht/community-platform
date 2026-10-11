import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { rows } from "../../../packages/database/index.js";
import { supportConfig } from "./support.js";
import type { LegalContent } from "./legal-content.js";
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function paragraphs(text: string) {
  return text.split(/\r?\n\s*\r?\n/).map((part) => {
    const lines = part.split(/\r?\n/);
    const heading = /^\d+\. /.test(lines[0] ?? "") ? lines.shift() : undefined;
    return (heading ? `<h2>${escape(heading)}</h2>` : "") +
      (lines.length ? `<p class="preserve">${escape(lines.join("\n"))}</p>` : "");
  }).join("\n");
}
export async function legalRoutes(app: FastifyInstance, legal: LegalContent) {
  app.get("/api/legal", async () => legal);
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
      operator: legal.operator || null,
    };
  });
  for (const [path, title, text] of [
    ["/impressum", "Impressum", legal.imprint],
    ["/datenschutz", "Datenschutz", legal.privacy],
    ["/beitraege", "Beiträge und Rechte", legal.contributions],
  ] as const)
    app.get(path, async (_, reply) =>
      reply
        .type("text/html")
        .send(
          '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
            title +
            ' · Communityplattform</title>' +
            (legal.reviewed ? "" : '<meta name="robots" content="noindex,nofollow">') +
            '<link rel="stylesheet" href="/assets/style.css"><link rel="stylesheet" href="/assets/design.css"></head><body class="survey-stage legal-page"><main><a href="/">← Zur Umfrage</a><h1>' +
            title +
            '</h1>' +
            (legal.reviewed ? "" : '<p class="legal-draft">Entwurf · Noch nicht für den Livegang freigegeben.</p>') +
            '<article>' + paragraphs(
              text ||
                "Vor dem Livegang werden geprüfte Betreiberangaben und Rechtstexte konfiguriert.",
            ) +
            '</article></main><footer><nav aria-label="Rechtliche Informationen"><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a><a href="/beitraege">Beiträge und Rechte</a></nav></footer></body></html>',
        ),
    );
}
