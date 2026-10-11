import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { assertProductionLegalContent, loadLegalContent, type LegalContent } from "./legal-content.js";

export type ReadinessCheck = {
  id: string;
  status: "pass" | "blocker" | "warning";
  message: string;
};
export type ReadinessReport = {
  configurationReady: boolean;
  databaseChecked: boolean;
  checks: ReadinessCheck[];
  manualChecks: string[];
};
export function assertProductionSessionSecret(secret: string | undefined) {
  if (!secret || secret.length < 32 ||
      /replace-with|change-me|development-only|ci-test|local-test|test-secret/i.test(secret))
    throw new Error("Produktionsstart blockiert: SESSION_SECRET durch einen eigenen zufälligen Wert mit mindestens 32 Zeichen ersetzen.");
}

function databaseUrl(env: NodeJS.ProcessEnv) {
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    if (url.protocol !== "mysql:" || !url.hostname || !url.username || !url.password ||
        url.pathname === "/" || /change-me|development-only/.test(decodeURIComponent(url.password))) return null;
    return url;
  } catch { return null; }
}

export async function configurationChecks(env: NodeJS.ProcessEnv = process.env, nodeVersion = process.versions.node, legal?: LegalContent) {
  const checks: ReadinessCheck[] = [];
  const add = (id: string, ok: boolean, message: string, warning = false) =>
    checks.push({ id, status: ok ? "pass" : warning ? "warning" : "blocker", message });
  add("node", [22, 24].includes(Number(nodeVersion.split(".")[0])), "Node.js 22 oder 24 gemäß Projektanforderung verwenden.");
  add("environment", env.NODE_ENV === "production", "Für den Produktivbetrieb NODE_ENV=production setzen.");
  let secureSite = false;
  try {
    const site = new URL(env.SITE_URL ?? "");
    secureSite = site.protocol === "https:" && env.SITE_URL === site.origin &&
      !["localhost", "127.0.0.1", "[::1]"].includes(site.hostname) && !site.hostname.endsWith(".invalid");
  } catch { /* Only the check result is returned, never configuration contents. */ }
  add("site", secureSite, "Eine öffentliche HTTPS-Adresse ohne Pfad, abschließenden Schrägstrich oder Zugangsdaten konfigurieren; Zertifikat separat prüfen.");
  let secretReady = true;
  try { assertProductionSessionSecret(env.SESSION_SECRET); } catch { secretReady = false; }
  add("session", secretReady, "Eigenes zufälliges SESSION_SECRET mit mindestens 32 Zeichen hinterlegen.");
  add("database-config", Boolean(databaseUrl(env)), "MySQL-Zugang mit eigenen Zugangsdaten konfigurieren.");
  add("database-tls", env.DATABASE_TLS === "true", "DB-Transportverschlüsselung aktivieren oder den abweichenden geschützten Transport beim Hoster nachweisen.", true);
  let legalReady = true;
  try { assertProductionLegalContent(legal ?? await loadLegalContent(env)); } catch { legalReady = false; }
  add("legal", legalReady, "Betreiberangaben und endgültige Rechtstexte ergänzen, prüfen und freigeben.");
  add("demo", env.DEMO_MODE !== "true", "DEMO_MODE vor dem Produktivbetrieb entfernen.");
  const days = Number(env.RAW_VOTE_RETENTION_DAYS);
  add("retention", Number.isInteger(days) && days >= 7 && days <= 3650, "Freigegebene Rohdatenfrist zwischen 7 und 3650 Tagen konfigurieren; externe Fristen gesondert festlegen.");
  add("smtp", Boolean(env.SMTP_HOST && env.SMTP_FROM), "SMTP für E-Mail-Verifizierung konfigurieren und Zustellung separat testen.", true);
  add("github", Boolean(env.GITHUB_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? "")), "GitHub-Token und Repository für die manuelle Issue-Erstellung konfigurieren und separat testen.", true);
  const stripe = /^sk_live_[a-zA-Z0-9]+$/.test(env.STRIPE_SECRET_KEY ?? "") &&
    /^pk_live_[a-zA-Z0-9]+$/.test(env.STRIPE_PUBLISHABLE_KEY ?? "");
  add("stripe", stripe, "Livezahlung benötigt passende Stripe-Live-Schlüssel und eine vorherige echte Testzahlung. Ohne Konfiguration bleibt Checkout deaktiviert.", true);
  return checks;
}

