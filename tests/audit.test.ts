import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyAuditEvents, type AuditEvent } from "../packages/database/audit-verification.js";

test("Audit verification rejects modified content, gaps and changed order", () => {
  const events: AuditEvent[] = [];
  let previous = "0".repeat(64);
  for (let i = 0; i < 3; i++) {
    const event = { id: String(i), actor_id: null, action: "test", target_id: "target",
      created_at: "2026-10-11T12:00:00.123Z", previous_hash: previous, event_hash: "" };
    event.event_hash = createHash("sha256").update(JSON.stringify([
      previous, event.id, event.actor_id, event.action, event.target_id, event.created_at,
    ])).digest("hex");
    previous = event.event_hash;
    events.push(event);
  }
  assert.equal(verifyAuditEvents(events), previous);
  assert.equal(verifyAuditEvents(events.map(e => ({ ...e, created_at: "2026-10-11 12:00:00.123" }))), previous);
  assert.throws(() => verifyAuditEvents(events.map((e, i) => i === 1 ? { ...e, action: "modified" } : e)), /beschädigt/);
  assert.throws(() => verifyAuditEvents(events.slice(1)), /beschädigt/);
  assert.throws(() => verifyAuditEvents([...events].reverse()), /beschädigt/);
});
