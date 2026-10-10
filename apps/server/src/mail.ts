import nodemailer from "nodemailer";
import { z } from "zod";
import {
  rows,
  query,
  transaction,
  lockState,
  audit,
} from "../../../packages/database/index.js";
import { decrypt } from "./auth.js";
export async function sendQueuedMail() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    requireTLS: true,
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASSWORD ?? "",
    },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    for (let i = 0; i < 10; i++) {
      const job = await transaction(async (c) => {
        await lockState(c);
        await c.execute(
          "UPDATE mail_jobs SET status='expired',payload_encrypted='' WHERE expires_at<=UTC_TIMESTAMP(3) AND status IN ('queued','sending')",
        );
        const j = (
          await query<{ id: string; payload_encrypted: string }>(
            c,
            "SELECT id,payload_encrypted FROM mail_jobs WHERE status='queued' AND expires_at>UTC_TIMESTAMP(3) ORDER BY created_at LIMIT 1 FOR UPDATE",
          )
        )[0];
        if (j)
          await c.execute("UPDATE mail_jobs SET status='sending' WHERE id=?", [
            j.id,
          ]);
        return j;
      });
      if (!job) break;
      try {
        const p = z
          .object({ to: z.email(), subject: z.string(), text: z.string() })
          .parse(JSON.parse(decrypt(job.payload_encrypted)));
        await transport.sendMail({
          ...p,
          from: process.env.SMTP_FROM,
          messageId:
            "<" + job.id + "@" + new URL(process.env.SITE_URL!).hostname + ">",
        });
        await transaction(async (c) => {
          await lockState(c);
          await c.execute(
            "UPDATE mail_jobs SET status='sent',payload_encrypted='' WHERE id=?",
            [job.id],
          );
          await audit(c, null, "mail.sent", job.id);
        });
      } catch {
        await transaction(async (c) => {
          await lockState(c);
          await c.execute(
            "UPDATE mail_jobs SET status='uncertain',payload_encrypted='',last_error='SMTP-Zustellung unklar; erneute Verifizierungsanfrage erforderlich.' WHERE id=?",
            [job.id],
          );
          await audit(c, null, "mail.uncertain", job.id);
        });
      }
    }
  } finally {
    transport.close();
  }
}