export async function assertProductionConfiguration(env: NodeJS.ProcessEnv = process.env, legal?: LegalContent) {
  const blockers = (await configurationChecks(env, process.versions.node, legal))
    .filter((check) => check.status === "blocker");
  if (blockers.length)
    throw new Error("Produktionsstart blockiert: " + blockers.map((check) => check.message).join(" "));
}

export type DatabaseReader = <T>(sql: string) => Promise<T[]>;
export async function inspectDatabase(read: DatabaseReader): Promise<ReadinessCheck[]> {
  try {
    const [stored, files, owners, state, engines] = await Promise.all([
      read<{ name: string; checksum: string }>("SELECT name,checksum FROM migrations"),
      readdir("packages/database/migrations"),
      read<{ total: number }>("SELECT COUNT(*) AS total FROM admins WHERE role='owner' AND disabled=FALSE AND password_hash<>'' AND totp_secret<>''"),
      read<{ total: number }>("SELECT COUNT(*) AS total FROM platform_state WHERE id=1"),
      read<{ total: number }>("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' AND engine<>'InnoDB'"),
    ]);
    const expected = files.filter((name) => name.endsWith(".sql")).sort();
    const recorded = new Map(stored.map((row) => [row.name, row.checksum]));
    const hashes = await Promise.all(expected.map(async (name) =>
      [name, createHash("sha256").update(await readFile("packages/database/migrations/" + name, "utf8")).digest("hex")] as const));
    const migrationReady = expected.length > 0 && recorded.size === expected.length &&
      hashes.every(([name, checksum]) => recorded.get(name) === checksum);
    return [
      { id: "database", status: "pass", message: "Datenbank erreichbar; ausschließlich lesende Abfragen ausgeführt." },
      { id: "migrations", status: migrationReady ? "pass" : "blocker", message: "Alle Migrationen dieser Version müssen vollständig und mit unveränderten Prüfsummen angewendet sein." },
      { id: "owner", status: Number(owners[0]?.total) > 0 ? "pass" : "blocker", message: "Ein aktiver Product Owner mit Passwort und TOTP muss eingerichtet sein; Login separat prüfen." },
      { id: "state", status: Number(state[0]?.total) === 1 ? "pass" : "blocker", message: "Der zentrale Plattformzustand muss vorhanden sein." },
      { id: "engine", status: Number(engines[0]?.total) === 0 ? "pass" : "blocker", message: "Anwendungstabellen müssen die transaktionale InnoDB-Engine verwenden." },
    ];
  } catch {
    return [{ id: "database", status: "blocker", message: "Datenbankprüfung nicht erfolgreich. Erreichbarkeit, Berechtigungen und Migrationen prüfen. Zugangsdaten werden nicht ausgegeben." }];
  }
}

export async function readinessReport(env: NodeJS.ProcessEnv = process.env, read?: DatabaseReader): Promise<ReadinessReport> {
  const checks = await configurationChecks(env);
  if (read) checks.push(...await inspectDatabase(read));
  return {
    configurationReady: !checks.some((check) => check.status === "blocker"),
    databaseChecked: Boolean(read),
    checks,
    manualChecks: [
      "Konkretes netcup-Hosting, Zertifikat, Proxy, Neustart und Prozesslimits anhand docs/HOSTING.md nachweisen.",
      "Cron, Mailzustellung, GitHub und Stripe mit den tatsächlich eingerichteten Anbietern prüfen.",
      "Backup, Restore, Rollback und Datenschutzverfahren im Staging nachweisen; Product Owner gibt den Livegang frei.",
    ],
  };
}
