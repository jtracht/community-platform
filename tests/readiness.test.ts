import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { assertProductionConfiguration, assertProductionSessionSecret, inspectDatabase, readinessReport, type DatabaseReader } from "../apps/server/src/readiness.js";

const configured = {
  NODE_ENV: "production", SITE_URL: "https://community.example.org",
  SESSION_SECRET: "a7c92fe849bd3175a77f5c5b617d845eba615f92",
  DATABASE_URL: "mysql://app:own-test-password@db.example.org/community", DATABASE_TLS: "true",
  OPERATOR_NAME: "Testbetreiber", OPERATOR_ADDRESS: "Testanschrift", OPERATOR_EMAIL: "test@example.invalid",
  LEGAL_IMPRINT_TEXT: "Finale Anbieterinformationen", LEGAL_PRIVACY_TEXT: "Finale Datenschutzinformationen",
  LEGAL_CONTRIBUTION_TERMS: "Finale Beitragsbedingungen", LEGAL_REVIEWED: "true", RAW_VOTE_RETENTION_DAYS: "90",
};

test("Readiness refuses sample secrets and unresolved configuration without disclosing private values", async () => {
  for (const secret of [undefined, "short", "replace-with-at-least-32-random-characters", "ci-test-only-secret-at-least-32-characters"])
    assert.throws(() => assertProductionSessionSecret(secret), /blockiert/);
  assert.doesNotThrow(() => assertProductionSessionSecret(configured.SESSION_SECRET));
  const ready = await readinessReport(configured);
  assert.equal(ready.configurationReady, true);
  assert.equal(ready.databaseChecked, false);
  assert.ok(ready.checks.some((check) => check.id === "stripe" && check.status === "warning"));
  for (const changed of [
    { SITE_URL: "https://localhost" }, { NODE_ENV: "development" }, { DEMO_MODE: "true" },
    { SITE_URL: "https://community.example.org/subpath" },
    { DATABASE_URL: "mysql://app:change-me@db.example.org/community" }, { RAW_VOTE_RETENTION_DAYS: "0" },
    { LEGAL_PRIVACY_TEXT: "ENTWURF – unbekannte Datenverarbeitung" },
  ]) assert.equal((await readinessReport({ ...configured, ...changed })).configurationReady, false);
  const output = JSON.stringify(ready);
  for (const secret of [configured.SESSION_SECRET, configured.DATABASE_URL, configured.OPERATOR_EMAIL])
    assert.ok(!output.includes(secret));
});

test("Read-only database inspection detects missing or changed migrations and absent owner", async () => {
  const migrations = await Promise.all((await readdir("packages/database/migrations")).filter((name) => name.endsWith(".sql")).map(async (name) => ({
    name, checksum: createHash("sha256").update(await readFile("packages/database/migrations/" + name, "utf8")).digest("hex"),
  })));
  let altered = false, owner = true;
  const read: DatabaseReader = async <T>(sql: string) => {
    assert.match(sql, /^SELECT /);
    if (sql.includes("FROM migrations")) return (altered ? migrations.map((row, i) => i === 0 ? { ...row, checksum: "wrong" } : row) : migrations) as T[];
    if (sql.includes("FROM admins")) return [{ total: owner ? 1 : 0 }] as T[];
    return [{ total: sql.includes("information_schema") ? 0 : 1 }] as T[];
  };
  assert.ok((await inspectDatabase(read)).every((check) => check.status === "pass"));
  altered = true; owner = false;
  const checks = await inspectDatabase(read);
  assert.equal(checks.find((check) => check.id === "migrations")?.status, "blocker");
  assert.equal(checks.find((check) => check.id === "owner")?.status, "blocker");
  const error = await inspectDatabase(async () => { throw new Error("private-database-password"); });
  assert.equal(error[0]?.status, "blocker");
  assert.ok(!JSON.stringify(error).includes("private-database-password"));
});

test("Production startup enforces mandatory preflight configuration and never prints secrets", async () => {
  await assert.doesNotReject(() => assertProductionConfiguration(configured));
  for (const changed of [
    { DEMO_MODE: "true" }, { RAW_VOTE_RETENTION_DAYS: "" },
    { SITE_URL: "https://community.example.org/path" },
    { DATABASE_URL: "mysql://app:development-only@db.example.org/community" },
    { SITE_URL: "https://localhost" }, { LEGAL_REVIEWED: "false" },
  ]) {
    await assert.rejects(() => assertProductionConfiguration({ ...configured, ...changed }), (error: Error) => {
      assert.match(error.message, /Produktionsstart blockiert/);
      assert.ok(!error.message.includes(configured.SESSION_SECRET));
      assert.ok(!error.message.includes(configured.DATABASE_URL));
      assert.ok(!error.message.includes(configured.OPERATOR_EMAIL));
      return true;
    });
  }
});
