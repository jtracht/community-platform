# Installation und Betrieb

## Lokal

Node.js 24 LTS und optional Docker installieren. `npm ci`; `docker compose up -d --wait`. `.env.example` nach `.env` kopieren; für lokale Docker-DB `DATABASE_URL=mysql://community:development-only@127.0.0.1:3307/community` setzen. SESSION_SECRET durch mindestens 32 zufällige Zeichen ersetzen. `node --env-file=.env --import tsx scripts/migrate.ts`; `node --env-file=.env --import tsx scripts/setup-admin.ts`. Passwort wird verdeckt eingegeben, TOTP-URI einmalig offline hinterlegen. `node --env-file=.env --import tsx apps/server/src/main.ts` oder `npm run build` und `npm start`.

## Produktion

Hostingnachweise in HOSTING.md zuerst durchführen. Getrennte Datenbanken und Secrets für Staging/Produktion. Releasetarball und Prüfsumme aus GitHub herunterladen und prüfen. In neues Releaseverzeichnis außerhalb des Webroots entpacken. `npm ci --omit=dev`. `.env` außerhalb öffentlicher statischer Verzeichnisse, Modus 0600. MySQL-Appbenutzer erhält SELECT/INSERT/UPDATE/DELETE, kein DDL; Migration separat mit zeitlich begrenztem DDL-Konto.

Migration per `node --env-file=.env dist/scripts/migrate.js` aus dem Releaseverzeichnis. Vorher Backup! MySQL-DDL ist nicht vollständig transaktional. Nach Teilfehler Backup restaurieren und Ursache beheben, Migration nicht blind erneut ausführen. Admin-Setup: `node --env-file=.env dist/scripts/setup-admin.js`. Im WCP Node-App aktivieren, App-Root auf Releaseverzeichnis, Startdatei `dist/apps/server/src/main.js`, Document-Root auf ein leeres dediziertes Verzeichnis; das komplette Repository darf niemals als Webroot dienen. HOST/PORT und Neustartverfahren konkret prüfen. Plattform liest eigene statische Dateien aus ihrem App-Root.

NODE_ENV=production, SITE_URL mit HTTPS, Betreiberangaben, geprüfte Datenschutz- und Beitragsbedingungen sowie LEGAL_REVIEWED=true konfigurieren. Produktionsstart verweigert fehlende Pflichtkonfiguration. Software- und Inhaltslizenz gesondert freigeben. Erst HTTPS, Login/TOTP, Testumfrage, alle Ergebnisse und /health auf Staging prüfen. Anschließend Product-Owner-Freigabe und Production-Umgebung aktivieren.

Rechtstexte können über `LEGAL_IMPRINT_FILE`, `LEGAL_PRIVACY_FILE` und `LEGAL_CONTRIBUTION_FILE` als UTF-8-Dateien eingelesen werden. Dateien liegen außerhalb des Webroots; relative Pfade beziehen sich auf den App-Root. Alternativ Inline-Texte verwenden, jedoch nicht gleichzeitig mit dem jeweiligen Dateipfad. Die [bearbeitbaren Entwürfe](legal/README.md) sind für die Vorschau vorgesehen. In Produktion werden fehlende Betreiberangaben, ungültige Kontakt-E-Mail, `ENTWURF`-/`[ERGÄNZEN: ...]`-Marker und nicht bestätigte Texte abgewiesen. Nach Textänderungen neu starten. Der Startcheck ersetzt keine inhaltliche rechtliche Prüfung.

## Updates und Rollback

Geschützte GitHub-Umgebung release-approval mit erforderlichem Reviewer @jtracht konfigurieren, sofern Tarif dies unterstützt. Bei nur einem Product Owner muss dieser eigene Tag-Läufe freigeben können; mit einem größeren Reviewteam Selbstfreigaben ausschließen. Tag-Regeln: nur Product Owner darf v*-Tags erstellen, main mit PR, Codeowner-Review und Quality-CI schützen. CI erstellt nur Releaseentwürfe. Automatisches Produktionsdeployment ist noch nicht eingerichtet, solange Hostingpfade und Neustartverfahren nicht verifiziert sind. Manuelles SFTP/SSH-Deployment ist der dokumentierte Startweg.

