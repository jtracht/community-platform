# Vorbereitete manuelle Abnahme

Stand: 12. Oktober 2026, vorbereitet für v0.1.3. Das Startsystem und die beauftragten privaten Admin-Erweiterungen sind implementiert. Tatsächliche Hosting-, Rechts-, Anbieter- und Livegangnachweise bleiben manuell zu erbringen. Zukünftige öffentliche Communitymodule gehören weiterhin nicht zum Startumfang.

## Private Nachweismappe anlegen

Das geprüfte Release installieren, SHA256SUMS vergleichen und RELEASE.json aufbewahren. Im App-Root ein privates Verzeichnis außerhalb des Webroots anlegen; es darf nicht öffentlich oder in Git verfügbar sein. `private-acceptance/` ist im Repository ignoriert. Auf Unix Zugriffsrechte 0700 für den Ordner und 0600 für Nachweise setzen; auf Windows entsprechende Benutzerberechtigungen verwenden. Keine Zugangsdaten, TOTP-Secrets, Zahlungsdaten oder personenbezogenen Stimmen in Nachweise kopieren.

Nach `npm ci --omit=dev` im installierten Release:

```sh
node dist/scripts/launch-acceptance.js --template private-acceptance/staging.json
node --env-file=.env dist/scripts/preflight.js --database --json > private-acceptance/preflight.json
node --env-file=.env dist/scripts/verify-audit.js
node dist/scripts/launch-acceptance.js --check private-acceptance/staging.json
```

Das Verzeichnis zuvor selbst anlegen. Die Vorlage überschreibt keine vorhandene Datei. Die Vorabprüfung liest Konfiguration und DB, führt weder Einrichtung noch Anbieteraktionen durch. Den Auditendhash separat extern sichern. Alle Befehle im App-Root ausführen. Datenbanken und Secrets für Staging/Produktion strikt trennen.

In staging.json `sourceCommit` aus RELEASE.json übernehmen; `version` nicht auf einen anderen Release umschreiben. `environment` bezeichnet den tatsächlich geprüften Betrieb. Pro Prüfung `pending`, `passed` oder `failed`, verantwortliche Person, ISO-UTC-Zeitpunkt, private Nachweisreferenzen und Notiz eintragen. Beispiel: `evidence: ["hosting/runtime-protokoll.txt"]`; keine geheimen Werte. Die beschriebenen Prüfschritte stehen unten. Erst nach Abschluss aller Prüfungen die abschließende Owner-Freigabe dokumentieren. Für die Produktionsumgebung eine eigene neue Vorlage erzeugen, relevante Prüfungen tatsächlich wiederholen und deren Nachweise ergänzen.

Exitcode 0 bestätigt ausschließlich vollständig eingetragene manuelle Nachweise zum identischen Paketcommit mit abschließender Freigabe. Exitcode 1 bedeutet offene Nachweise oder fehlende/falsche Paketbindung; Exitcode 2 bedeutet ungültige Datei/Argumente. Ein Quellcheckout ohne RELEASE.json kann keine vollständige Paketabnahme erreichen. Die Ausgabe enthält nur Prüf-IDs und Status, keine Personen, Notizen oder Nachweisreferenzen. Der Prüfer verifiziert keine Dateien, Unterschriften oder tatsächlichen Durchführungsergebnisse. Die JSON-Datei ist bearbeitbar und keine manipulationssichere Freigabe. In einer extern geschützten betrieblichen Ablage versioniert sichern.

## Auszuführende Prüfungen und Nachweise

