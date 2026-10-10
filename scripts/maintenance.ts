import { phases } from "../apps/server/src/service.js";
import { pool } from "../packages/database/index.js";
import { sendQueuedMail } from "../apps/server/src/mail.js";
import { scheduledGitHubSync } from "../apps/server/src/github.js";
import { applyRetention } from "./retention.js";
try {
  await phases();
  await sendQueuedMail();
  await scheduledGitHubSync();
  await applyRetention();
  await pool.execute(
    "DELETE FROM participant_sessions WHERE expires_at<=UTC_TIMESTAMP(3)",
  );
  await pool.execute(
    "DELETE FROM rate_windows WHERE expires_at<=UTC_TIMESTAMP(3)",
  );
  await pool.execute(
    "DELETE FROM security_events WHERE created_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 14 DAY)",
  );
  await pool.execute(
    "DELETE FROM github_deliveries WHERE received_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 DAY)",
  );
  await pool.execute(
    "DELETE FROM verification_tokens WHERE expires_at<=UTC_TIMESTAMP(3)",
  );
  await pool.execute(
    "DELETE FROM mail_jobs WHERE expires_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY)",
  );
  await pool.execute("DELETE FROM sessions WHERE expires_at<=UTC_TIMESTAMP(3)");
  console.log("Zeitfenster geprüft und abgelaufene Sitzungen entfernt.");
} finally {
  await pool.end();
}
