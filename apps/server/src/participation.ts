import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  rows,
  query,
  transaction,
  lockState,
  audit,
  json,
} from "../../../packages/database/index.js";
import { digest, encrypt } from "./auth.js";
export function emailHash(email: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update("email:" + email.trim().toLowerCase())
    .digest("hex");
}
export async function identity(
  req: FastifyRequest,
  pollId: string,
  mode: string,
): Promise<string | undefined> {
  if (mode === "anonymous")
    return z.uuid().safeParse(req.cookies.voter).success
      ? req.cookies.voter
      : undefined;
  const token = req.cookies.participant_session;
  if (!token) return undefined;
  const s = (
    await rows<{
      identity_key: string;
      mode: string;
      poll_id: string | null;
      disabled: number | null;
    }>(
      "SELECT s.identity_key,s.mode,s.poll_id,p.disabled FROM participant_sessions s LEFT JOIN participants p ON p.id=s.participant_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3)",
      [digest(token)],
    )
  )[0];
  if (
    !s ||
    s.disabled ||
    s.mode !== mode ||
    (mode === "email" && s.poll_id !== pollId)
  )
    return undefined;
  return s.identity_key;
}
export async function participationRoutes(app: FastifyInstance) {
  app.post(
    "/api/participation/request",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req) => {
      const p = z
        .object({ pollId: z.uuid(), email: z.email().max(254) })
        .parse(req.body);
      if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
        throw new Error("E-Mail-Verifizierung ist noch nicht betriebsbereit.");
      const email = p.email.trim().toLowerCase();
      const hash = emailHash(email);
      const raw = randomBytes(32).toString("hex");
      const tokenHash = digest(raw);
      const expires = new Date(Date.now() + 15 * 60000);
      await transaction(async (c) => {
        const state = await lockState(c);
        const poll = (
          await query<{ rules: unknown; status: string }>(
            c,
            "SELECT rules,status FROM polls WHERE id=?",
            [p.pollId],
          )
        )[0];
        if (!poll || poll.status !== "active" || state.paused)
          throw new Error("Keine aktive Teilnahme.");
        const mode = json<{ participation: string }>(poll.rules).participation;
        if (mode === "anonymous")
          throw new Error("Keine Verifizierung erforderlich.");
        const limits = await query<{ total: number }>(
          c,
          "SELECT COUNT(*) AS total FROM verification_tokens WHERE email_hash=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE)",
          [hash],
        );
        if (Number(limits[0]!.total) >= 3)
          throw new Error(
            "Bitte warte vor einer weiteren Verifizierungsanfrage.",
          );
        const daily = Number(
          (
            await query<{ total: number }>(
              c,
              "SELECT COUNT(*) AS total FROM mail_jobs WHERE created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY)",
            )
          )[0]!.total,
        );
        if (
          daily >=
          z.coerce
            .number()
            .int()
            .min(10)
            .max(10000)
            .parse(process.env.MAIL_DAILY_LIMIT ?? 100)
        )
          throw new Error(
            "Das Versandlimit wurde erreicht. Bitte später erneut versuchen.",
          );
        await c.execute(
          "INSERT INTO verification_tokens(token_hash,poll_id,mode,email_hash,email_encrypted,expires_at) VALUES(?,?,?,?,?,?)",
          [tokenHash, p.pollId, mode, hash, encrypt(email), expires],
        );
        const link = process.env.SITE_URL + "/#verify=" + raw;
        const payload = {
          to: email,
          subject: "Deine Teilnahme an der Community-Umfrage bestätigen",
          text:
            "Du hast die Teilnahme an einer Umfrage angefragt. Dieser Link ist 15 Minuten gültig und kann einmal verwendet werden:\n\n" +
            link +
            "\n\nWenn du die Anfrage nicht gestellt hast, ignoriere diese E-Mail.",
        };
        await c.execute(
          "INSERT INTO mail_jobs(id,verification_hash,payload_encrypted,expires_at) VALUES(?,?,?,?)",
          [randomUUID(), tokenHash, encrypt(JSON.stringify(payload)), expires],
        );
      });
      return {
        ok: true,
        message:
          "Die Verifizierungsnachricht wird versendet. Prüfe dein Postfach und gegebenenfalls den Spamordner.",
      };
    },
  );
  app.post(
    "/api/participation/verify",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const p = z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(req.body);
      const session = randomBytes(32).toString("hex");
      const mode = await transaction(async (c) => {
        await lockState(c);
        const t = (
          await query<{
            poll_id: string;
            mode: "email" | "account";
            email_hash: string;
            email_encrypted: string;
            consumed: boolean;
            expires_at: string;
          }>(
            c,
            "SELECT * FROM verification_tokens WHERE token_hash=? FOR UPDATE",
            [digest(p.token)],
          )
        )[0];
        if (
          !t ||
          t.consumed ||
          new Date(t.expires_at.replace(" ", "T") + "Z").getTime() <= Date.now()
        )
          throw new Error("Link ungültig, abgelaufen oder bereits verwendet.");
        let participant: string | null = null;
        let key = "email:" + t.email_hash;
        if (t.mode === "account") {
          let user = (
            await query<{ id: string; disabled: boolean }>(
              c,
              "SELECT id,disabled FROM participants WHERE email_hash=? FOR UPDATE",
              [t.email_hash],
            )
          )[0];
          if (user?.disabled) throw new Error("Konto gesperrt.");
          if (!user) {
            participant = randomUUID();
            await c.execute(
              "INSERT INTO participants(id,email_hash,email_encrypted) VALUES(?,?,?)",
              [participant, t.email_hash, t.email_encrypted],
            );
          } else participant = user.id;
          key = "account:" + participant;
        }
        await c.execute(
          "UPDATE verification_tokens SET consumed=TRUE WHERE token_hash=?",
          [digest(p.token)],
        );
        await c.execute(
          "INSERT INTO participant_sessions(token_hash,identity_key,poll_id,mode,participant_id,expires_at) VALUES(?,?,?,?,?,?)",
          [
            digest(session),
            key,
            t.mode === "email" ? t.poll_id : null,
            t.mode,
            participant,
            new Date(
              Date.now() + (t.mode === "email" ? 86400000 : 7 * 86400000),
            ),
          ],
        );
        await audit(c, null, "participation.verified", t.poll_id);
        return t.mode;
      });
      reply.setCookie("participant_session", session, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: mode === "email" ? 86400 : 7 * 86400,
      });
      return { ok: true };
    },
  );
  app.post("/api/participation/logout", async (req, reply) => {
    if (req.cookies.participant_session)
      await transaction(async (c) => {
        await lockState(c);
        await c.execute("DELETE FROM participant_sessions WHERE token_hash=?", [
          digest(req.cookies.participant_session!),
        ]);
      });
    reply.clearCookie("participant_session", { path: "/" });
    return { ok: true };
  });
}
