import type { FastifyInstance } from "fastify";
import { assertProductionLegalContent, type LegalContent } from "./legal-content.js";

export const publicPages = ["/", "/ueber-das-projekt", "/impressum", "/datenschutz", "/beitraege"] as const;
export function searchOrigin(env: NodeJS.ProcessEnv) {
  try {
    const url = new URL(env.SITE_URL ?? "");
    if (url.protocol !== "https:" || env.SITE_URL !== url.origin ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || /\.(invalid|test|localhost)$/.test(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}
export function searchEnabled(env: NodeJS.ProcessEnv, legal: LegalContent) {
  if (env.SEARCH_INDEXING_ENABLED !== "true" || env.NODE_ENV !== "production" || !searchOrigin(env)) return false;
  try { assertProductionLegalContent(legal); return true; } catch { return false; }
}
function escape(value: string) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
export function enrichHead(html: string, path: string, env: NodeJS.ProcessEnv, legal: LegalContent) {
  const origin = searchOrigin(env), enabled = searchEnabled(env, legal);
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
  const description = /<meta\s+name="description"\s+content="([^"]*)"\s*\/?\s*>/i.exec(html)?.[1];
  // Reuse existing text; no invented branding, question answers or ratings.
  const additions = [
    `<meta name="robots" content="${enabled ? "index,follow,max-image-preview:large" : "noindex,nofollow"}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="de_DE">',
    `<meta property="og:title" content="${title}">`,
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${title}">`,
  ];
  if (description) additions.push(`<meta property="og:description" content="${description}">`, `<meta name="twitter:description" content="${description}">`);
  if (origin && enabled) {
    const url = origin + path;
    additions.push(`<link rel="canonical" href="${escape(url)}">`, `<meta property="og:url" content="${escape(url)}">`);
    const graph = [
      { "@type": "WebSite", "@id": origin + "/#website", url: origin + "/", name: "Gemeinsam entscheiden · Community-Umfrage", inLanguage: "de-DE" },
      { "@type": path === "/ueber-das-projekt" ? "AboutPage" : "WebPage", "@id": url + "#webpage", url,
        name: title, inLanguage: "de-DE", isPartOf: { "@id": origin + "/#website" } },
    ];
    additions.push('<script type="application/ld+json">' + JSON.stringify({ "@context": "https://schema.org", "@graph": graph })
      .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026") + '</script>');
  }
  // Only edit the head; body bytes, controls, styling and application scripts stay untouched.
  return html.replace(/<head>([\s\S]*?)<\/head>/i, (_, head: string) => '<head>'
    + head.replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?\s*>/gi, "")
    + additions.join("\n") + '</head>');
}
export async function searchRoutes(app: FastifyInstance, legal: LegalContent) {
  app.addHook("onSend", async (req, reply, payload) => {
    const path = req.url.split("?")[0]!;
    if (path === "/health" || reply.statusCode >= 400) reply.header("X-Robots-Tag", "noindex");
    if (!publicPages.includes(path as typeof publicPages[number]) || typeof payload !== "string" ||
      !String(reply.getHeader("content-type")).startsWith("text/html")) return payload;
    reply.header("Cache-Control", "no-store");
    if (!searchEnabled(process.env, legal)) reply.header("X-Robots-Tag", "noindex, nofollow");
    else reply.header("Link", `<${searchOrigin(process.env)! + path}>; rel="canonical"`);
    return enrichHead(payload, path, process.env, legal);
  });
  app.get("/robots.txt", async (_, reply) => {
    reply.type("text/plain; charset=utf-8").header("Cache-Control", "public, max-age=300");
    if (!searchEnabled(process.env, legal)) return "User-agent: *\nDisallow: /\n";
    return "User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /health\n"
      + "Allow: /api/poll$\nAllow: /api/project$\nAllow: /api/legal$\n"
      + "\nUser-agent: GPTBot\nUser-agent: CCBot\nUser-agent: ClaudeBot\nDisallow: /\n"
      + "\nSitemap: " + searchOrigin(process.env) + "/sitemap.xml\n";
  });
  app.get("/sitemap.xml", async (_, reply) => {
    reply.type("application/xml; charset=utf-8").header("Cache-Control", "public, max-age=300");
    const origin = searchOrigin(process.env);
    const entries = searchEnabled(process.env, legal) ? publicPages.map(path => `<url><loc>${escape(origin! + path)}</loc></url>`).join("") : "";
    return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + entries + '</urlset>';
  });
}
