import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { rows, query, transaction, lockState, audit, json } from "../../../packages/database/index.js";
import { verifyAuditEvents, type AuditEvent } from "../../../packages/database/audit-verification.js";
import { readinessReport } from "./readiness.js";

const uuid = z.uuid();
const auditLimit = 5000;
export const reviewSchema = z.object({
  title: z.string().trim().min(3).max(160),
  topic: z.enum(["authentication", "permissions", "privacy", "dependencies", "backup", "configuration", "other"]),
  outcome: z.enum(["passed", "attention", "failed"]),
  assignedTo: uuid, notes: z.string().trim().min(3).max(2000),
  supersedesId: uuid.nullable().default(null), confirmed: z.literal(true),
}).strict();

export function auditSnapshot(events: AuditEvent[]) {
  if (events.length > auditLimit) return { status: "not_checked", checkedEvents: 0, endHash: null,
    message: "Mehr als 5000 Ereignisse: vollständige Prüfung mit dem Betriebsskript durchführen." };
  try {
    return { status: "valid", checkedEvents: events.length, endHash: verifyAuditEvents(events),
      message: "Gespeicherte Hashkette zum Berichtszeitpunkt konsistent; externen Endhash gesondert vergleichen." };
  } catch {
    return { status: "invalid", checkedEvents: events.length, endHash: null,
      message: "Auditkette nicht konsistent. Ursache und externe Sicherung prüfen." };
  }
}

async function reportById(id: string) {
  const report = (await rows<{ id: string; snapshot: unknown; created_at: string; created_by: string }>(
    "SELECT * FROM security_reports WHERE id=?", [id],
  ))[0];
  if (!report) return null;
  return { ...report, snapshot: json(report.snapshot), reviews: await rows(
    "SELECT r.*,EXISTS(SELECT 1 FROM security_reviews n WHERE n.supersedes_id=r.id) AS superseded FROM security_reviews r WHERE r.report_id=? ORDER BY r.created_at,r.id", [id],
  ) };
}

export async function securityReportRoutes(app: FastifyInstance) {
  app.get("/api/admin/security/reports", async (req) => {
    const { page } = z.object({ page: z.coerce.number().int().min(0).max(10000).default(0) }).parse(req.query);
    return {
      page, pageSize: 25,
      total: Number((await rows<{ total: number }>("SELECT COUNT(*) AS total FROM security_reports"))[0]!.total),
      reports: (await rows<{ snapshot: unknown }>(
        "SELECT id,created_at,created_by,snapshot FROM security_reports ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET " + page * 25,
      )).map((report) => ({ ...report, snapshot: json(report.snapshot) })),
      assignees: await rows("SELECT id,email,role FROM admins WHERE disabled=FALSE ORDER BY email"),
    };
  });
  app.post("/api/admin/security/reports", async (req) => {
    const { days } = z.object({ days: z.union([z.literal(1), z.literal(7), z.literal(14)]), confirmed: z.literal(true) }).strict().parse(req.body);
    const id = randomUUID();
    const version = JSON.parse(await readFile("package.json", "utf8")).version as string;
    await transaction(async (c) => {
      await lockState(c);
      const snapshot = {
        schemaVersion: 1, capturedAt: new Date().toISOString(), applicationVersion: version, days,
        events: await query(c,
          "SELECT status,COUNT(*) AS total FROM security_events WHERE created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL ? DAY) GROUP BY status ORDER BY status", [days]),
        readiness: await readinessReport(process.env, <T>(sql: string) => query<T>(c, sql)),
        audit: auditSnapshot(await query<AuditEvent>(c, "SELECT * FROM audit_events ORDER BY sequence LIMIT 5001")),
      };
      await c.execute("INSERT INTO security_reports(id,created_by,snapshot) VALUES(?,?,?)", [id, req.admin!.id, JSON.stringify(snapshot)]);
      await audit(c, req.admin!.id, "security.report_created", id);
    });
    return { id };
  });
  app.get("/api/admin/security/reports/:id", async (req, reply) => {
    const report = await reportById(uuid.parse((req.params as { id: string }).id));
    if (!report) return reply.code(404).send({ error: "Bericht nicht gefunden." });
    return report;
  });
  app.get("/api/admin/security/reports/:id/export", async (req, reply) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const report = await reportById(id);
    if (!report) return reply.code(404).send({ error: "Bericht nicht gefunden." });
    await transaction(async (c) => { await lockState(c); await audit(c, req.admin!.id, "security.report_exported", id); });
    return reply.header("Content-Disposition", `attachment; filename="security-report-${id}.json"`).send(report);
  });
  app.post("/api/admin/security/reports/:id/reviews", async (req, reply) => {
    const reportId = uuid.parse((req.params as { id: string }).id);
    const input = reviewSchema.parse(req.body);
    const id = randomUUID();
    await transaction(async (c) => {
      await lockState(c);
      if (!(await query(c, "SELECT id FROM security_reports WHERE id=?", [reportId])).length) {
        reply.code(404); throw new Error("Bericht nicht gefunden.");
      }
      if (!(await query(c, "SELECT id FROM admins WHERE id=? AND disabled=FALSE", [input.assignedTo])).length)
        throw new Error("Aktive verantwortliche Person auswählen.");
      if (input.supersedesId && !(await query(c,
        "SELECT r.id FROM security_reviews r WHERE r.id=? AND r.report_id=? AND NOT EXISTS(SELECT 1 FROM security_reviews n WHERE n.supersedes_id=r.id)",
        [input.supersedesId, reportId],
      )).length) {
        reply.code(409); throw new Error("Prüfung fehlt, gehört zu einem anderen Bericht oder hat bereits eine Folgeprüfung.");
      }
      await c.execute("INSERT INTO security_reviews(id,report_id,assigned_to,created_by,topic,title,outcome,notes,supersedes_id) VALUES(?,?,?,?,?,?,?,?,?)",
        [id, reportId, input.assignedTo, req.admin!.id, input.topic, input.title, input.outcome, input.notes, input.supersedesId]);
      await audit(c, req.admin!.id, "security.review_recorded", id);
    });
    return { id };
  });
}
