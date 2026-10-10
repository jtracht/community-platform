import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  rows,
  query,
  transaction,
  lockState,
  audit,
  json,
} from "../../../packages/database/index.js";
const issueSchema = z.object({
  number: z.number().int(),
  state: z.enum(["open", "closed"]),
  title: z.string(),
  body: z.string().nullable(),
  updated_at: z.string(),
  html_url: z.url(),
});
export function githubRepo() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !/^[-\w.]+\/[-\w.]+$/.test(repo))
    throw new Error("GitHub-Repository nicht konfiguriert.");
  return repo;
}
export async function githubApi(path: string, options: RequestInit = {}) {
  if (!process.env.GITHUB_TOKEN) throw new Error("GitHub-Token fehlt.");
  const response = await fetch(
    "https://api.github.com/repos/" + githubRepo() + path,
    {
      ...options,
      headers: {
        Authorization: "Bearer " + process.env.GITHUB_TOKEN,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error("GitHub HTTP " + response.status);
  return response.json() as Promise<unknown>;
}
export async function syncGitHubDecision(id: string, actor: string | null) {
  const link = (
    await rows<{
      issue_number: number;
      state: string;
      remote_updated_at: string | null;
      title: string;
      body: string;
    }>("SELECT * FROM github_links WHERE decision_id=?", [id])
  )[0];
  if (!link || link.state !== "created")
    throw new Error("Verknüpfung ungeklärt.");
  try {
    const issue = issueSchema.parse(
      await githubApi("/issues/" + link.issue_number),
    );
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "UPDATE github_links SET remote_state=?,remote_updated_at=?,remote_snapshot=?,last_synced_at=UTC_TIMESTAMP(3),attempts=0,next_retry_at=NULL,last_error=NULL,conflict=? WHERE decision_id=?",
        [
          issue.state,
          issue.updated_at,
          JSON.stringify(issue),
          issue.title !== link.title || !issue.body?.startsWith(link.body),
          id,
        ],
      );
      await audit(c, actor, "github.snapshot_synced", id);
    });
    return issue;
  } catch (e) {
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "UPDATE github_links SET attempts=LEAST(attempts+1,5),next_retry_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE),last_error='GitHub-Abruf fehlgeschlagen; sichere GET-Wiederholung begrenzt auf fünf Versuche.' WHERE decision_id=?",
        [id],
      );
      await audit(c, actor, "github.sync_failed", id);
    });
    throw e;
  }
}
export async function scheduledGitHubSync() {
  const state = (
    await rows<{ github_sync_enabled: boolean }>(
      "SELECT github_sync_enabled FROM platform_state WHERE id=1",
    )
  )[0];
  if (!state?.github_sync_enabled || !process.env.GITHUB_TOKEN) return;
  for (const d of await rows<{ decision_id: string }>(
    "SELECT decision_id FROM github_links WHERE state='created' AND attempts<5 AND (next_retry_at IS NULL OR next_retry_at<=UTC_TIMESTAMP(3)) AND (last_synced_at IS NULL OR last_synced_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE)) LIMIT 10",
  )) {
    try {
      await syncGitHubDecision(d.decision_id, null);
    } catch {
      /* error persisted, no unbounded retry */
    }
  }
}
export async function githubManagementRoutes(app: FastifyInstance) {
  app.get("/api/admin/evaluations/:id/github-preview", async (req) => {
    const id = z.uuid().parse((req.params as { id: string }).id);
    const e = (
      await rows<{ content: string; sentiment: string; origin: string }>(
        "SELECT content,sentiment,origin FROM evaluations WHERE id=?",
        [id],
      )
    )[0];
    if (!e) throw new Error("Bewertung fehlt.");
    return {
      title: "Communitybewertung: " + e.sentiment,
      body:
        "## Bewertung\n\n" +
        e.content +
        "\n\n## Herkunft\n\n" +
        e.origin +
        "\n\nKeine automatische Produktionsfreigabe.",
      link:
        (
          await rows(
            "SELECT state,issue_url,remote_state,last_error FROM evaluation_github_links WHERE evaluation_id=?",
            [id],
          )
        )[0] ?? null,
    };
  });
  app.post("/api/admin/evaluations/:id/github", async (req) => {
    const id = z.uuid().parse((req.params as { id: string }).id);
    const p = z
      .object({
        title: z.string().min(3).max(200),
        body: z.string().min(10).max(10000),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    if (!process.env.GITHUB_TOKEN) throw new Error("GitHub-Token fehlt.");
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "INSERT INTO evaluation_github_links(evaluation_id,state,title,body) VALUES(?,'pending',?,?)",
        [id, p.title, p.body],
      );
      await audit(c, req.admin!.id, "github.evaluation_creation_approved", id);
    });
    try {
      const issue = issueSchema.parse(
        await githubApi("/issues", {
          method: "POST",
          body: JSON.stringify({
            title: p.title,
            body: p.body + "\n\n<!-- community-evaluation:" + id + " -->",
          }),
        }),
      );
      await transaction(async (c) => {
        await lockState(c);
        await c.execute(
          "UPDATE evaluation_github_links SET state='created',issue_number=?,issue_url=?,remote_state=? WHERE evaluation_id=?",
          [issue.number, issue.html_url, issue.state, id],
        );
        await audit(c, req.admin!.id, "github.evaluation_issue_created", id);
      });
      return { url: issue.html_url };
    } catch {
      await transaction(async (c) => {
        await lockState(c);
        await c.execute(
          "UPDATE evaluation_github_links SET state='uncertain',last_error='Erstellung ungeklärt; Bewertungsmarker manuell auf GitHub prüfen.' WHERE evaluation_id=?",
          [id],
        );
        await audit(c, req.admin!.id, "github.evaluation_issue_uncertain", id);
      });
      throw new Error(
        "GitHub-Erstellung ungeklärt. Keine automatische Wiederholung.",
      );
    }
  });
  app.get("/api/admin/decisions/:id/github-detail", async (req) => {
    const id = z.uuid().parse((req.params as { id: string }).id);
    return {
      issue:
        (
          await rows(
            "SELECT decision_id,state,issue_number,issue_url,remote_state,remote_snapshot,conflict,last_error,attempts FROM github_links WHERE decision_id=?",
            [id],
          )
        )[0] ?? null,
      pulls: await rows("SELECT * FROM github_pr_links WHERE decision_id=?", [
        id,
      ]),
    };
  });
  app.post("/api/admin/decisions/:id/github-refresh", async (req) =>
    syncGitHubDecision(
      z.uuid().parse((req.params as { id: string }).id),
      req.admin!.id,
    ),
  );
  app.post("/api/admin/decisions/:id/github-link", async (req) => {
    const id = z.uuid().parse((req.params as { id: string }).id);
    const p = z
      .object({
        number: z.number().int().positive(),
        confirmed: z.literal(true),
        reason: z.string().min(10).max(1000),
      })
      .parse(req.body);
    const issue = issueSchema.parse(await githubApi("/issues/" + p.number));
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "INSERT INTO github_links(decision_id,state,issue_number,issue_url,title,body,remote_state,remote_updated_at,remote_snapshot,last_synced_at) VALUES(?,'created',?,?,?,?,?,?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE state='created',issue_number=VALUES(issue_number),issue_url=VALUES(issue_url),title=VALUES(title),body=VALUES(body),remote_state=VALUES(remote_state),remote_updated_at=VALUES(remote_updated_at),remote_snapshot=VALUES(remote_snapshot),last_error=NULL,attempts=0,conflict=FALSE",
        [
          id,
          issue.number,
          issue.html_url,
          issue.title,
          issue.body ?? "",
          issue.state,
          issue.updated_at,
          JSON.stringify(issue),
        ],
      );
      await audit(c, req.admin!.id, "github.link_manually_approved", id);
    });
    return { ok: true };
  });
  app.post("/api/admin/decisions/:id/github-update", async (req) => {
    const id = z.uuid().parse((req.params as { id: string }).id);
    const p = z
      .object({
        title: z.string().min(3).max(200),
        body: z.string().min(10).max(10000),
        expectedUpdatedAt: z.string().max(50),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    const link = (
      await rows<{ issue_number: number; state: string }>(
        "SELECT issue_number,state FROM github_links WHERE decision_id=?",
        [id],
      )
    )[0];
    if (!link || link.state !== "created")
      throw new Error("GitHub-Verknüpfung fehlt.");
    const remote = issueSchema.parse(
      await githubApi("/issues/" + link.issue_number),
    );
    if (remote.updated_at !== p.expectedUpdatedAt)
      throw new Error(
        "GitHub wurde zwischenzeitlich geändert. Neue Vorschau prüfen.",
      );
    // GitHub has no compare-and-swap issue update. The preflight detects known conflicts;
    // a concurrent change during PATCH remains a documented API limitation.
    await transaction(async (c) => {
      await lockState(c);
      await audit(c, req.admin!.id, "github.update_explicitly_approved", id);
    });
    const updated = issueSchema.parse(
      await githubApi("/issues/" + link.issue_number, {
        method: "PATCH",
        body: JSON.stringify({ title: p.title, body: p.body }),
      }),
    );
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "UPDATE github_links SET title=?,body=?,remote_updated_at=?,remote_snapshot=?,last_synced_at=UTC_TIMESTAMP(3),conflict=FALSE WHERE decision_id=?",
        [p.title, p.body, updated.updated_at, JSON.stringify(updated), id],
      );
      await audit(c, req.admin!.id, "github.update_completed", id);
    });
    return { ok: true };
  });
  app.post("/api/admin/decisions/:id/github-pull", async (req) => {
    const id = z.uuid().parse((req.params as { id: string }).id);
    const p = z
      .object({
        number: z.number().int().positive(),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    const pull = z
      .object({
        number: z.number().int(),
        html_url: z.url(),
        state: z.string(),
        merged: z.boolean(),
      })
      .parse(await githubApi("/pulls/" + p.number));
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "INSERT INTO github_pr_links(decision_id,pull_number,url,remote_state,merged) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE remote_state=VALUES(remote_state),merged=VALUES(merged)",
        [id, pull.number, pull.html_url, pull.state, pull.merged],
      );
      await audit(c, req.admin!.id, "github.pull_linked", id);
    });
    return { ok: true };
  });
  app.post("/api/admin/github/settings", async (req) => {
    const p = z
      .object({ syncEnabled: z.boolean(), confirmed: z.literal(true) })
      .parse(req.body);
    if (p.syncEnabled && !process.env.GITHUB_TOKEN)
      throw new Error("GitHub-Token fehlt.");
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "UPDATE platform_state SET github_sync_enabled=? WHERE id=1",
        [p.syncEnabled],
      );
      await c.execute("UPDATE github_links SET attempts=0,next_retry_at=NULL");
      await audit(
        c,
        req.admin!.id,
        "github.sync_configuration_changed",
        "platform",
      );
    });
    return { ok: true };
  });
  await app.register(async (webhook) => {
    webhook.removeContentTypeParser("application/json");
    webhook.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_, body, done) => done(null, body),
    );
    webhook.post(
      "/api/github/webhook",
      {
        bodyLimit: 262144,
        config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      },
      async (req, reply) => {
        const raw = req.body as Buffer;
        const secret = process.env.GITHUB_WEBHOOK_SECRET;
        const signature = req.headers["x-hub-signature-256"];
        if (
          !secret ||
          typeof signature !== "string" ||
          !/^sha256=[a-f0-9]{64}$/.test(signature)
        ) {
          reply.code(401);
          throw new Error("Webhook-Signatur fehlt.");
        }
        const expected = createHmac("sha256", secret).update(raw).digest();
        if (
          !timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"))
        ) {
          reply.code(401);
          throw new Error("Webhook-Signatur ungültig.");
        }
        const payload = z
          .object({
            repository: z.object({ full_name: z.string() }),
            issue: issueSchema.optional(),
            pull_request: z
              .object({
                number: z.number().int(),
                state: z.string(),
                merged: z.boolean(),
              })
              .optional(),
          })
          .passthrough()
          .parse(JSON.parse(raw.toString("utf8")));
        if (payload.repository.full_name !== githubRepo())
          throw new Error("Falsches Repository.");
        const delivery = z
          .string()
          .min(1)
          .max(100)
          .parse(req.headers["x-github-delivery"]);
        const event = z
          .enum(["issues", "pull_request", "ping"])
          .parse(req.headers["x-github-event"]);
        await transaction(async (c) => {
          await lockState(c);
          if (
            (
              await query(
                c,
                "SELECT delivery_id FROM github_deliveries WHERE delivery_id=?",
                [delivery],
              )
            ).length
          )
            return;
          await c.execute(
            "INSERT INTO github_deliveries(delivery_id,event) VALUES(?,?)",
            [delivery, event],
          );
          if (event === "issues" && payload.issue) {
            await c.execute(
              "UPDATE github_links SET remote_state=?,remote_updated_at=?,remote_snapshot=?,conflict=TRUE WHERE issue_number=? AND (remote_updated_at IS NULL OR remote_updated_at<=?)",
              [
                payload.issue.state,
                payload.issue.updated_at,
                JSON.stringify(payload.issue),
                payload.issue.number,
                payload.issue.updated_at,
              ],
            );
          }
          if (event === "pull_request" && payload.pull_request) {
            await c.execute(
              "UPDATE github_pr_links SET remote_state=?,merged=? WHERE pull_number=?",
              [
                payload.pull_request.state,
                payload.pull_request.merged,
                payload.pull_request.number,
              ],
            );
          }
          await audit(c, null, "github.webhook_" + event, delivery);
        });
        return { ok: true };
      },
    );
  });
}
