# Fortschritt gegenüber dem Masterprompt

Stand: 12. Oktober 2026 · Entwicklungsstand v0.1.4; veröffentlicht ist v0.1.3.

## Einrichtungseinstellungen

Die zusätzlich beauftragte zentrale Einrichtung ist implementiert: Owner-Zugriff, persistenter Entwurf für nicht geheime Konfigurationsfelder, Versionskonfliktschutz, tatsächlicher Serverstatus, auditierte Konfigurations-/Abnahmevorlagendownloads und geführte manuelle Prüfschritte. Nachweise: ADMIN-SETUP.md, Migration 010, zwei zusätzliche Fach-/API-Tests und eine zusätzliche Browser-/Accessibilityprüfung. Insgesamt 30 Fach-/MySQL-/API-Tests und 14 Browserprüfungen. **31/31 = 100 %** des vereinbarten Entwicklungs- und Vorbereitungsumfangs. Entwurfsänderungen aktivieren keine laufende Serverkonfiguration, keine Rechtstextfreigabe und keinen Livegang. Die tatsächlichen Betriebsnachweise des ursprünglichen Masterprompts bleiben offen: 28/32 = 87,5 %.

## Vollständige Vorbereitung der manuellen Abnahme

Die zusätzlich beauftragte Abnahmevorbereitung ist umgesetzt: MANUAL-ACCEPTANCE.md nennt 16 konkrete Prüfbereiche, erwartete Nachweise und fehlende tatsächliche Angaben. Das ausführbare Werkzeug erstellt private Vorlagen ohne Überschreiben und prüft Status, Verantwortliche, Nachweisreferenzen, Zeitfolge und Bindung an Version/Quellcommit des installierten Pakets. Es prüft keine tatsächlichen Nachweise und ändert keine Produktionssperren. Ein zusätzlicher Fachtest prüft unvollständige Angaben, falsche Paketbindung, ungültige Zeitpunkte und zu frühe Abschlussfreigabe; die Paketinstallation prüft das kompilierte Werkzeug ebenfalls. **30/30 = 100 % des aktuell vereinbarten Entwicklungs- und Vorbereitungsumfangs** sind umgesetzt. Die ursprünglichen vier manuellen Betriebsblöcke sind vorbereitet, aber weiterhin nicht tatsächlich abgenommen: ursprünglicher Masterprompt weiterhin 28/32 = 87,5 %.

## Neue freigegebene Admin-Erweiterung

Der Product Owner hat Sicherheitsberichte und Prüfprotokolle als nächste Funktion beauftragt. Dieser zusätzliche Block ist umgesetzt und als v0.1.2 veröffentlicht: geschützte Momentaufnahmen, manuelle Prüfungen mit Verantwortlichen, unverändert erhaltene Originaleinträge, serialisierte Folgeprüfungen und auditierter JSON-Export. Nachweis: SECURITY-REPORTS.md, Migration 009, zwei zusätzliche Fach-/API-Tests und ein zusätzlicher Browser-/Accessibilitytest. Für v0.1.2 bestanden 27 Fach-/MySQL-/API-Tests und 13 Browserprüfungen. Damit waren **29/29 = 100 %** des damaligen vereinbarten Entwicklungsumfangs erfüllt. Die historische Abdeckung des ursprünglichen Masterprompts bleibt 28/32 = 87,5 %; die Erweiterung ist kein Ersatz für ausgeschlossene Betriebsnachweise.

Die früher genannten 85 % waren eine grobe Schätzung. Künftig verwenden wir 32 gleich gewichtete, überprüfbare Anforderungsblöcke aus dem Masterprompt. Ein Block zählt erst, wenn Umsetzung und der hier genannte Nachweis vorhanden sind. Der Wert beschreibt Abnahmedeckung, keine Schätzung von Arbeitsstunden. 28 von 32 Blöcken sind erfüllt: **87,5 %, gerundet 88 %**. Noch unbeschlossene zukünftige Communitymodule zählen nicht als fehlende Startfunktionen; ihr Erweiterungsrahmen zählt ausdrücklich mit.

## Vom Product Owner geänderter Abschlussumfang

