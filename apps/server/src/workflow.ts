import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  rows,
  query,
  transaction,
  lockState,
  audit,
  json,
  toPoll,
} from "../../../packages/database/index.js";
import { permissions } from "../../../packages/modules/src/permissions.js";
import { rulesSchema } from "../../../packages/polls/src/index.js";
import { registry } from "../../../packages/modules/src/runtime.js";
import { identity } from "./participation.js";
import { voterHash, createPoll } from "./service.js";
const uuid = z.uuid();
export async function workflowRoutes(app: FastifyInstance) {
  app.get("/api/admin/polls/:id/ballots", async (req) =>
    rows(
      "SELECT id,valid,invalid_reason,created_at FROM votes WHERE poll_id=? ORDER BY created_at",
      [uuid.parse((req.params as { id: string }).id)],
    ),
  );
  app.patch("/api/admin/polls/:id/ballots/:voteId", async (req) => {
    const p = z.object({ id: uuid, voteId: uuid }).parse(req.params);
    const data = z
      .object({
        valid: z.boolean(),
        reason: z.string().min(10).max(1000),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    await transaction(async (c) => {
      await lockState(c);
      const poll = (
        await query<{ released: boolean; status: string }>(
          c,
          "SELECT released,status FROM polls WHERE id=? FOR UPDATE",
          [p.id],
        )
      )[0];
      if (!poll || poll.released || poll.status !== "closed")
        throw new Error(
          "Stimmen nur nach Ende und vor Ergebnisfreigabe prüfen.",
        );
      const ballot = (
        await query(
          c,
          "SELECT id FROM votes WHERE id=? AND poll_id=? FOR UPDATE",
          [p.voteId, p.id],
        )
      )[0];
      if (!ballot) throw new Error("Stimme fehlt.");
      await c.execute("UPDATE votes SET valid=?,invalid_reason=? WHERE id=?", [
        data.valid,
        data.valid ? null : data.reason,
        p.voteId,
      ]);
      await c.execute(
        "INSERT INTO ballot_reviews(id,vote_id,actor_id,reason,valid) VALUES(?,?,?,?,?)",
        [randomUUID(), p.voteId, req.admin!.id, data.reason, data.valid],
      );
      await audit(
        c,
        req.admin!.id,
        data.valid ? "vote.review_valid" : "vote.review_invalid",
        p.voteId,
      );
    });
    return { ok: true };
  });
  app.get("/api/admin/appeals", async () =>
    rows("SELECT * FROM idea_appeals ORDER BY created_at DESC LIMIT 100"),
  );
  app.get("/api/admin/tasks/dependencies", async () =>
    rows("SELECT * FROM task_dependencies"),
  );
  app.get("/api/admin/ideas/:id/detail", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    return {
      idea: (await rows("SELECT * FROM ideas WHERE id=?", [id]))[0],
      history: await rows(
        "SELECT * FROM idea_history WHERE idea_id=? ORDER BY created_at",
        [id],
      ),
      appeals: await rows(
        "SELECT * FROM idea_appeals WHERE idea_id=? ORDER BY created_at",
        [id],
      ),
    };
  });
  app.post("/api/admin/ideas/batch", async (req) => {
    const p = z
      .object({
        ids: z.array(uuid).min(1).max(100),
        status: z.enum(["approved", "rejected", "pending"]),
        reason: z.string().min(3).max(500),
      })
      .parse(req.body);
    await transaction(async (c) => {
      await lockState(c);
      for (const id of new Set(p.ids)) {
        const old = (
          await query<{ content: string }>(
            c,
            "SELECT content FROM ideas WHERE id=? FOR UPDATE",
            [id],
          )
        )[0];
        if (!old) throw new Error("Mindestens eine Idee fehlt.");
        await c.execute(
          "INSERT INTO idea_history(id,idea_id,admin_id,previous_content,next_content,reason) VALUES(?,?,?,?,?,?)",
          [randomUUID(), id, req.admin!.id, old.content, old.content, p.reason],
        );
        await c.execute("UPDATE ideas SET status=? WHERE id=?", [p.status, id]);
        await audit(c, req.admin!.id, "idea.batch_" + p.status, id);
      }
    });
    return { ok: true };
  });
  app.post("/api/admin/ideas/:id/merge", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const p = z
      .object({ targetId: uuid, reason: z.string().min(3).max(500) })
      .parse(req.body);
    if (id === p.targetId)
      throw new Error("Nicht mit sich selbst zusammenführen.");
    await transaction(async (c) => {
      await lockState(c);
      const source = (
        await query<{ content: string; status: string }>(
          c,
          "SELECT content,status FROM ideas WHERE id=? FOR UPDATE",
          [id],
        )
      )[0];
      const target = (
        await query<{ status: string }>(
          c,
          "SELECT status FROM ideas WHERE id=? FOR UPDATE",
          [p.targetId],
        )
      )[0];
      if (
        !source ||
        !target ||
        source.status === "merged" ||
        target.status === "merged"
      )
        throw new Error("Gültige, nicht zusammengeführte Ideen erforderlich.");
      await c.execute("UPDATE ideas SET status=?,duplicate_of=? WHERE id=?", [
        "merged",
        p.targetId,
        id,
      ]);
      await c.execute(
        "INSERT INTO idea_history(id,idea_id,admin_id,previous_content,next_content,reason) VALUES(?,?,?,?,?,?)",
        [
          randomUUID(),
          id,
          req.admin!.id,
          source.content,
          source.content,
          "Zusammengeführt mit " + p.targetId + ": " + p.reason,
        ],
      );
      await audit(c, req.admin!.id, "idea.merged", id);
    });
    return { ok: true };
  });
  app.post("/api/admin/ideas/prepare-poll", async (req) => {
    const p = z
      .object({
        ideaIds: z.array(uuid).min(2).max(30),
        title: z.string().min(3).max(200),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
        type: z.enum(["single", "multiple", "ranking"]),
      })
      .parse(req.body);
    const options = [];
    for (const id of p.ideaIds) {
      const idea = (
        await rows<{ content: string; status: string }>(
          "SELECT content,status FROM ideas WHERE id=?",
          [id],
        )
      )[0];
      if (!idea || idea.status !== "approved")
        throw new Error("Nur manuell freigegebene Ideen verwenden.");
      if (idea.content.length > 200)
        throw new Error(
          "Ideentitel für Abstimmung auf höchstens 200 Zeichen redaktionell kürzen.",
        );
      options.push(idea.content);
    }
    const id = await createPoll(
      {
        title: p.title,
        description: "Aus geprüften Communityideen vorbereitet.",
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        rules: rulesSchema.parse({
          type: p.type,
          options,
          visibility: "after_release",
          participation: "anonymous",
        }),
      },
      req.admin!.id,
    );
    return { id };
  });
  app.post("/api/privacy/appeal", async (req) => {
    const p = z
      .object({ ideaId: uuid, content: z.string().trim().min(10).max(2000) })
      .parse(req.body);
    const idea = (
      await rows<{ poll_id: string; voter_hash: string; rules: unknown }>(
        "SELECT i.poll_id,v.voter_hash,p.rules FROM ideas i JOIN votes v ON v.id=i.vote_id JOIN polls p ON p.id=i.poll_id WHERE i.id=?",
        [p.ideaId],
      )
    )[0];
    if (!idea) throw new Error("Beitrag nicht zuordenbar.");
    const key = await identity(
      req,
      idea.poll_id,
      json<{ participation: string }>(idea.rules).participation,
    );
    if (!key || voterHash(key, idea.poll_id) !== idea.voter_hash)
      throw new Error("Beitrag nicht zuordenbar.");
    await transaction(async (c) => {
      await lockState(c);
      if (
        (
          await query(
            c,
            "SELECT id FROM idea_appeals WHERE idea_id=? AND status='pending'",
            [p.ideaId],
          )
        ).length
      )
        throw new Error("Es besteht bereits ein offener Einspruch.");
      await c.execute(
        "INSERT INTO idea_appeals(id,idea_id,content) VALUES(?,?,?)",
        [randomUUID(), p.ideaId, p.content],
      );
      await audit(c, null, "idea.appeal_submitted", p.ideaId);
    });
    return { ok: true };
  });
  app.patch("/api/admin/appeals/:id", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const p = z
      .object({
        status: z.enum(["accepted", "rejected"]),
        response: z.string().min(10).max(2000),
      })
      .parse(req.body);
    await transaction(async (c) => {
      await lockState(c);
      const appeal = (
        await query<{ idea_id: string; status: string }>(
          c,
          "SELECT idea_id,status FROM idea_appeals WHERE id=? FOR UPDATE",
          [id],
        )
      )[0];
      if (!appeal || appeal.status !== "pending")
        throw new Error("Kein offener Einspruch.");
      await c.execute(
        "UPDATE idea_appeals SET status=?,response=? WHERE id=?",
        [p.status, p.response, id],
      );
      await audit(c, req.admin!.id, "idea.appeal_" + p.status, id);
    });
    return { ok: true };
  });
  app.get("/api/admin/workflow", async () => ({
    steps: json(
      (await rows("SELECT steps FROM workflow_config WHERE id=1"))[0]!.steps,
    ),
    evaluations: await rows(
      "SELECT * FROM evaluations ORDER BY created_at DESC LIMIT 100",
    ),
    dependencies: await rows("SELECT * FROM task_dependencies"),
    appeals: await rows(
      "SELECT * FROM idea_appeals ORDER BY created_at DESC LIMIT 100",
    ),
  }));
  app.put("/api/admin/workflow", async (req) => {
    const p = z
      .object({
        steps: z
          .array(z.string().regex(/^[a-z][a-z_]{1,99}$/))
          .min(2)
          .max(30),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    if (new Set(p.steps).size !== p.steps.length)
      throw new Error("Prozessschritte müssen unterschiedlich sein.");
    await transaction(async (c) => {
      await lockState(c);
      const used = await query<{ workflow_step: string }>(
        c,
        "SELECT DISTINCT workflow_step FROM decisions",
      );
      if (used.some((d) => !p.steps.includes(d.workflow_step)))
        throw new Error(
          "Noch verwendete Schritte dürfen nicht entfernt werden.",
        );
      await c.execute("UPDATE workflow_config SET steps=? WHERE id=1", [
        JSON.stringify(p.steps),
      ]);
      await audit(c, req.admin!.id, "workflow.changed", "platform");
    });
    return { ok: true };
  });
  app.patch("/api/admin/decisions/:id", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const p = z
      .object({
        step: z.string().max(100),
        requirements: z.string().max(10000),
        reason: z.string().min(3).max(1000),
      })
      .parse(req.body);
    await transaction(async (c) => {
      await lockState(c);
      const steps = json<string[]>(
        (await query(c, "SELECT steps FROM workflow_config WHERE id=1"))[0]!
          .steps,
      );
      if (!steps.includes(p.step))
        throw new Error("Prozessschritt nicht konfiguriert.");
      const old = (
        await query<{ workflow_step: string }>(
          c,
          "SELECT workflow_step FROM decisions WHERE id=? FOR UPDATE",
          [id],
        )
      )[0];
      if (!old) throw new Error("Entscheidung fehlt.");
      await c.execute(
        "UPDATE decisions SET workflow_step=?,requirements=? WHERE id=?",
        [p.step, p.requirements, id],
      );
      await c.execute(
        "INSERT INTO decision_events(decision_id,actor_id,previous_step,next_step,reason) VALUES(?,?,?,?,?)",
        [id, req.admin!.id, old.workflow_step, p.step, p.reason],
      );
      await audit(c, req.admin!.id, "decision.workflow_changed", id);
    });
    return { ok: true };
  });
  app.get("/api/admin/decisions/:id/history", async (req) =>
    rows(
      "SELECT * FROM decision_events WHERE decision_id=? ORDER BY sequence",
      [uuid.parse((req.params as { id: string }).id)],
    ),
  );
  app.post("/api/admin/evaluations", async (req) => {
    const p = z
      .object({
        decisionId: uuid,
        sentiment: z.enum(["positive", "neutral", "negative"]),
        content: z.string().min(3).max(5000),
        origin: z.string().min(3).max(200),
      })
      .parse(req.body);
    const id = randomUUID();
    await transaction(async (c) => {
      await lockState(c);
      await c.execute(
        "INSERT INTO evaluations(id,decision_id,sentiment,content,origin) VALUES(?,?,?,?,?)",
        [id, p.decisionId, p.sentiment, p.content, p.origin],
      );
      await audit(c, req.admin!.id, "evaluation.recorded", id);
    });
    return { id };
  });
  app.patch("/api/admin/evaluations/:id", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const p = z
      .object({ status: z.enum(["reviewed", "accepted", "rejected"]) })
      .parse(req.body);
    await transaction(async (c) => {
      await lockState(c);
      await c.execute("UPDATE evaluations SET status=? WHERE id=?", [
        p.status,
        id,
      ]);
      await audit(c, req.admin!.id, "evaluation." + p.status, id);
    });
    return { ok: true };
  });
  app.patch("/api/admin/tasks/:id", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const p = z
      .object({
        requirements: z.string().max(10000),
        priority: z.number().int().min(0).max(100),
        status: z.enum([
          "requirements",
          "planned",
          "implementation",
          "review",
          "ready",
          "released",
        ]),
        testStatus: z.enum(["pending", "passed", "failed"]),
        version: z.string().max(40),
        dependencies: z.array(uuid).max(100),
        releaseApproved: z.boolean(),
      })
      .parse(req.body);
    await transaction(async (c) => {
      await lockState(c);
      const old = (
        await query(
          c,
          "SELECT * FROM development_tasks WHERE id=? FOR UPDATE",
          [id],
        )
      )[0];
      if (!old) throw new Error("Aufgabe fehlt.");
      if (p.dependencies.includes(id))
        throw new Error("Aufgabe kann nicht von sich selbst abhängen.");
      const graph = await query<{ task_id: string; depends_on: string }>(
        c,
        "SELECT * FROM task_dependencies",
      );
      const walk = (node: string, seen: Set<string>): boolean => {
        if (node === id) return true;
        if (seen.has(node)) return false;
        seen.add(node);
        return graph
          .filter((e) => e.task_id === node)
          .some((e) => walk(e.depends_on, seen));
      };
      if (p.dependencies.some((d) => walk(d, new Set())))
        throw new Error("Zyklische Abhängigkeit.");
      for (const dep of p.dependencies)
        if (
          !(
            await query(c, "SELECT id FROM development_tasks WHERE id=?", [dep])
          ).length
        )
          throw new Error("Abhängigkeit fehlt.");
      if (p.releaseApproved && (p.testStatus !== "passed" || !p.version))
        throw new Error(
          "Releasefreigabe erfordert bestandene Tests und Versionszuordnung.",
        );
      if (p.status === "released") {
        if (!p.releaseApproved)
          throw new Error("Ausdrückliche Releasefreigabe erforderlich.");
        for (const dep of p.dependencies)
          if (
            (
              await query<{ status: string }>(
                c,
                "SELECT status FROM development_tasks WHERE id=?",
                [dep],
              )
            )[0]!.status !== "released"
          )
            throw new Error("Abhängigkeit ist noch nicht veröffentlicht.");
      }
      await c.execute(
        "UPDATE development_tasks SET requirements=?,priority=?,status=?,test_status=?,version=?,release_approved=? WHERE id=?",
        [
          p.requirements,
          p.priority,
          p.status,
          p.testStatus,
          p.version || null,
          p.releaseApproved,
          id,
        ],
      );
      await c.execute("DELETE FROM task_dependencies WHERE task_id=?", [id]);
      for (const dep of p.dependencies)
        await c.execute("INSERT INTO task_dependencies VALUES(?,?)", [id, dep]);
      await audit(
        c,
        req.admin!.id,
        p.releaseApproved ? "task.release_approved" : "task.updated",
        id,
      );
    });
    return { ok: true };
  });
  app.post("/api/admin/polls/:id/reschedule", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const p = z
      .object({
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
        reason: z.string().min(10).max(1000),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    if (
      Date.parse(p.endsAt) <= Date.parse(p.startsAt) ||
      Date.parse(p.endsAt) <= Date.now()
    )
      throw new Error("Ungültiges Zeitfenster.");
    await transaction(async (c) => {
      await lockState(c);
      const old = (
        await query(c, "SELECT * FROM polls WHERE id=? FOR UPDATE", [id])
      )[0];
      if (!old || !["scheduled", "active"].includes(String(old.status)))
        throw new Error("Nur geplante oder aktive Umfragen neu terminieren.");
      const poll = toPoll(old);
      if (
        poll.status === "active" &&
        Date.parse(p.startsAt) !== Date.parse(poll.startsAt)
      )
        throw new Error(
          "Den Start einer laufenden Umfrage nicht rückwirkend ändern.",
        );
      if (
        (
          await query(
            c,
            "SELECT id FROM polls WHERE id<>? AND status IN ('scheduled','active') AND starts_at<? AND ends_at>?",
            [id, new Date(p.endsAt), new Date(p.startsAt)],
          )
        ).length
      )
        throw new Error("Überlappung mit anderer Umfrage.");
      await c.execute(
        "INSERT INTO schedule_history(poll_id,actor_id,previous_start,previous_end,next_start,next_end,reason) VALUES(?,?,?,?,?,?,?)",
        [
          id,
          req.admin!.id,
          new Date(poll.startsAt),
          new Date(poll.endsAt),
          new Date(p.startsAt),
          new Date(p.endsAt),
          p.reason,
        ],
      );
      await c.execute("UPDATE polls SET starts_at=?,ends_at=? WHERE id=?", [
        new Date(p.startsAt),
        new Date(p.endsAt),
        id,
      ]);
      await audit(c, req.admin!.id, "poll.rescheduled", id);
    });
    return { ok: true };
  });
  app.get("/api/poll/:id/schedule", async (req) =>
    rows(
      "SELECT previous_start,previous_end,next_start,next_end,reason,changed_at FROM schedule_history WHERE poll_id=? ORDER BY sequence",
      [uuid.parse((req.params as { id: string }).id)],
    ),
  );
  app.get("/api/admin/modules/health", async () => ({
    manifests: registry.list(),
    health: await registry.health(),
    history: await rows(
      "SELECT * FROM module_history ORDER BY sequence DESC LIMIT 100",
    ),
  }));
  app.post("/api/admin/modules/:id/configure", async (req) => {
    const id = z
      .string()
      .regex(/^[a-z][a-z-]{1,99}$/)
      .parse((req.params as { id: string }).id);
    const p = z
      .object({
        enabled: z.boolean(),
        version: z.string().max(30),
        decisionId: uuid.nullable(),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    const m = registry.activate(id, Boolean(p.decisionId), true);
    if (m.version !== p.version)
      throw new Error(
        "Nur mit dieser Anwendung ausgelieferte Modulversionen zulässig.",
      );
    if (p.enabled && !(await m.health()))
      throw new Error("Health-Check fehlgeschlagen.");
    await transaction(async (c) => {
      await lockState(c);
      if (
        m.public &&
        id !== "polls" &&
        (!p.decisionId ||
          !(
            await query(c, "SELECT id FROM decisions WHERE id=?", [
              p.decisionId,
            ])
          ).length)
      )
        throw new Error("Dokumentierte Communityentscheidung erforderlich.");
      const old = (
        await query<{ version: string; enabled: boolean }>(
          c,
          "SELECT version,enabled FROM modules WHERE id=? FOR UPDATE",
          [id],
        )
      )[0];
      if (!old) throw new Error("Modul nicht registriert.");
      await c.execute(
        "INSERT INTO module_history(module_id,previous_version,next_version,previous_enabled,next_enabled,actor_id) VALUES(?,?,?,?,?,?)",
        [
          id,
          old.version,
          p.version,
          Boolean(old.enabled),
          p.enabled,
          req.admin!.id,
        ],
      );
      await c.execute(
        "UPDATE modules SET version=?,enabled=?,decision_id=? WHERE id=?",
        [p.version, p.enabled, p.decisionId, id],
      );
      await audit(c, req.admin!.id, "module.configured", id);
    });
    return { ok: true };
  });
  app.get("/api/admin/users", async () => ({
    admins: await rows("SELECT id,email,role,disabled FROM admins"),
    grants: await rows("SELECT * FROM admin_grants"),
    permissions,
    participants: await rows(
      "SELECT id,verified_at,disabled FROM participants ORDER BY verified_at DESC LIMIT 100",
    ),
  }));
  app.patch("/api/admin/users/:id", async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const p = z
      .object({
        role: z.enum(["moderator", "viewer"]),
        disabled: z.boolean(),
        permissions: z.array(z.enum(permissions)).max(30),
      })
      .parse(req.body);
    await transaction(async (c) => {
      await lockState(c);
      const admin = (
        await query<{ role: string }>(
          c,
          "SELECT role FROM admins WHERE id=? FOR UPDATE",
          [id],
        )
      )[0];
      if (!admin || admin.role === "owner")
        throw new Error(
          "Product-Owner-Konto ist geschützt; Änderung nur im kontrollierten Offlineverfahren.",
        );
      await c.execute("UPDATE admins SET role=?,disabled=? WHERE id=?", [
        p.role,
        p.disabled,
        id,
      ]);
      await c.execute("DELETE FROM admin_grants WHERE admin_id=?", [id]);
      for (const permission of new Set(p.permissions))
        await c.execute("INSERT INTO admin_grants VALUES(?,?)", [
          id,
          permission,
        ]);
      await c.execute("DELETE FROM sessions WHERE admin_id=?", [id]);
      await audit(c, req.admin!.id, "admin.permissions_changed", id);
    });
    return { ok: true };
  });
  app.get("/api/admin/operations", async () => ({
    security: await rows(
      "SELECT id,status,path,created_at FROM security_events ORDER BY created_at DESC LIMIT 100",
    ),
    mail: await rows(
      "SELECT id,status,created_at,last_error FROM mail_jobs ORDER BY created_at DESC LIMIT 100",
    ),
    checks: {
      node: process.version,
      smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM),
      githubConfigured: Boolean(
        process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY,
      ),
      legalReviewed: process.env.LEGAL_REVIEWED === "true",
    },
    sessions: (
      await rows<{ total: number }>(
        "SELECT COUNT(*) AS total FROM sessions WHERE expires_at>UTC_TIMESTAMP(3)",
      )
    )[0]!.total,
  }));
}
