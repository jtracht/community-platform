import {
  pool,
  query,
  transaction,
  lockState,
  audit,
} from "../packages/database/index.js";
import { z } from "zod";
export async function applyRetention() {
  if (!process.env.RAW_VOTE_RETENTION_DAYS) return;
  const days = z.coerce
    .number()
    .int()
    .min(7)
    .max(3650)
    .parse(process.env.RAW_VOTE_RETENTION_DAYS);
  await transaction(async (c) => {
    await lockState(c);
    const polls = await query<{ id: string }>(
      c,
      "SELECT p.id FROM polls p JOIN decisions d ON d.poll_id=p.id WHERE p.status IN ('closed','archived') AND p.released=TRUE AND p.ends_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL ? DAY)",
      [days],
    );
    for (const p of polls) {
      const count = (
        await query<{ total: number }>(
          c,
          "SELECT COUNT(*) AS total FROM votes WHERE poll_id=?",
          [p.id],
        )
      )[0]!.total;
      if (!Number(count)) continue;
      await c.execute(
        "DELETE a FROM idea_appeals a JOIN ideas i ON i.id=a.idea_id WHERE i.poll_id=?",
        [p.id],
      );
      await c.execute(
        "DELETE h FROM idea_history h JOIN ideas i ON i.id=h.idea_id WHERE i.poll_id=?",
        [p.id],
      );
      await c.execute(
        "UPDATE ideas SET duplicate_of=NULL WHERE duplicate_of IN (SELECT id FROM (SELECT id FROM ideas WHERE poll_id=?) AS erased)",
        [p.id],
      );
      await c.execute("DELETE FROM ideas WHERE poll_id=?", [p.id]);
      await c.execute(
        "DELETE b FROM ballot_reviews b JOIN votes v ON v.id=b.vote_id WHERE v.poll_id=?",
        [p.id],
      );
      await c.execute("DELETE FROM votes WHERE poll_id=?", [p.id]);
      await audit(c, null, "privacy.retention_raw_deleted", p.id);
    }
  });
}
if (
  process.argv[1]?.endsWith("retention.ts") ||
  process.argv[1]?.endsWith("retention.js")
) {
  try {
    await applyRetention();
  } finally {
    await pool.end();
  }
}
