import mysql, { type RowDataPacket } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { readinessReport, type DatabaseReader } from "../apps/server/src/readiness.js";

const args = process.argv.slice(2);
if (args.some((arg) => !["--database", "--json"].includes(arg))) {
  console.error("Aufruf: node --env-file=.env dist/scripts/preflight.js [--database] [--json]");
  process.exit(2);
}
let pool: mysql.Pool | undefined;
try {
  let read: DatabaseReader | undefined;
  if (args.includes("--database")) {
    try {
      pool = mysql.createPool({
        uri: process.env.DATABASE_URL ?? "mysql://invalid:invalid@127.0.0.1:1/invalid",
        connectionLimit: 1,
        connectTimeout: 5000,
        multipleStatements: false,
        ...(process.env.DATABASE_TLS === "true" ? { ssl: {
          rejectUnauthorized: true,
          ...(process.env.DATABASE_TLS_CA ? { ca: await readFile(process.env.DATABASE_TLS_CA, "utf8") } : {}),
        } } : {}),
      });
      const database = pool;
      read = async <T>(sql: string) => {
        const [result] = await database.query<RowDataPacket[]>({ sql, timeout: 5000 });
        return result as T[];
      };
    } catch {
      read = async () => { throw new Error("Database configuration unavailable"); };
    }
  }
  const report = await readinessReport(process.env, read);
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("Startprüfung — keine Migrationen, Einrichtung oder externen Zahlungen");
    for (const check of report.checks)
      console.log(`${check.status === "pass" ? "OK" : check.status === "blocker" ? "OFFEN" : "HINWEIS"} · ${check.message}`);
    console.log("Manuelle Nachweise:");
    for (const item of report.manualChecks) console.log("– " + item);
    console.log(report.configurationReady ? "Konfiguration ohne erkannte Blocker. Dies ist keine Produktionsfreigabe." : "Konfiguration noch nicht vollständig; offene Punkte bearbeiten.");
    if (!report.databaseChecked) console.log("Datenbank wurde nicht verbunden. Für die lesende Prüfung --database ergänzen.");
  }
  process.exitCode = report.configurationReady ? 0 : 1;
} finally {
  await pool?.end();
}