Im Repository jtracht/community-platform sind main-Schutz (CI-Job `test`, ein Codeowner-Review, keine Force-Pushes/Löschung), Release-Reviewer @jtracht und v*-Tagregeln bereits eingerichtet. Repositoryadministratoren können die Regeln bewusst übersteuern; aktuell liegt diese Rolle beim Product Owner. Secret-Scanning, Push-Protection und Dependabot-Sicherheitsupdates wurden aktiviert. Aktionen sind auf geprüfte Commit-SHAs fixiert. Keine Deployment-Secrets wurden hinterlegt.

Vor Update Wartungsfenster und DB-Backup. Neues Release separat installieren, Migrationen kontrollieren, WCP-App-Root umstellen und neu starten. Bei Fehler zum vorigen Verzeichnis wechseln. Bei inkompatibler Migration zusätzlich vorheriges DB-Backup wiederherstellen; seit Backup eingegangene Stimmen würden verloren gehen, daher während Migration Schreibzugriffe stoppen. Keine automatische irreversible Down-Migration.

## Backup und Restore

Mindestens täglicher `mysqldump --single-transaction --routines --triggers --hex-blob` mit privater MySQL-Optionsdatei (Passwort nie im Befehlsargument). Verschlüsselt außerhalb des Webroots und möglichst extern speichern. SESSION_SECRET verschlüsselt separat sichern, sonst sind TOTP-Secrets unlesbar und Abstimmungsidentitäten ändern sich. Anbieterbackups sind kein alleiniger Wiederherstellungsnachweis. RPO-Ziel 24 Stunden, RTO-Ziel 4 Stunden; tatsächliche Messung offen.

Restore zuerst in leere, getrennte Staging-DB: Dump mit `mysql --defaults-extra-file=... database < backup.sql` einspielen, passende Anwendungsversion und Secrets starten. Anzahl Umfragen/Stimmen, Fremdschlüssel, Auditkette, Login und Auswertungen prüfen. Restore regelmäßig protokollieren, niemals ungeprüft Produktionsdaten überschreiben. Backuprotation zunächst 7 tägliche/4 wöchentliche Sicherungen; endgültige Aufbewahrung vom Betreiber freigeben.

## Diagnose und Grenzen

/health prüft DB-Erreichbarkeit ohne Details. Logs protokollieren URLs, keine Bodies oder Cookies; Webserverlogs können IPs enthalten und müssen passend konfiguriert werden. Allgemeine Rate-Limits sind je Prozess; Login, Verifizierung und Abstimmung verwenden zusätzlich gemeinsame DB-Limits. Admins und Audit sind nur geschützt abrufbar. Rollen initial owner/moderator/viewer; Moderatorrechte für Ideenprüfung und separat vergebene Rechte; kritische Operationen ausschließlich owner. Keine automatische Ausführung fremder Module. Keine automatischen GitHub-POST-Retries: unklare Ergebnisse anhand eingebettetem Entscheidungsmarker manuell abgleichen. Cron kann `node --env-file=.env dist/scripts/maintenance.js` einmal pro Minute aufrufen; kein Dauerprozess. `dist/scripts/verify-audit.js` prüft die Auditkette. Deren Endhash extern unveränderlich sichern: DB-Administratoren können die Kette sonst neu schreiben; keine kryptografisch garantierte Unveränderlichkeit gegenüber Infrastrukturadministratoren.

## Tests

`npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`. MySQL-Tests: eigene leere DB migrieren und TEST_MYSQL=true sowie DATABASE_URL/SESSION_SECRET setzen. Tests schreiben Daten und dürfen ausschließlich eine isolierte Testdatenbank verwenden. Für Wiederholung neue DB erstellen. CI verwendet MySQL 8.4. Hostingversion gesondert prüfen.

Verifizierung, Recovery, GitHub-Synchronisation, Modulbetrieb und konkrete Aufbewahrung: [ergänzendes Betriebshandbuch](VERIFICATION-AND-PRIVACY.md). Testdatenbanken müssen _test als Suffix oder test_ als Präfix besitzen; die Tests verweigern andere Namen. Für die freiwillige Unterstützung gilt zusätzlich die [Stripe-Einrichtung](STRIPE.md).
