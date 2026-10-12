# Manueller Weg zum Livegang

Die fehlenden Betreiber- und Hostingangaben werden nach Wunsch des Product Owners später manuell ergänzt. Die technische Vorbereitung läuft davon unabhängig weiter. Dieses Dokument ist eine Arbeitsfolge, keine Produktionsfreigabe.

Die vollständige [Abnahmemappe](MANUAL-ACCEPTANCE.md) enthält konkrete Prüfschritte, erwartete Nachweise und eine private, versionsgebundene JSON-Vorlage. `node dist/scripts/launch-acceptance.js --template DATEI` bereitet sie vor; `--check DATEI` prüft ausschließlich die Vollständigkeit der manuellen Einträge.

Nach sicherer Owner-Einrichtung können Entwurf, Konfigurationsprüfung und Vorlagen auch im Adminbereich [Einrichtung](ADMIN-SETUP.md) vorbereitet werden. Dort gespeicherte Angaben verändern die laufende Konfiguration nicht; private Übernahme und Neustart bleiben kontrollierte Betriebsschritte.

1. `.env.example` nach `.env` kopieren. Eigene Datenbankzugänge und ein zufälliges `SESSION_SECRET` mit mindestens 32 Zeichen setzen. Beispiel- und Testwerte werden für das Produktionsgeheimnis abgewiesen. Die private Datei bleibt außerhalb des Webroots und von Git.
2. Domain, tatsächliche Node-Version, HTTPS, Proxy, App-Root und Neustartverfahren nach [HOSTING.md](HOSTING.md) prüfen. `SITE_URL` bezeichnet die HTTPS-Origin ohne Pfad oder abschließenden Schrägstrich, zum Beispiel `https://community.example.org`. Produktion verwendet `NODE_ENV=production`; `DEMO_MODE` entfernen. Die DB-Transportverschlüsselung oder den geschützten alternativen Transport dokumentieren.
3. Eigene endgültige Rechtstexte anhand [der Entwürfe](legal/README.md) bearbeiten, Betreibername, Anschrift und Kontakt ergänzen. Dienstleister, Verträge und Aufbewahrung bestätigen. Erst dann `LEGAL_REVIEWED=true` setzen. Die Rohdatenfrist mit `RAW_VOTE_RETENTION_DAYS` konfigurieren.
4. Datenbank sichern und Migrationen mit dem gesonderten Migrationszugang anwenden. Anschließend den eingeschränkten App-Zugang verwenden. Den Product Owner mit dem interaktiven Passwort-/TOTP-Setup anlegen. Die Startprüfung legt kein Konto an und ändert keine Daten.
5. Nach `npm run build` die Konfiguration mit `npm run preflight` prüfen. Mit `npm run preflight -- --database` zusätzlich DB-Erreichbarkeit, Migrationsprüfsummen, InnoDB, Plattformzustand und ein vorhandenes Owner-Konto lesend prüfen. Im installierten Release funktioniert `node --env-file=.env dist/scripts/preflight.js --database` ohne Entwicklungsabhängigkeiten.
6. Optionale Anbieter konfigurieren: SMTP für verifizierte Abstimmungen, GitHub für manuell genehmigte Issues und [Stripe](STRIPE.md) für eingebettete Zahlungen. Die Prüfung meldet fehlende optionale Anbieter; sie führt keinen Mailversand, GitHub-Schreibzugriff oder Zahlung aus. Ein vorhandener Schlüssel allein belegt keine funktionierende Integration.
7. Cron/Wartung einrichten, Login, Testumfrage, Ergebnisregeln, Mailzustellung und aktivierte externe Anbieter im Staging prüfen. Backup/Restore und Rollback nach [OPERATIONS.md](OPERATIONS.md) nachvollziehbar protokollieren.
8. Release und Livegang durch den Product Owner freigeben. Ein erfolgreiches Prüfergebnis bestätigt nur die geprüften technischen Merkmale und ersetzt weder Hostingnachweise noch die Prüfung der Rechtstexte.

## Ergebnisse der Startprüfung

`OK` bezeichnet eine erfüllte technische Voraussetzung. `OFFEN` bezeichnet einen erkannten Konfigurations- oder Datenbankblocker; der Prozess endet mit Exitcode 1. `HINWEIS` kennzeichnet optionale Anbieter oder separat nachzuweisende Betriebsbedingungen. Exitcode 0 bedeutet keine erkannten Blocker im geprüften Umfang. Ohne `--database` wird keine Datenbankverbindung hergestellt. `--json` liefert dieselben Ergebnisse für Betriebsskripte; keine Zugangsdaten, Betreiberanschriften oder E-Mail-Adressen werden ausgegeben. Unbekannte Argumente ergeben Exitcode 2.

Die Prüfung kann keine tatsächliche SMTP-Zustellung, korrekte Stripe-Empfänger, abgeschlossene Auftragsverarbeitungsverträge, Cron-Ausführung oder Wiederherstellbarkeit garantieren. Diese Nachweise sind manuell zu ergänzen. Die Datenbankprüfung liest vorhandene Tabellen und Prüfsummen; sie führt keine Migrationen oder Reparaturen aus.

CI prüft das heruntergeladene Anwendungsartefakt zusätzlich in einer separaten Installation mit `npm ci --omit=dev`. Dabei werden der kompilierte Server, die lokalen Animationsdateien, Rechtstextseiten und die Sperre unvollständiger Produktionskonfiguration geprüft. Das ersetzt keinen Test auf dem konkreten netcup-Vertrag.
