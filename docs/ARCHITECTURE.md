# Architektur und Implementierungsplan

Stand: 10.10.2026. Keine Hostingverifikation des konkreten Vertrags vorhanden.

## Beschlossener Umfang

Öffentlich genau eine Umfrage oder Ergebnis-/Wartezustand und Pflichtinformationen. Vier Fragetypen. Verwaltung, Entscheidungen, Rollen, Betrieb und GitHub nur geschützt. Zusätzliche öffentliche Module benötigen eine dokumentierte Communityentscheidung und Product-Owner-Freigabe.

## ADR 001: Modularer Monolith

TypeScript strikt, Node.js 22/24 LTS, Fastify, statisches HTML und progressive JavaScript-Oberflächen. Ein Prozess, kein Redis, keine Worker oder WebSocket-Pflicht. Das Frontend benötigt weder SSR-Laufzeit noch Framework-Bundle; geringe Hostinglast und zugängliche native Formulare. Gemeinsame Fachlogik in packages/polls, SQL in packages/database, Module in packages/modules. Cron oder Requests führen terminierte Zustandswechsel aus. Apps/public und apps/admin sind getrennte Oberflächen desselben Ursprungs.

## ADR 002: MySQL und explizites SQL

mysql2 mit parametrisierten Abfragen statt ORM: überschaubares Schema, nachvollziehbare Sperren, keine nativen ORM-Binaries auf Shared Hosting. Typisierung der Fachobjekte durch Zod; SQL-Migrationen versioniert. InnoDB erforderlich. Ein Singleton-Datensatz serialisiert Veröffentlichung und Phasenwechsel. Stimmen sperren dieselbe Umfrage und verwenden einen Unique-Key auf Umfrage/Teilnahmeidentität. Regeln werden mit Veröffentlichung eingefroren. Anonyme Cookieidentitäten begrenzen doppelte Stimmen pro Browser, verhindern keine Cookie-Löschung oder Gerätewechsel.

## ADR 003: Sicherheit und Freigabe

Admin-Passwort mit scrypt, TOTP als zweiter Faktor, kurzlebige serverseitige Sitzungen, HttpOnly/SameSite-Cookies, Origin-Prüfung, Rate-Limits, CSP, redigierte Logs. Keine Registrierung administrativer Konten im Web. Initialisierung ausschließlich per interaktivem CLI. GitHub-Issues benötigen Vorschau und explizite Bestätigung; Releases entstehen als Entwurf aus genehmigten Tags. Produktionsdeployment erfordert geschützte GitHub-Umgebung. Apache-2.0 vom Product Owner freigegeben.

## Datenmodell

polls -> votes; platform_state -> aktuelle offizielle Umfrage; admins -> sessions; ideas -> idea_history; decisions -> development_tasks; github_links -> decisions; audit_events (append-only im Anwendungszugriff); modules. Alle Zeiten UTC. Abstimmungsantworten JSON, deren Form fachlich geprüft wird. Stimmenidentitäten werden mit zweckgebundenem HMAC pseudonymisiert. Protokolle enthalten keine Passwörter, Token oder Abstimmungsinhalte.

## Lieferreihenfolge

1. Ausführbarer anonymer MVP: vier Fragetypen, Regelversionen, Sichtbarkeit, transaktionale Einzelumfrage, Admin MFA, Tests und Installation.
2. Erweiterung des Startsystems: E-Mail/Kontoverifizierung, Ideenmoderation mit Historie und Einsprüchen, Entscheidungsworkflow, granulare Berechtigungen, Datenschutzverfahren, GitHub-Synchronisation und Wiederholungen.
3. Vollständige Abnahme mit realem MySQL, Browser-, Last-, Barrierefreiheits- und Sicherheitstests sowie netcup-Staging/Restore.
4. Erst danach Produktionsrelease. Optionale öffentliche Communitymodule sind kein Bestandteil dieser Schritte.

Der MVP ist nicht automatisch das vollständige erste Release. docs/ACCEPTANCE.md hält fehlende Nachweise fest.

## Erweiterter Datenzugriff

participants/participant_sessions/verification_tokens/mail_jobs bilden verifizierte Teilnahme ab; E-Mail-Inhalte sind verschlüsselt. admin_grants, idea_appeals, decision_events, evaluations, task_dependencies, workflow_config, schedule_history, module_history, legal_versions, ballot_reviews und security_events ergänzen die Verwaltung. github_links, evaluation_github_links, github_pr_links und github_deliveries trennen lokale Freigaben von Remote-Status. Gemeinsame DB-Ratenlimits liegen in rate_windows. Acht prüfsummengesicherte Migrationen; keine zusätzlichen öffentlichen Produktmodule.
