import { buildApp } from "./app.js";
import { pool } from "../../../packages/database/index.js";
import { loadLegalContent } from "./legal-content.js";
import { assertProductionConfiguration } from "./readiness.js";
if (
  !process.env.DATABASE_URL ||
  !process.env.SESSION_SECRET ||
  process.env.SESSION_SECRET.length < 32
)
  throw new Error("DATABASE_URL und starkes SESSION_SECRET erforderlich.");
const legal = await loadLegalContent();
if (process.env.NODE_ENV === "production") {
  await assertProductionConfiguration(process.env, legal);
}
const app = await buildApp(legal);
await app.listen({
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "127.0.0.1",
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
