import { phases } from "../apps/server/src/service.js";
import { pool } from "../packages/database/index.js";
try {
  await phases();
  await pool.execute("DELETE FROM sessions WHERE expires_at<=UTC_TIMESTAMP(3)");
  console.log("Zeitfenster geprüft und abgelaufene Sitzungen entfernt.");
} finally {
  await pool.end();
}
