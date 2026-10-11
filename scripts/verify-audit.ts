import { rows, pool } from "../packages/database/index.js";
import { verifyAuditEvents, type AuditEvent } from "../packages/database/audit-verification.js";
try {
  const previous = verifyAuditEvents(await rows<AuditEvent>("SELECT * FROM audit_events ORDER BY sequence"));
  console.log(
    "Auditkette gültig. Extern gesicherten letzten Hash vergleichen: " +
      previous,
  );
} finally {
  await pool.end();
}
