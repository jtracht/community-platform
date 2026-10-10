import { createHash } from "node:crypto";
import { rows, pool } from "../packages/database/index.js";
try {
  let previous = "0".repeat(64);
  for (const e of await rows<{
    id: string;
    actor_id: string | null;
    action: string;
    target_id: string;
    created_at: string;
    previous_hash: string;
    event_hash: string;
  }>("SELECT * FROM audit_events ORDER BY sequence")) {
    const timestamp = new Date(
      e.created_at.replace(" ", "T") + "Z",
    ).toISOString();
    const hash = createHash("sha256")
      .update(
        JSON.stringify([
          previous,
          e.id,
          e.actor_id,
          e.action,
          e.target_id,
          timestamp,
        ]),
      )
      .digest("hex");
    if (previous !== e.previous_hash || hash !== e.event_hash)
      throw new Error("Auditkette beschädigt: " + e.id);
    previous = hash;
  }
  console.log(
    "Auditkette gültig. Extern gesicherten letzten Hash vergleichen: " +
      previous,
  );
} finally {
  await pool.end();
}