Am 11. Oktober 2026 hat der Product Owner ausdrücklich die Blöcke 29–32 aus der aktuellen Abnahme herausgenommen und die Veröffentlichung nach Prüfung der verbleibenden Anforderungen angeordnet. Damit sind **28 von 28 Anforderungen des vereinbarten verbleibenden Startumfangs erfüllt: 100 %**. Die Prüfung berücksichtigt Implementierung, vorhandene automatisierte Nachweise und dokumentierte Betriebsverfahren. Testumgebungen und synthetische Betreibertexte ersetzen keine echten Produktionsnachweise.

Für den ursprünglichen Masterprompt einschließlich der nun ausgeschlossenen Betriebsnachweise bleibt der vergleichbare Stand **28/32 = 87,5 %**. Die 100-%-Angabe gilt ausdrücklich für den geänderten Abschlussumfang, nicht als Behauptung eines geprüften netcup-Livebetriebs. Die Ausschlüsse deaktivieren keine Sicherheitssperren und implementieren keine zusätzlichen öffentlichen Communitymodule.

| Nr. | Anforderungsblock | Status | Nachweis |
| --- | --- | --- | --- |
| 1 | Modularer TypeScript-/Node-Monolith, getrennte öffentliche/admin/API-Bereiche | Erfüllt | ARCHITECTURE.md; apps und packages; strenge TypeScript-Prüfung |
| 2 | Typisierte MySQL-Datenhaltung und klare Paketgrenzen | Erfüllt | packages/database, packages/polls; parametrisiertes SQL |
| 3 | Migrationen, Fremdschlüssel, Indizes und InnoDB-Transaktionen | Erfüllt | Zehn SQL-Migrationen; MySQL-Integration und Migrationsprüfsummen |
| 4 | Höchstens eine aktive offizielle Hauptumfrage | Erfüllt | Singleton-Sperre; Integration und Parallelitätstests |
| 5 | Entwurf, Terminierung, Start/Ende, Pause und Übergänge | Erfüllt | service.ts, Administration; API- und Phasentests |
| 6 | Freitext, Single-/Multiple-Choice und Ranking | Erfüllt | Fachtests sowie Browserprüfungen |
| 7 | Konsistente Validierung und parallele Stimmabgaben | Erfüllt | Transaktionen; 100 parallele Stimmen und doppelte Identitäten |
| 8 | Teilnahmeabhängiger Schutz gegen doppelte gültige Stimmen | Erfüllt | Unique-Key; Verifizierung und Integrationstests |
| 9 | Ergebnisregeln und gesperrte/veröffentlichte Ergebnisse | Erfüllt | Vier Sichtbarkeitsregeln; Fach-/API-/Browsertests |
| 10 | Prozentwerte, Borda, Quorum, Gleichstände und eingefrorene Regeln | Erfüllt | packages/polls; Auswertungstests und Entscheidungen |
| 11 | Offengelegte Grenzen anonymer Teilnahme | Erfüllt | Regeln und Datenschutzdokumentation; korrekter Hinweis auf Pseudonymität |
| 12 | E-Mail-/Kontoverifizierung, minimale Daten, Missbrauchsschutz | Erfüllt | Gehashte Token, verschlüsselte Mailjobs; Verifizierungs-/Ratentests. Tatsächliche Mailzustellung siehe Block 31 |
| 13 | Flexible Communityprozessschritte und historisierte Entscheidungen | Erfüllt | workflow.ts; Entscheidungsereignisse, Audit und Integration |
| 14 | Zentrales geschütztes Dashboard und vollständige Umfrageverwaltung | Erfüllt | apps/admin, autorisierte APIs und Browser-/Integrationstests |
| 15 | Ideenmoderation, Spam-/Duplikathinweise, Historie, Merge, Einsprüche, Massenaktionen | Erfüllt | workflow.ts; erweitertes Integrationsszenario |
| 16 | Zentrale Entscheidungen, Bewertungen und Referenzen | Erfüllt | Entscheidungs-/Bewertungsverwaltung, Historie und GitHub-Verknüpfungen |
| 17 | Entwicklungsplanung, Abhängigkeiten, Teststatus, Version und PO-Freigabe | Erfüllt | Geschützte Planung und Freigabeprüfungen |
| 18 | Granulare Rechte, geschützte Owner-Rechte, Passwort/TOTP und Recovery | Erfüllt | auth.ts, Berechtigungs-/Replay-Tests; interaktives Offline-Setup |
| 19 | Modulmanifest, Registrierung, Abhängigkeiten, Flags, Health und kontrollierter Rollback | Erfüllt | packages/modules; Modul-/Berechtigungstests; keine fremde Codeinstallation |
| 20 | Sicherheitsereignisse, Fehlerbehandlung, Betrieb und Auditprüfung | Erfüllt | Admin-Betrieb, redigierte Protokolle, Hashkette und Manipulationstests |
| 21 | Wartung, Aufbewahrung und überprüfbarer Backup-/Restoreprozess | Erfüllt | maintenance/retention; automatisierter isolierter Restore mit Datenzahlen und identischer Auditkette. Hostingnachweis siehe Block 29 |
| 22 | GitHub-Issues nur nach Vorschau und ausdrücklicher Freigabe | Erfüllt | Manuelle API-Aktion; Duplikat-/Konflikttests |
| 23 | GitHub-Status, PRs, signierte Webhooks, Synchronisation und Fehlerbehandlung | Erfüllt | github.ts; signierte/deduplizierte Callbacks und simulierte externe APIs. Tatsächlicher Anbieterbetrieb siehe Block 31 |
| 24 | Datenexport, Löschung, Berichtigungsprozess und versionierte Beitragsbedingungen | Erfüllt | Datenschutz-API, Moderationshistorie, Betriebshandbuch und exakte Rechtstextfassung je Freitextstimme |
| 25 | Minimalistische, responsive, zugängliche Oberfläche; nur freigegebene Zusatzbereiche | Erfüllt | Browser-/Accessibilitytests 320–2560 Pixel; Projektinfo/Stripe ausdrücklich vom PO angefordert |
| 26 | Unit-/MySQL-/API-/Browser-/Accessibilityprüfungen und technische Sicherheitsgrundlagen | Erfüllt | CI, Origin-/Rechte-/CSP-/Cookieprüfungen, Abhängigkeitsaudit und kompilierter Produktionsmodus. Kein Anspruch auf unabhängigen Penetrationstest |
| 27 | Open-Source-Repository, genehmigte Apache-2.0-Lizenz und Beitrags-/Sicherheitsrichtlinien | Erfüllt | GitHub, LICENSE, CONTRIBUTING, SECURITY, geschützte main-/Tagregeln |
| 28 | Reproduzierbare Installationspakete und PO-gesteuerte Releasepipelines | Erfüllt | Zwei bytegleiche Paketläufe, SHA-256/Quellcommit; v0.1.0-Releaseentwurf erfolgreich erstellt |
| 29 | Tatsächlicher netcup-8000-Betrieb einschließlich HTTPS/Proxy/Cron/Prozesslimits/Staging-Restore/Rollback | Aus Abnahme genommen | Konkreter Account, Tarifgeneration, Domain und Betriebsnachweise fehlen; HOSTING.md beschreibt die Prüfschritte |
| 30 | Vollständige echte Betreiberangaben, Rechtstextfreigabe und Datenschutz-/Dienstleistervereinbarungen | Aus Abnahme genommen | Betreiber ergänzt die fehlenden Fakten manuell; Entwürfe werden im Produktionsstart abgewiesen |
| 31 | Reale SMTP-, GitHub- und aktivierte Stripe-Anbieterabnahme | Aus Abnahme genommen | Automatisierte Simulation vorhanden; echte Zustellung, Projektintegration und Stripe-Testzahlung fehlen |
| 32 | Produktionsabnahme, öffentlicher Release und tatsächlicher Livegang | Aus Abnahme genommen | PO hat die Softwareveröffentlichung v0.1.1 beauftragt; tatsächlicher Livegang nicht Bestandteil dieser Abnahme |

## Ursprüngliche Produktionsnachweise

Die vier ausgeschlossenen Blöcke bleiben als ausstehende tatsächliche Betriebsnachweise dokumentiert. Weitere Programmierung ersetzt keine Betreiberfakten, Hostingzugriff oder reale Anbieterprüfungen. Die vorhandenen Anleitungen ermöglichen deren spätere Ergänzung. Die aktuelle Freigabe umfasst das Software-Release; sie belegt keinen Livegang. Details: ACCEPTANCE.md, LAUNCH.md, HOSTING.md, STRIPE.md und GITHUB-RELEASES.md.
