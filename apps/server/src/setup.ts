import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { rows, query, transaction, lockState, audit, json } from "../../../packages/database/index.js";
import { readinessReport } from "./readiness.js";
import { acceptanceTemplate, launchChecks } from "../../../packages/modules/launch-acceptance.js";

// Only non-secret deployment fields. No arbitrary keys or environment writes.
const text = (max: number) => z.string().trim().max(max)
  .refine(value => !/[\u0000-\u001f\u007f\\]/.test(value) && !(value.includes("'") && value.includes('"')));
export const setupSchema = z.object({
  siteUrl: text(250).refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return url.protocol === "https:" && value === url.origin
      && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname); } catch { return false; }
  }),
  operatorName: text(160), operatorAddress: text(500),
  operatorEmail: text(250).refine(value => !value || z.email().safeParse(value).success),
  retentionDays: z.number().int().min(7).max(3650).nullable(),
  mailDailyLimit: z.number().int().min(1).max(10000),
  githubRepository: text(200).refine(value => !value || /^[\w.-]+\/[\w.-]+$/.test(value)),
}).strict();

export type SetupSettings = z.infer<typeof setupSchema>;
const blank: SetupSettings = { siteUrl: "", operatorName: "", operatorAddress: "", operatorEmail: "",
  retentionDays: null, mailDailyLimit: 100, githubRepository: "" };
export function setupEnvironment(settings: SetupSettings) {
  settings = setupSchema.parse(settings);
  const quote = (value: string) => value.includes("'") ? '"' + value + '"' : "'" + value + "'";
  const values = { NODE_ENV: "production", SITE_URL: settings.siteUrl, OPERATOR_NAME: settings.operatorName,
    OPERATOR_ADDRESS: settings.operatorAddress, OPERATOR_EMAIL: settings.operatorEmail,
    RAW_VOTE_RETENTION_DAYS: settings.retentionDays === null ? "" : String(settings.retentionDays),
    MAIL_DAILY_LIMIT: String(settings.mailDailyLimit), GITHUB_REPOSITORY: settings.githubRepository,
    LEGAL_REVIEWED: "false", DATABASE_URL: "", SESSION_SECRET: "", SMTP_HOST: "", SMTP_PASSWORD: "",
    GITHUB_TOKEN: "", GITHUB_WEBHOOK_SECRET: "", STRIPE_SECRET_KEY: "", STRIPE_PUBLISHABLE_KEY: "" };
  return "# Einrichtungsentwurf: privat bearbeiten, nicht ungeprüft als .env übernehmen.\n"
    + "# Eigene Secrets und endgültige Rechtstextpfade gemäß .env.example ergänzen.\n"
    + Object.entries(values).map(([key, value]) => key + "=" + quote(value)).join("\n") + "\n";
}
async function draft() {
  const result = (await rows<{ revision: number; settings: unknown }>("SELECT revision,settings FROM setup_draft WHERE id=1"))[0]!;
  return { revision: result.revision, settings: setupSchema.parse({ ...blank, ...json<Partial<SetupSettings>>(result.settings) }) };
}
export async function setupRoutes(app: FastifyInstance) {
  app.get("/api/admin/setup", async () => ({ ...(await draft()),
    readiness: await readinessReport(process.env, rows),
    steps: launchChecks.map(([id, group, instruction]) => ({ id, group, instruction })),
  }));
  app.put("/api/admin/setup", async (req, reply) => {
    const input = z.object({ revision: z.number().int().min(0), settings: setupSchema, confirmed: z.literal(true) }).strict().parse(req.body);
    await transaction(async c => {
      await lockState(c);
      const current = (await query<{ revision: number }>(c, "SELECT revision FROM setup_draft WHERE id=1"))[0]!;
      if (current.revision !== input.revision) { reply.code(409); throw new Error("Entwurf wurde zwischenzeitlich geändert. Seite aktualisieren und Änderungen abgleichen."); }
      await c.execute("UPDATE setup_draft SET revision=revision+1,settings=?,updated_by=?,updated_at=UTC_TIMESTAMP(3) WHERE id=1", [JSON.stringify(input.settings), req.admin!.id]);
      await audit(c, req.admin!.id, "setup.draft_saved", String(current.revision + 1));
    });
    return { ok: true };
  });
  app.get("/api/admin/setup/export", async (req, reply) => {
    const value = await draft();
    await transaction(async c => { await lockState(c); await audit(c, req.admin!.id, "setup.draft_exported", String(value.revision)); });
    return reply.header("Content-Disposition", 'attachment; filename="setup.env.example"').type("text/plain; charset=utf-8").send(setupEnvironment(value.settings));
  });
  app.get("/api/admin/setup/acceptance", async (req, reply) => {
    const version = (JSON.parse(await readFile("package.json", "utf8")) as { version: string }).version;
    const record = acceptanceTemplate(version);
    try { const manifest = JSON.parse(await readFile("RELEASE.json", "utf8")); if (manifest.version === version) record.sourceCommit = manifest.commit; }
    catch { /* Source checkout: no release identity, manual package binding remains necessary. */ }
    await transaction(async c => { await lockState(c); await audit(c, req.admin!.id, "setup.acceptance_exported", version); });
    return reply.header("Content-Disposition", 'attachment; filename="launch-acceptance.json"').send(record);
  });
}
