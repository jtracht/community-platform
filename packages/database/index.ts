import mysql, { type RowDataPacket, type PoolConnection } from "mysql2/promise";
import { randomUUID, createHash } from "node:crypto";
import type { Poll } from "../polls/src/index.js";
export const pool = mysql.createPool({
  uri: process.env.DATABASE_URL!,
  connectionLimit: 4,
  timezone: "Z",
  dateStrings: true,
  jsonStrings: true,
  multipleStatements: false,
});
export type SqlValue = string | number | boolean | Date | null;
export async function rows<T = Record<string, unknown>>(
  sql: string,
  params: SqlValue[] = [],
): Promise<T[]> {
  const [r] = await pool.execute<RowDataPacket[]>(sql, params);
  return r as T[];
}
export async function transaction<T>(
  fn: (c: PoolConnection) => Promise<T>,
): Promise<T> {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const value = await fn(c);
    await c.commit();
    return value;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
export async function query<T = Record<string, unknown>>(
  c: PoolConnection,
  sql: string,
  params: SqlValue[] = [],
): Promise<T[]> {
  const [r] = await c.execute<RowDataPacket[]>(sql, params);
  return r as T[];
}
export function json<T>(x: unknown): T {
  return (typeof x === "string" ? JSON.parse(x) : x) as T;
}
export function toPoll(r: Record<string, unknown>): Poll {
  return {
    id: String(r.id),
    title: String(r.title),
    description: String(r.description),
    rules: json(r.rules),
    startsAt: String(r.starts_at).replace(" ", "T") + "Z",
    endsAt: String(r.ends_at).replace(" ", "T") + "Z",
    status: r.status as Poll["status"],
    released: Boolean(r.released),
  };
}
export async function audit(
  c: PoolConnection,
  actor: string | null,
  action: string,
  target: string,
) {
  // All callers lock platform_state first. This serializes the hash chain across processes.
  const previous =
    (
      await query<{ event_hash: string }>(
        c,
        "SELECT event_hash FROM audit_events ORDER BY sequence DESC LIMIT 1",
      )
    )[0]?.event_hash ?? "0".repeat(64);
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const hash = createHash("sha256")
    .update(JSON.stringify([previous, id, actor, action, target, timestamp]))
    .digest("hex");
  await c.execute(
    "INSERT INTO audit_events(id,actor_id,action,target_id,created_at,previous_hash,event_hash) VALUES(?,?,?,?,?,?,?)",
    [id, actor, action, target, new Date(timestamp), previous, hash],
  );
}
export async function lockState(c: PoolConnection) {
  return (
    await query<{
      current_poll_id: string | null;
      transition_mode: string;
      waiting_message: string;
      paused: boolean;
    }>(c, "SELECT * FROM platform_state WHERE id=1 FOR UPDATE")
  )[0]!;
}
