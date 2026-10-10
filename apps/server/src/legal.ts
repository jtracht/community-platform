import type { FastifyInstance } from "fastify";
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
