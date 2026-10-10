import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { z, ZodError } from "zod";
import {
  rows,
  query,
  transaction,
  lockState,
  audit,
  toPoll,
  json,
} from "../../../packages/database/index.js";
import {
  current,
  vote,
  createPoll,
  changePoll,
  aggregate,
  voterHash,
} from "./service.js";
import { digest, verifyPassword, decrypt, verifyTotp } from "./auth.js";
import { identity, participationRoutes } from "./participation.js";
import {
  grants,
  requiredPermission,
  type Permission,
} from "../../../packages/modules/src/permissions.js";
import { workflowRoutes } from "./workflow.js";
import { githubManagementRoutes } from "./github.js";
import { sharedLimit } from "./limits.js";
import { legalRoutes } from "./legal.js";
type Admin = {
  id: string;
  email: string;
  role: "owner" | "moderator" | "viewer";
  permissions: Permission[];
};
declare module "fastify" {
  interface FastifyRequest {
    admin: Admin | null;
  }
}
const uuid = z.uuid();
export async function buildApp() {
  const app = Fastify({
    bodyLimit: 16384,
    trustProxy: process.env.TRUSTED_PROXY
      ? process.env.TRUSTED_PROXY.split(",").map((x) => x.trim())
      : false,
    logger:
      process.env.TEST_MYSQL === "true"
        ? false
        : {
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              "body.password",
              "body.token",
            ],
          },
  });
  app.decorateRequest("admin", null);
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(staticPlugin, {
    root: resolve("apps/public"),
    prefix: "/assets/",
    index: false,
  });
  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0]!;
    if (
      req.method === "POST" &&
      (path === "/api/admin/login" ||
        path === "/api/participation/request" ||
        /^\/api\/poll\/[^/]+\/vote$/.test(path))
    ) {
      const sensitive =
        path === "/api/admin/login" || path === "/api/participation/request";
      if (
        !(await sharedLimit(
          req.ip + ":" + path,
          sensitive ? 15 : 100,
          sensitive ? 900 : 60,
        ))
      ) {
        reply.code(429);
        throw new Error("Zu viele Anfragen. Bitte später erneut versuchen.");
      }
    }
    if (req.url.startsWith("/api/") || req.url.startsWith("/admin"))
      reply
        .header("Cache-Control", "no-store")
        .header("X-Robots-Tag", "noindex");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.url.split("?")[0] !== "/api/github/webhook" &&
      req.headers.origin !== process.env.SITE_URL
    ) {
      reply.code(403);
      throw new Error("Anfrageursprung nicht erlaubt.");
    }
    if (req.url.startsWith("/api/admin/") && req.url !== "/api/admin/login") {
      const token = req.cookies.admin_session;
      const admin = token
        ? (
            await rows<Admin>(
              "SELECT a.id,a.email,a.role FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3) AND a.disabled=FALSE",
              [digest(token)],
            )
          )[0]
        : undefined;
      if (!admin) {
        reply.code(401);
        throw new Error("Anmeldung erforderlich.");
      }
      req.admin = admin;
      admin.permissions = grants(
        admin.role,
        (
          await rows<{ permission: Permission }>(
            "SELECT permission FROM admin_grants WHERE admin_id=?",
            [admin.id],
          )
        ).map((g) => g.permission),
      );
      if (
        !admin.permissions.includes(
          requiredPermission(req.method, req.url.split("?")[0]!),
        )
      ) {
        reply.code(403);
        throw new Error("Product-Owner-Recht erforderlich.");
      }
    }
  });
  app.setErrorHandler(async (error, req, reply) => {
    const e = error as Error & { code?: string; statusCode?: number };
    const status =
      e.code === "ER_DUP_ENTRY"
        ? 409
        : e instanceof ZodError
          ? 400
          : reply.statusCode >= 400
            ? reply.statusCode
            : e.code?.startsWith("ER_") || e.code === "ECONNREFUSED"
              ? 503
              : (e.statusCode ?? 400);
    if (status >= 500) req.log.error({ code: e.code }, "Serverfehler");
    if ([401, 403, 429].includes(status)) {
      try {
        const source = createHmac("sha256", process.env.SESSION_SECRET!)
          .update(
            "security:" + req.ip + ":" + new Date().toISOString().slice(0, 10),
          )
          .digest("hex");
        await rows(
          "INSERT INTO security_events(id,status,path,source_hash) VALUES(?,?,?,?)",
          [randomUUID(), status, req.url.split("?")[0]!.slice(0, 200), source],
        );
      } catch {
        /* A logging failure must not weaken authorization. */
      }
    }
    reply.code(status).send({
      error:
        status >= 500
          ? "Technischer Fehler. Bitte später erneut versuchen."
          : e.code === "ER_DUP_ENTRY"
            ? "Bereits gespeichert oder bereits abgestimmt."
            : e instanceof ZodError
              ? "Eingaben prüfen."
              : e.message,
    });
  });
  app.get("/", async (_, reply) =>
    reply
      .type("text/html")
      .send(await readFile("apps/public/index.html", "utf8")),
  );
  app.get("/admin", async (_, reply) =>
    reply
      .type("text/html")
      .send(await readFile("apps/admin/index.html", "utf8")),
  );
  app.get("/admin/app.js", async (_, reply) =>
    reply
      .type("text/javascript")
      .send(await readFile("apps/admin/app.js", "utf8")),
  );
  app.get("/health", async () => {
    await rows("SELECT 1");
    return { status: "ok" };
  });
  app.get("/robots.txt", async (_, reply) =>
    reply
      .type("text/plain")
      .send("User-agent: *\nDisallow: /admin\nDisallow: /api/\n"),
  );
  app.get("/api/legal", async () => ({
    operator: process.env.OPERATOR_NAME ?? "",
    address: process.env.OPERATOR_ADDRESS ?? "",
    email: process.env.OPERATOR_EMAIL ?? "",
    privacy: process.env.LEGAL_PRIVACY_TEXT ?? "",
    contributions: process.env.LEGAL_CONTRIBUTION_TERMS ?? "",
    reviewed: process.env.LEGAL_REVIEWED === "true",
  }));
  app.get("/api/privacy/export", async (req, reply) => {
    const entries = [];
    const session = req.cookies.participant_session
      ? (
          await rows<{ participant_id: string | null }>(
            "SELECT participant_id FROM participant_sessions WHERE token_hash=? AND expires_at>UTC_TIMESTAMP(3)",
            [digest(req.cookies.participant_session)],
          )
        )[0]
      : undefined;
    const storedAccount = session?.participant_id
      ? (
          await rows<{ email_encrypted: string; verified_at: string }>(
            "SELECT email_encrypted,verified_at FROM participants WHERE id=?",
            [session.participant_id],
          )
        )[0]
      : undefined;
    for (const p of await rows<{ id: string; title: string; rules: unknown }>(
      "SELECT id,title,rules FROM polls",
    )) {
      const voter = await identity(
        req,
        p.id,
        json<{ participation: string }>(p.rules).participation,
      );
      if (!voter) continue;
      const v = (
        await rows<{ id: string; answer: unknown; created_at: string }>(
          "SELECT id,answer,created_at FROM votes WHERE poll_id=? AND voter_hash=?",
          [p.id, voterHash(voter, p.id)],
        )
      )[0];
      if (v)
        entries.push({
          poll: p.title,
          submittedAt: v.created_at,
          answer: json(v.answer),
          ideas: await rows(
            "SELECT id,original,content,status,category FROM ideas WHERE vote_id=?",
            [v.id],
          ),
          history: await rows(
            "SELECT h.previous_content,h.next_content,h.reason,h.created_at FROM idea_history h JOIN ideas i ON i.id=h.idea_id WHERE i.vote_id=? ORDER BY h.created_at",
            [v.id],
          ),
          appeals: await rows(
            "SELECT a.content,a.status,a.response,a.created_at FROM idea_appeals a JOIN ideas i ON i.id=a.idea_id WHERE i.vote_id=? ORDER BY a.created_at",
            [v.id],
          ),
        });
    }
    reply.header(
      "Content-Disposition",
      'attachment; filename="community-data.json"',
    );
    return {
      exportedAt: new Date().toISOString(),
      scope:
        "Beiträge der vorhandenen Browseridentität und aktuellen Verifizierung. Anonyme Beiträge anderer Browser können nicht zugeordnet werden.",
      account: storedAccount
        ? {
            email: decrypt(storedAccount.email_encrypted),
            verifiedAt: storedAccount.verified_at,
          }
        : null,
      entries,
    };
  });
  app.delete("/api/privacy/data", async (req, reply) => {
    const identityMap = new Map<string, string>();
    for (const p of await rows<{ id: string; rules: unknown }>(
      "SELECT id,rules FROM polls",
    )) {
      const key = await identity(
        req,
        p.id,
        json<{ participation: string }>(p.rules).participation,
      );
      if (key) identityMap.set(p.id, key);
    }
    z.object({ confirmed: z.literal(true) }).parse(req.body);
    await transaction(async (c) => {
      await lockState(c);
      for (const p of await query<{ id: string }>(c, "SELECT id FROM polls")) {
        const voter = identityMap.get(p.id);
        if (!voter) continue;
        const v = (
          await query<{ id: string }>(
            c,
            "SELECT id FROM votes WHERE poll_id=? AND voter_hash=?",
            [p.id, voterHash(voter, p.id)],
          )
        )[0];
        if (!v) continue;
        await c.execute("DELETE FROM ballot_reviews WHERE vote_id=?", [v.id]);
        await c.execute(
          "DELETE a FROM idea_appeals a JOIN ideas i ON i.id=a.idea_id WHERE i.vote_id=?",
          [v.id],
        );
        await c.execute(
          "DELETE h FROM idea_history h JOIN ideas i ON i.id=h.idea_id WHERE i.vote_id=?",
          [v.id],
        );
        await c.execute(
          "UPDATE ideas SET duplicate_of=NULL WHERE duplicate_of IN (SELECT id FROM (SELECT id FROM ideas WHERE vote_id=?) AS own_ideas)",
          [v.id],
        );
        await c.execute("DELETE FROM ideas WHERE vote_id=?", [v.id]);
        await c.execute("DELETE FROM votes WHERE id=?", [v.id]);
      }
      await audit(c, null, "privacy.browser_data_deleted", randomUUID());
      if (req.cookies.participant_session) {
        const session = (
          await query<{ participant_id: string | null; identity_key: string }>(
            c,
            "SELECT participant_id,identity_key FROM participant_sessions WHERE token_hash=? AND expires_at>UTC_TIMESTAMP(3)",
            [digest(req.cookies.participant_session)],
          )
        )[0];
        const email = session?.participant_id
          ? (
              await query<{ email_hash: string }>(
                c,
                "SELECT email_hash FROM participants WHERE id=?",
                [session.participant_id],
              )
            )[0]?.email_hash
          : session?.identity_key.startsWith("email:")
            ? session.identity_key.slice(6)
            : undefined;
        if (email) {
          await c.execute(
            "DELETE m FROM mail_jobs m JOIN verification_tokens t ON t.token_hash=m.verification_hash WHERE t.email_hash=?",
            [email],
          );
          await c.execute(
            "DELETE FROM verification_tokens WHERE email_hash=?",
            [email],
          );
        }
        if (session?.participant_id) {
          await c.execute(
            "DELETE FROM participant_sessions WHERE participant_id=?",
            [session.participant_id],
          );
          await c.execute("DELETE FROM participants WHERE id=?", [
            session.participant_id,
          ]);
        } else
          await c.execute(
            "DELETE FROM participant_sessions WHERE token_hash=?",
            [digest(req.cookies.participant_session)],
          );
      }
    });
    reply.clearCookie("voter", { path: "/" });
    reply.clearCookie("participant_session", { path: "/" });
    return {
      ok: true,
      message:
        "Rohdaten gelöscht. Bereits freigegebene aggregierte Entscheidungen bleiben erhalten; gesicherte Backups folgen ihrer Löschfrist.",
    };
  });
  app.get("/api/poll", async (req, reply) => {
    let voter = req.cookies.voter;
    if (!voter || !uuid.safeParse(voter).success) {
      voter = randomUUID();
      reply.setCookie("voter", voter, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 86400 * 30,
      });
    }
    return current(voter, (p) => identity(req, p.id, p.rules.participation));
  });
  app.post(
    "/api/poll/:id/vote",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const id = uuid.parse((req.params as { id: string }).id);
      const body = z
        .object({
          answer: z.unknown(),
          termsAccepted: z.boolean().default(false),
        })
        .parse(req.body);
      const p = (await rows("SELECT rules FROM polls WHERE id=?", [id]))[0];
      if (
        p &&
        json<{ type: string }>(p.rules).type === "text" &&
        !body.termsAccepted
      ) {
        reply.code(400);
        throw new Error("Nutzungsbedingungen für Beiträge bestätigen.");
      }
      const mode = p
        ? json<{ participation: string }>(p.rules).participation
        : "anonymous";
      const voter = await identity(req, id, mode);
      if (!voter) {
        reply.code(401);
        throw new Error("Teilnahme zuerst verifizieren.");
      }
      await vote(
        id,
        voter,
        body.answer,
        mode,
        req.cookies.participant_session
          ? digest(req.cookies.participant_session)
          : undefined,
      );
      return current(voter, (poll) =>
        identity(req, poll.id, poll.rules.participation),
      );
    },
  );
  app.post(
    "/api/admin/login",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const data = z
        .object({
          email: z.email(),
          password: z.string().max(200),
          token: z.string().regex(/^\d{6}$/),
        })
        .parse(req.body);
      const a = (
        await rows<
          Admin & {
            password_hash: string;
            totp_secret: string;
            last_totp_step: number;
          }
        >("SELECT * FROM admins WHERE email=? AND disabled=FALSE", [data.email])
      )[0];
      if (!a || !verifyPassword(data.password, a.password_hash)) {
        reply.code(401);
        throw new Error("Anmeldung fehlgeschlagen.");
      }
      const step = verifyTotp(decrypt(a.totp_secret), data.token);
      if (step === null || step <= Number(a.last_totp_step)) {
        reply.code(401);
        throw new Error("Anmeldung fehlgeschlagen.");
      }
      const token = randomBytes(32).toString("hex");
      await transaction(async (c) => {
        await lockState(c);
        const latest = (
          await query<{ last_totp_step: number }>(
            c,
            "SELECT last_totp_step FROM admins WHERE id=? FOR UPDATE",
            [a.id],
          )
        )[0]!;
        if (step <= Number(latest.last_totp_step))
          throw new Error("Code wurde bereits verwendet.");
        await c.execute("UPDATE admins SET last_totp_step=? WHERE id=?", [
          step,
          a.id,
        ]);
        await c.execute("INSERT INTO sessions VALUES(?,?,?)", [
          digest(token),
          a.id,
          new Date(Date.now() + 3600000),
        ]);
        await audit(c, a.id, "auth.login", a.id);
      });
      reply.setCookie("admin_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 3600,
      });
      return { ok: true };
    },
  );
  app.post("/api/admin/logout", async (req, reply) => {
    await transaction(async (c) => {
      await lockState(c);
      await c.execute("DELETE FROM sessions WHERE token_hash=?", [
        digest(req.cookies.admin_session ?? ""),
      ]);
      await audit(c, req.admin!.id, "auth.logout", req.admin!.id);
    });
    reply.clearCookie("admin_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/admin/dashboard", async (req) => ({
    admin: req.admin,
    polls: (
      await rows("SELECT * FROM polls ORDER BY created_at DESC LIMIT 100")
    ).map(toPoll),
    ideas: req.admin!.permissions.includes("ideas.read")
      ? await rows("SELECT * FROM ideas ORDER BY created_at DESC LIMIT 100")
      : [],
    decisions: req.admin!.permissions.includes("decisions.read")
      ? await rows(
          "SELECT d.*,g.issue_url,g.state AS github_state FROM decisions d LEFT JOIN github_links g ON g.decision_id=d.id ORDER BY d.created_at DESC LIMIT 100",
        )
      : [],
    tasks: req.admin!.permissions.includes("planning.read")
      ? await rows(
          "SELECT * FROM development_tasks ORDER BY priority DESC LIMIT 100",
        )
      : [],
    audit: req.admin!.permissions.includes("audit.read")
      ? await rows(
          "SELECT sequence,action,target_id,created_at FROM audit_events ORDER BY sequence DESC LIMIT 50",
        )
      : [],
    state: req.admin!.permissions.includes("operations.manage")
      ? (await rows("SELECT * FROM platform_state WHERE id=1"))[0]
      : null,
    modules: req.admin!.permissions.includes("modules.read")
      ? await rows("SELECT * FROM modules")
      : [],
  }));
  app.post("/api/admin/polls", async (req) => ({
    id: await createPoll(req.body, req.admin!.id),
  }));
  app.patch("/api/admin/polls/:id", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const { pollInput } = await import("../../../packages/polls/src/index.js");
    const data = pollInput.parse(req.body);
    await transaction(async (c) => {
      await lockState(c);
      const p = (
        await query(c, "SELECT status FROM polls WHERE id=? FOR UPDATE", [id])
      )[0];
      if (!p || p.status !== "draft")
        throw new Error(
          "Nur Entwürfe bearbeiten; gestartete Regeln sind unveränderlich.",
        );
      await c.execute(
        "UPDATE polls SET title=?,description=?,rules=?,starts_at=?,ends_at=? WHERE id=?",
        [
          data.title,
          data.description,
          JSON.stringify(data.rules),
          new Date(data.startsAt),
          new Date(data.endsAt),
          id,
        ],
      );
      await audit(c, req.admin!.id, "poll.edited", id);
    });
    return { ok: true };
  });
  app.post("/api/admin/polls/:id/:action", async (req) => {
    const p = z
      .object({
        id: uuid,
        action: z.enum(["schedule", "close", "release", "archive"]),
      })
      .parse(req.params);
    await changePoll(p.id, p.action, req.admin!.id);
    return { ok: true };
  });
  app.get("/api/admin/polls/:id/results", async (req) => {
    const p = (
      await rows("SELECT * FROM polls WHERE id=?", [
        uuid.parse((req.params as { id: string }).id),
      ])
    )[0];
    if (!p) throw new Error("Umfrage fehlt.");
    return aggregate(toPoll(p));
  });
  app.post("/api/admin/settings", async (req) => {
    const p = z
      .object({
        mode: z.enum(["waiting", "results"]),
        message: z.string().min(3).max(500),
        paused: z.boolean().default(false),
      })
      .parse(req.body);
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "UPDATE platform_state SET transition_mode=?,waiting_message=?,paused=? WHERE id=1",
        [p.mode, p.message, p.paused],
      );
      await audit(c, req.admin!.id, "settings.updated", "platform");
    });
    return { ok: true };
  });
  app.patch("/api/admin/ideas/:id", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const p = z
      .object({
        content: z.string().trim().min(3).max(2000),
        category: z.string().max(100),
        status: z.enum(["pending", "approved", "rejected"]),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(req.body);
    await transaction(async (c) => {
      await lockState(c);
      const old = (
        await query<{ content: string }>(
          c,
          "SELECT content FROM ideas WHERE id=? FOR UPDATE",
          [id],
        )
      )[0];
      if (!old) throw new Error("Idee fehlt.");
      await c.execute(
        "INSERT INTO idea_history(id,idea_id,admin_id,previous_content,next_content,reason) VALUES(?,?,?,?,?,?)",
        [randomUUID(), id, req.admin!.id, old.content, p.content, p.reason],
      );
      await c.execute(
        "UPDATE ideas SET content=?,category=?,status=? WHERE id=?",
        [p.content, p.category, p.status, id],
      );
      await audit(c, req.admin!.id, "idea.moderated", id);
    });
    return { ok: true };
  });
  app.get("/api/admin/ideas/:id/history", async (req) =>
    rows("SELECT * FROM idea_history WHERE idea_id=? ORDER BY created_at", [
      uuid.parse((req.params as { id: string }).id),
    ]),
  );
  app.post("/api/admin/tasks", async (req) => {
    const p = z
      .object({
        decisionId: uuid,
        title: z.string().min(3).max(200),
        priority: z.number().int().min(0).max(100),
      })
      .parse(req.body);
    const id = randomUUID();
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "INSERT INTO development_tasks(id,decision_id,title,priority) VALUES(?,?,?,?)",
        [id, p.decisionId, p.title, p.priority],
      );
      await audit(c, req.admin!.id, "task.created", id);
    });
    return { id };
  });
  await githubRoutes(app);
  await participationRoutes(app);
  await workflowRoutes(app);
  await githubManagementRoutes(app);
  await legalRoutes(app);
  return app;
}
async function githubRoutes(app: FastifyInstance) {
  const headers = () => ({
    Authorization: "Bearer " + process.env.GITHUB_TOKEN,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  });
  function repository() {
    const repo = process.env.GITHUB_REPOSITORY;
    if (!repo || !/^[-\w.]+\/[-\w.]+$/.test(repo))
      throw new Error("GitHub-Repository nicht konfiguriert.");
    return repo;
  }
  app.get("/api/admin/decisions/:id/github-preview", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const d = (
      await rows<{ title: string; result: unknown }>(
        "SELECT title,result FROM decisions WHERE id=?",
        [id],
      )
    )[0];
    if (!d) throw new Error("Entscheidung fehlt.");
    return {
      title: d.title,
      body:
        "## Communityentscheidung\n\n" +
        d.title +
        "\n\n## Auswertung\n\n" +
        JSON.stringify(json(d.result), null, 2) +
        "\n\n## Anforderungen\n\nVom Product Owner ergänzen.\n\nKeine automatische Releasefreigabe.",
      labels: [],
    };
  });
  app.post("/api/admin/decisions/:id/github", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const p = z
      .object({
        title: z.string().min(3).max(200),
        body: z.string().min(10).max(10000),
        labels: z.array(z.string().max(50)).max(10),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    if (!process.env.GITHUB_TOKEN)
      throw new Error("GitHub-Token nicht konfiguriert.");
    const repo = repository();
    // Persist intent BEFORE external action. Pending/uncertain requests cannot create duplicates on retries.
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "INSERT INTO github_links(decision_id,state,title,body) VALUES(?,'pending',?,?)",
        [id, p.title, p.body],
      );
      await audit(c, req.admin!.id, "github.creation_approved", id);
    });
    try {
      const response = await fetch(
        "https://api.github.com/repos/" + repo + "/issues",
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            title: p.title,
            body: p.body + "\n\n<!-- community-decision:" + id + " -->",
            labels: p.labels,
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error("GitHub HTTP " + response.status);
      const result = z
        .object({ number: z.number().int(), html_url: z.url() })
        .parse(await response.json());
      await transaction(async (c) => {
        await lockState(c);
        await c.execute(
          "UPDATE github_links SET state='created',issue_number=?,issue_url=? WHERE decision_id=?",
          [result.number, result.html_url, id],
        );
        await audit(c, req.admin!.id, "github.issue_created", id);
      });
      return result;
    } catch {
      await transaction(async (c) => {
        await lockState(c);
        await c.execute(
          "UPDATE github_links SET state='uncertain',last_error='Status manuell auf GitHub abgleichen; keine automatische Neuerstellung.' WHERE decision_id=?",
          [id],
        );
        await audit(c, req.admin!.id, "github.creation_uncertain", id);
      });
      throw new Error(
        "GitHub-Ergebnis unklar. Vor Wiederholung auf GitHub abgleichen.",
      );
    }
  });
  app.post("/api/admin/decisions/:id/github-sync", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const link = (
      await rows<{ issue_number: number; state: string }>(
        "SELECT * FROM github_links WHERE decision_id=?",
        [id],
      )
    )[0];
    if (!link || link.state !== "created")
      throw new Error("Verknüpfung fehlt oder ist ungeklärt.");
    const response = await fetch(
      "https://api.github.com/repos/" +
        repository() +
        "/issues/" +
        link.issue_number,
      { headers: headers(), signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) throw new Error("GitHub-Statusabruf fehlgeschlagen.");
    const data = z
      .object({ state: z.enum(["open", "closed"]) })
      .parse(await response.json());
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "UPDATE github_links SET remote_state=? WHERE decision_id=?",
        [data.state, id],
      );
      await audit(c, req.admin!.id, "github.status_synced", id);
    });
    return data;
  });
}
