# Fortschritt gegenüber dem Masterprompt

Stand: 11. Oktober 2026 · Entwicklungsstand v0.1.1 · letzter Releaseentwurf v0.1.0.

Die früher genannten 85 % waren eine grobe Schätzung. Künftig verwenden wir 32 gleich gewichtete, überprüfbare Anforderungsblöcke aus dem Masterprompt. Ein Block zählt erst, wenn Umsetzung und der hier genannte Nachweis vorhanden sind. Der Wert beschreibt Abnahmedeckung, keine Schätzung von Arbeitsstunden. 28 von 32 Blöcken sind erfüllt: **87,5 %, gerundet 88 %**. Noch unbeschlossene zukünftige Communitymodule zählen nicht als fehlende Startfunktionen; ihr Erweiterungsrahmen zählt ausdrücklich mit.

Die technischen Startfunktionen sind umgesetzt. Die Gesamtfreigabe des Startumfangs ist weiterhin **88 %** und erreicht erst mit den vier ausstehenden externen Abnahmeblöcken 100 %. Testumgebungen und synthetische Betreibertexte ersetzen diese Nachweise nicht.

| Nr. | Anforderungsblock | Status | Nachweis |
| --- | --- | --- | --- |
| 1 | Modularer TypeScript-/Node-Monolith, getrennte öffentliche/admin/API-Bereiche | Erfüllt | ARCHITECTURE.md; apps und packages; strenge TypeScript-Prüfung |
| 2 | Typisierte MySQL-Datenhaltung und klare Paketgrenzen | Erfüllt | packages/database, packages/polls; parametrisiertes SQL |
| 3 | Migrationen, Fremdschlüssel, Indizes und InnoDB-Transaktionen | Erfüllt | Acht SQL-Migrationen; MySQL-Integration und Migrationsprüfsummen |
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
| 29 | Tatsächlicher netcup-8000-Betrieb einschließlich HTTPS/Proxy/Cron/Prozesslimits/Staging-Restore/Rollback | Offen | Konkreter Account, Tarifgeneration, Domain und Betriebsnachweise fehlen; HOSTING.md beschreibt die Prüfschritte |
| 30 | Vollständige echte Betreiberangaben, Rechtstextfreigabe und Datenschutz-/Dienstleistervereinbarungen | Offen | Betreiber ergänzt die fehlenden Fakten manuell; Entwürfe werden im Produktionsstart abgewiesen |
| 31 | Reale SMTP-, GitHub- und aktivierte Stripe-Anbieterabnahme | Offen | Automatisierte Simulation vorhanden; echte Zustellung, Projektintegration und Stripe-Testzahlung fehlen |
| 32 | Produktionsabnahme, öffentlicher Release und tatsächlicher Livegang | Offen | PO hat bisher den Entwurf v0.1.0 genehmigt; Veröffentlichung/Livegang noch ausstehend |

## Voraussetzung für 100 %

Die vier offenen Blöcke sind tatsächliche Betriebs- und Freigabenachweise. Weitere Programmierung kann fehlende Betreiberfakten, Hostingzugriff oder reale Anbieterprüfungen nicht ersetzen. Die vorhandenen Anleitungen ermöglichen deren kontrollierte Ergänzung, ohne zusätzliche öffentliche Funktionen einzuführen. Details: ACCEPTANCE.md, LAUNCH.md, HOSTING.md, STRIPE.md und GITHUB-RELEASES.md.
