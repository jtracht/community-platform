import { z } from "zod";

export const launchChecks = [
  ["hosting-runtime", "Hosting", "Tarifgeneration, Node-Patchstand, MySQL-Version, InnoDB und Prozess-/Speicherlimits auf dem tatsächlichen Account nachweisen."],
  ["hosting-files", "Hosting", "App-/Document-Root, Schreibrechte, freien Speicher, Secretablage außerhalb Webroot und eingeschränkten DB-Zugang prüfen."],
  ["https-proxy", "Hosting", "Zertifikat, HTTPS-Weiterleitung, Subdomain und ausschließlich verifizierte Proxy-Adressen prüfen."],
  ["restart-cron", "Hosting", "Neustart, Idle-Verhalten und tatsächliche Cron-Ausführung einschließlich paralleler Wartungsaufrufe protokollieren."],
  ["operator-legal", "Recht und Datenschutz", "Vollständigen rechtlichen Betreiber, Anschrift, Kontakt und endgültige Informations-/Beitragsbedingungen fachlich freigeben."],
  ["privacy-process", "Recht und Datenschutz", "Dienstleistervereinbarungen, Zweckbindung, Export, Berichtigung, Löschung und Fristen für Logs, Berichte und Backups freigeben."],
  ["owner-access", "Staging", "Passwort/TOTP, Wiederherstellung, Logout, Rollen und verweigerte kritische Zugriffe mit echten Stagingkonten prüfen."],
  ["poll-journey", "Staging", "Alle vier Fragetypen, Auswahlgrenzen, doppelte Stimmen, Ergebnisregeln, Zeitwechsel und Wartungszustand im installierten Paket prüfen."],
  ["accessibility", "Staging", "Mobil/Tablet, Tastatur, Screenreader, reduzierte Bewegung und echte externe Formulare manuell prüfen."],
  ["mail", "Anbieter", "Tatsächliche Verifizierungsmail, Ablauf/Wiederholung und Zustellung prüfen; bei deaktivierter Mail keine verifizierten Umfragen veröffentlichen."],
  ["github", "Anbieter", "Vorschau, bewusste Issue-Erstellung, Status, signierten Webhook und Konflikt mit einem eigens angelegten Test-Issue prüfen."],
  ["stripe", "Anbieter", "Echte Stripe-Testzahlung, Ablehnung, Authentifizierung und Empfänger/Betrag prüfen; Live-Schlüssel erst nach Freigabe aktivieren."],
  ["backup-restore", "Betrieb", "Verschlüsseltes Backup in getrennte Staging-DB restaurieren; Datenzahlen, Auditanker, Login, RPO und RTO nachweisen."],
  ["rollback", "Betrieb", "Vorige Anwendungsversion mit passender Datenbank und Secrets wiederherstellen; Schreibpause und mögliche Datenverluste berücksichtigen."],
  ["release-package", "Betrieb", "Quellcommit, Releaseversion, SHA-256, Installation ohne Entwicklungsabhängigkeiten und lesende Vorabprüfung mit Datenbank bestätigen."],
  ["owner-launch", "Freigabe", "Product Owner bestätigt den konkreten geprüften Stand und das Wartungs-/Livegangfenster nach allen vorangehenden Prüfungen."],
] as const;

const checkSchema = z.object({
  id: z.string(), status: z.enum(["pending", "passed", "failed"]),
  reviewer: z.string().max(160), checkedAt: z.string(),
  evidence: z.array(z.string().min(1).max(500)).max(20), notes: z.string().max(2000),
}).strict();
export const acceptanceSchema = z.object({
  schemaVersion: z.literal(1), version: z.string(), sourceCommit: z.string(),
  environment: z.enum(["staging", "production"]), createdAt: z.iso.datetime(),
  checks: z.array(checkSchema).length(launchChecks.length),
}).strict();

export function acceptanceTemplate(version: string) {
  return { schemaVersion: 1, version, sourceCommit: "", environment: "staging", createdAt: new Date().toISOString(),
    checks: launchChecks.map(([id]) => ({ id, status: "pending", reviewer: "", checkedAt: "", evidence: [], notes: "" })) };
}

export function assessAcceptance(input: unknown, version: string, sourceCommit?: string, now = Date.now()) {
  const record = acceptanceSchema.parse(input);
  const expected = new Set<string>(launchChecks.map(([id]) => id));
  const ids = record.checks.map(check => check.id);
  if (new Set(ids).size !== expected.size || ids.some(id => !expected.has(id)))
    throw new Error("Unvollständige oder unbekannte Prüfliste.");
  const bindingValid = record.version === version && /^[a-f0-9]{40}$/.test(record.sourceCommit)
    && record.sourceCommit === sourceCommit
    && Date.parse(record.createdAt) <= now;
  const checks = record.checks.map(check => {
    const dateValid = z.iso.datetime().safeParse(check.checkedAt).success;
    const complete = check.status === "passed" && check.reviewer.trim().length > 0
      && check.evidence.every(value => value.trim().length > 0) && check.evidence.length > 0
      && dateValid && Date.parse(check.checkedAt) >= Date.parse(record.createdAt)
      && Date.parse(check.checkedAt) <= now;
    return { id: check.id, status: complete ? "documented" : "open" };
  });
  const launch = record.checks.find(check => check.id === "owner-launch")!;
  const approvalLast = checks.every(check => check.status === "documented")
    && record.checks.every(check => Date.parse(check.checkedAt) <= Date.parse(launch.checkedAt));
  return { version, bindingValid, documented: checks.filter(check => check.status === "documented").length,
    total: checks.length, documentationComplete: bindingValid && approvalLast, checks,
    notice: "Nur Vollständigkeit manuell eingetragener Nachweise geprüft. Keine unabhängige Prüfung, kein Deployment und keine Änderung der Produktionssperren." };
}
