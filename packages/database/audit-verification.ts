import { createHash } from "node:crypto";

export type AuditEvent = {
  id: string; actor_id: string | null; action: string; target_id: string;
  created_at: string; previous_hash: string; event_hash: string;
};

export function verifyAuditEvents(events: AuditEvent[]) {
  let previous = "0".repeat(64);
  for (const event of events) {
    const timestamp = new Date(event.created_at.includes("T")
      ? event.created_at : event.created_at.replace(" ", "T") + "Z").toISOString();
    const hash = createHash("sha256").update(JSON.stringify([
      previous, event.id, event.actor_id, event.action, event.target_id, timestamp,
    ])).digest("hex");
    if (previous !== event.previous_hash || hash !== event.event_hash)
      throw new Error("Auditkette beschädigt: " + event.id);
    previous = hash;
  }
  return previous;
}
