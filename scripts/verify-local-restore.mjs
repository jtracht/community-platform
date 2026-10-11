import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { verifyAuditEvents } from "../dist/packages/database/audit-verification.js";
if (process.env.TEST_MYSQL !== "true")
  throw new Error("Nur für lokale Docker-Testdatenbanken mit TEST_MYSQL=true.");
const container = process.env.TEST_MYSQL_CONTAINER ?? "umfrage-mysql-1";
if (!/^[a-zA-Z0-9_-]+$/.test(container))
  throw new Error("Ungültiger Containername.");
const target =
  "community_restore_" + randomUUID().replaceAll("-", "").slice(0, 12);
const dockerArgs = ["exec", "-e", "MYSQL_PWD", container];
const commandEnv = { ...process.env, MYSQL_PWD: process.env.TEST_MYSQL_ROOT_PASSWORD ?? "development-only-root" };
const source = "community_test";
const dump = execFileSync(
  "docker",
  [
    ...dockerArgs,
    "mysqldump",
    "-uroot",
    "--single-transaction",
    "--hex-blob",
    "--set-gtid-purged=OFF",
    source,
  ],
  { maxBuffer: 32 * 1024 * 1024, env: commandEnv },
);
mkdirSync("backups", { recursive: true });
writeFileSync("backups/local-restore-test.sql", dump);
execFileSync("docker", [
  ...dockerArgs,
  "mysql",
  "-uroot",
  "-e",
  "CREATE DATABASE " + target,
], { env: commandEnv });
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "-e",
    "MYSQL_PWD",
    container,
    "mysql",
    "-uroot",
    target,
  ],
  { input: dump, maxBuffer: 32 * 1024 * 1024, env: commandEnv },
);
const count = (db) =>
  execFileSync(
    "docker",
    [
      ...dockerArgs,
      "mysql",
      "-uroot",
      "--batch",
      "--skip-column-names",
      db,
      "-e",
      "SELECT (SELECT COUNT(*) FROM polls),(SELECT COUNT(*) FROM votes),(SELECT COUNT(*) FROM ideas),(SELECT COUNT(*) FROM decisions),(SELECT COUNT(*) FROM audit_events),(SELECT COUNT(*) FROM migrations)",
    ],
    { encoding: "utf8", env: commandEnv },
  ).trim();
const original = count(source),
  restored = count(target);
if (original !== restored)
  throw new Error("Wiederhergestellte Datenzahlen weichen ab.");
const orphan = execFileSync(
  "docker",
  [
    ...dockerArgs,
    "mysql",
    "-uroot",
    "--batch",
    "--skip-column-names",
    target,
    "-e",
    "SELECT COUNT(*) FROM votes v LEFT JOIN polls p ON p.id=v.poll_id WHERE p.id IS NULL",
  ],
  { encoding: "utf8", env: commandEnv },
).trim();
if (orphan !== "0") throw new Error("Fremdschlüsselintegrität beschädigt.");
const readAudit = (db) => execFileSync("docker", [
  ...dockerArgs, "mysql", "-uroot", "--batch", "--raw", "--skip-column-names", db, "-e",
  "SELECT JSON_OBJECT('id',id,'actor_id',actor_id,'action',action,'target_id',target_id,'created_at',DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ'),'previous_hash',previous_hash,'event_hash',event_hash) FROM audit_events ORDER BY sequence",
], { encoding: "utf8", env: commandEnv, maxBuffer: 32 * 1024 * 1024 }).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const originalHash = verifyAuditEvents(readAudit(source));
if (verifyAuditEvents(readAudit(target)) !== originalHash) throw new Error("Wiederhergestellte Auditkette weicht ab.");
console.log("Auditkette der Quelle und des Restoreziels gültig und identisch.");
console.log(
  "Lokales Backup und Restore geprüft: " +
    target +
    "; Umfragen/Stimmen/Ideen/Entscheidungen/Audit/Migrationen: " +
    restored,
);
console.log(
  "Staging-Restore auf netcup bleibt ein gesonderter Produktionsnachweis.",
);
