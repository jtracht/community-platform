import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pool, rows } from "../packages/database/index.js";
await pool.execute(
  "CREATE TABLE IF NOT EXISTS migrations(name VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL) ENGINE=InnoDB",
);
const c = await pool.getConnection();
try {
  const [lock] = await c.query(
    "SELECT GET_LOCK('community-migrations',30) AS acquired",
  );
  if (!Array.isArray(lock) || (lock[0] as { acquired: number }).acquired !== 1)
    throw new Error("Migrationssperre fehlt.");
  for (const name of (await readdir("packages/database/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("packages/database/migrations/" + name, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = (
      await rows<{ checksum: string }>(
        "SELECT checksum FROM migrations WHERE name=?",
        [name],
      )
    )[0];
    if (existing) {
      if (existing.checksum !== checksum)
        throw new Error("Migration nachträglich verändert: " + name);
      continue;
    }
    // MySQL DDL commits implicitly; restore a backup after partial failure, never rerun blindly.
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await c.query(statement);
    await c.execute("INSERT INTO migrations VALUES(?,?)", [name, checksum]);
    console.log("Angewendet: " + name);
  }
} finally {
  await c.query("SELECT RELEASE_LOCK('community-migrations')");
  c.release();
  await pool.end();
}
