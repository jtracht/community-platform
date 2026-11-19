import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildApp } from "../apps/server/src/app.js";
import { pool } from "../packages/database/index.js";
import { enrichHead, searchEnabled, searchOrigin } from "../apps/server/src/seo.js";
import type { LegalContent } from "../apps/server/src/legal-content.js";
after(async () => { await pool.end(); });
const legal: LegalContent = { operator: "Synthetic operator", address: "Synthetic address", email: "test@example.invalid",
  imprint: "Synthetic imprint", privacy: "Synthetic privacy", contributions: "Synthetic terms", reviewed: true };
const env = { NODE_ENV: "production", SEARCH_INDEXING_ENABLED: "true", SITE_URL: "https://community.example.org" };
test("Search metadata preserves visible body and rejects unsafe canonical origins or unfinished indexing", async () => {
  for (const page of ["index", "project"]) {
    const html = await readFile(`apps/public/${page}.html`, "utf8");
    const enriched = enrichHead(html, page === "index" ? "/" : "/ueber-das-projekt", env, legal);
    assert.equal(enriched.slice(enriched.indexOf("<body")), html.slice(html.indexOf("<body")));
    assert.equal(/<title>([^<]*)<\/title>/.exec(enriched)?.[1], /<title>([^<]*)<\/title>/.exec(html)?.[1]);
    assert.match(enriched, /rel="canonical"/);
    assert.match(enriched, /application\/ld\+json/);
    const schema = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(enriched)![1]!);
    assert.equal(schema["@graph"][0]["@type"], "WebSite");
    assert.ok(!JSON.stringify(schema).includes("FAQPage"));
  }
  for (const site of ["http://example.org", "https://localhost", "https://user:pass@example.org", "https://example.org/path", "https://example.invalid", "https://example.org/\nInjected: value"])
    assert.equal(searchOrigin({ SITE_URL: site }), null);
  for (const changed of [{ SEARCH_INDEXING_ENABLED: "false" }, { NODE_ENV: "development" }])
    assert.equal(searchEnabled({ ...env, ...changed }, legal), false);
  assert.equal(searchEnabled(env, { ...legal, reviewed: false }), false);
  assert.equal(searchEnabled(env, { ...legal, imprint: "ENTWURF" }), false);
});
test("HTTP search policy publishes only canonical public pages and keeps previews and private endpoints out", async () => {
  const original = { NODE_ENV: process.env.NODE_ENV, SEARCH_INDEXING_ENABLED: process.env.SEARCH_INDEXING_ENABLED, SITE_URL: process.env.SITE_URL };
  Object.assign(process.env, env);
  const app = await buildApp(legal);
  try {
    const root = await app.inject("/?utm_source=test");
    assert.equal(root.statusCode, 200);
    assert.match(root.body, /href="https:\/\/community.example.org\/"/);
    assert.equal(root.headers.link, '<https://community.example.org/>; rel="canonical"');
    const hostSpoof = await app.inject({ url: "/", headers: { host: "attacker.invalid" } });
    assert.ok(!hostSpoof.body.includes("attacker.invalid"));
    const robots = (await app.inject("/robots.txt")).body;
    assert.match(robots, /Allow: \/api\/poll\$/);
    assert.match(robots, /Disallow: \/admin/);
    assert.match(robots, /Sitemap: https:\/\/community.example.org\/sitemap.xml/);
    const sitemap = (await app.inject("/sitemap.xml")).body;
    assert.equal((sitemap.match(/<loc>/g) ?? []).length, 5);
    assert.ok(!sitemap.includes("/admin"));
    assert.ok(!sitemap.includes("lastmod"));
    const about = await app.inject("/ueber-das-projekt");
    assert.match(about.body, /"@type":"AboutPage"/);
    const privacy = await app.inject("/datenschutz");
    assert.match(privacy.body, /rel="canonical"/);
    assert.equal((await app.inject("/admin")).headers["x-robots-tag"], "noindex");
    assert.equal((await app.inject("/does-not-exist")).statusCode, 404);
    assert.equal((await app.inject("/does-not-exist")).headers["x-robots-tag"], "noindex");
    process.env.SEARCH_INDEXING_ENABLED = "false";
    assert.equal((await app.inject("/robots.txt")).body, "User-agent: *\nDisallow: /\n");
    assert.ok(!(await app.inject("/sitemap.xml")).body.includes("<loc>"));
    const preview = await app.inject("/");
    assert.equal(preview.headers["x-robots-tag"], "noindex, nofollow");
    assert.ok(!preview.body.includes('rel="canonical"'));
  } finally {
    await app.close();
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