| ID | Durchführung | Erwarteter Nachweis |
| --- | --- | --- |
| hosting-runtime | Konkreten Vertrag und Tarifgeneration erfassen; Node-/DB-Version, InnoDB, verfügbare Ressourcen und Limits im WCP/SSH prüfen. Keine PHP-Memorywerte als Node-Limits übernehmen. | Accountbezogenes Protokoll nach HOSTING.md, keine Zugangsdaten |
| hosting-files | Neues Release außerhalb Webroot installieren; leeres Document-Root, Dateirechte, freie Kapazität, eingeschränkten App-DB-Zugang und getrennten Migrationszugang prüfen. | Pfade/Rechte und erfolgreiche Installation; Geheimnisse redigieren |
| https-proxy | Zertifikat, HTTP-Weiterleitung, Domain/Subdomain, Secure-Cookie und Origin-Abweisung prüfen. TRUSTED_PROXY nur nach bestätigter Proxy-IP konfigurieren. | HTTPS-/Headerprüfung und dokumentierte Proxyquelle |
| restart-cron | WCP-Neustart, Idle/Sleep-Verhalten und Cron mit dist/scripts/maintenance.js prüfen; parallele Wartungsläufe ohne inkonsistente Phasen. | Tatsächliche Laufzeiten, Neustartverfahren und Cronprotokoll |
| operator-legal | Vollständige Betreiberfakten und eigene Texte prüfen lassen; Entwurfsmarker entfernen, erst anschließend LEGAL_REVIEWED aktivieren. | Freigegebene Textversionen und verantwortliche Freigabe, siehe legal/README.md |
| privacy-process | Anbieter, Verträge, Zwecke und Aufbewahrung einschließlich Berichte/Backups klären; Export, Berichtigung und Löschung mit synthetischer Identität durchführen. | Freigegebenes Verzeichnis/Fristen und Verfahren nach VERIFICATION-AND-PRIVACY.md |
| owner-access | Sicheren Owner einrichten, TOTP/Login/Logout und Recovery prüfen; kritische Bereiche mit Moderator/Viewer testen. | Zugangstest ohne gespeicherte Passwörter, OTPs oder Recovery-Secrets |
| poll-journey | Im Staging vier aufeinanderfolgende Umfragen für alle Fragetypen ausführen; parallele/doppelte Stimmen, Ergebnisfreigabe, Countdown, Quorum, Zeitwechsel und Pause prüfen. | Erwartete/gezählte Ergebnisse und Statusfolge; immer nur eine Hauptumfrage |
| accessibility | Telefon, Tablet und Desktop, Tastatur, Screenreader und reduzierte Bewegung testen; Rechtslinks, Menüs, Abstimmung und Admin bedienen. | Geräte/Hilfsmittel, Befunde, Korrekturen; echte Stripe-Formulare ergänzen |
| mail | Echten SMTP-Versand mit eigenen Testadressen, Ablauf und Wiederholungen sowie doppelte verifizierte Identität prüfen. | Zustell-/Verifizierungsergebnis, keine Token oder Nachrichteninhalte |
| github | Eigenes Test-Issue nach Vorschau ausdrücklich erstellen; Wiederholung, Status, PR-Verknüpfung, Webhook-Signatur und Konflikt prüfen. | Test-Issue-Referenz, erwartete Zustände und manuelle Freigaben; keine vertraulichen Inhalte veröffentlichen |
| stripe | STRIPE.md mit Testschlüsseln ausführen: Erfolg, Ablehnung, Bankauthentifizierung, Abbruch, Betrag/Empfänger und mobile Bedienung. | Redigiertes Testdashboard-/Statusprotokoll, keine Karten-/Kundendaten |
| backup-restore | Backup verschlüsselt separat sichern; in leere getrennte Staging-DB restaurieren, Datenzahlen, FK, Auditanker, Login und Auswertung vergleichen. | Dump-Prüfsumme, gemessene RPO/RTO, Restoreprotokoll nach OPERATIONS.md |
| rollback | Schreibzugriffe pausieren; vorige Version/kompatible DB/Secrets wiederherstellen, Neustart und Ergebnisse prüfen. Datenverlust seit Backup ausdrücklich bewerten. | Geprüftes Rückkehrverfahren, Zeiten, mögliche Verluste und Abbruchkriterien |
| release-package | Version/Commit/SHA-256 vergleichen, Produktionsabhängigkeiten installieren; Migration nach Backup, Owner und lesende DB-Vorabprüfung durchführen. | RELEASE.json, SHA256SUMS, Preflight ohne Blocker und gesondert bewertete Hinweise |
| owner-launch | Nach allen Prüfpunkten konkrete Umgebung, Version/Commit, offene Risiken und Wartungsfenster durch den Product Owner freigeben. | Letzte datierte Freigabe mit verantwortlicher Person und Protokollreferenz |

Anbieter können vorläufig deaktiviert bleiben. Das Abnahmeprotokoll zeigt ihren Nachweis dann weiterhin als offen; keine erfundene Erfolgsmeldung eintragen. Für einen begrenzten anonymen Start müssen verifizierte Umfragen deaktiviert bleiben, GitHub-Schreibzugriff fehlen und Stripe ohne Schlüssel bleiben. Eine abweichende Startfreigabe mit offenen Anbieterprüfungen ist eine gesonderte dokumentierte Product-Owner-Entscheidung; sie wird von diesem Vollständigkeitsprüfer nicht automatisch bestätigt.

## Noch zu liefernde Angaben

- Tatsächliche Domain, netcup-8000-Tarifgeneration und Accountkonfiguration einschließlich Pfaden, Limits und Neustart.
- Vollständige rechtliche Identität hinter Julian Tracht Digital Solutions, ladungsfähige Anschrift und öffentlicher Kontakt; weitere Pflichtangaben soweit tatsächlich zutreffend. Keine Angaben aus dem Markennamen ableiten.
- Freigegebene Rechtstexte, Dienstleistervereinbarungen, Beitragsnutzung sowie Fristen für Stimmen, Protokolle, Berichte und Backups.
- Eigene serverseitige Mail-/GitHub-/Stripe-Konfiguration und Nachweise der realen Integration. Zugangsdaten ausschließlich in privater Hostingkonfiguration hinterlegen.
- Verantwortliche für Betrieb, Wiederherstellung und Sicherheit; tatsächliche Messwerte und ausdrückliche Livegangfreigabe.

Kein automatisches Deployment, Zahlungsversuch, Versand oder GitHub-Schreibzugriff ist Teil dieses Werkzeugs. Die bestehenden Produktionssperren bleiben verbindlich. Softwareveröffentlichung auf GitHub und tatsächlicher Hosting-Livegang sind getrennte Schritte.
