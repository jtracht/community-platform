# Community Platform

Eine modulare Webplattform für Community-Umfragen und nachvollziehbare Entscheidungen. Die Community bestimmt die nächsten Funktionen; der Product Owner verantwortet Sicherheit, Umsetzung und Releases.

**Stand: ausführbares Startsystem, noch keine Produktionsfreigabe.** Der Startumfang zeigt öffentlich genau eine Hauptumfrage oder einen Ergebnis-/Wartezustand. Zusätzliche öffentliche Funktionen werden erst nach Communityentscheidung umgesetzt.

## Was funktioniert?

- Freitext-Ideensammlung, Single-Choice, Multiple-Choice und Prioritäten-Rankings.
- Transaktionale Stimmen, Umfragezeitplanung, feste Regeln, Quoren und konfigurierbare Ergebnisanzeige.
- Geschütztes Admin-Panel mit Passwort/TOTP, granularen Rechten, Ideenmoderation, Einsprüchen, Entscheidungen, Bewertungen und Entwicklungsfreigaben.
- Manuell genehmigte GitHub-Issues, PR-Verknüpfung, signierte Webhooks, Konfliktprüfung und Auditprotokolle.
- MySQL-Migrationen, Modulverwaltung, Datenschutzexport/-löschung, Rohdatenaufbewahrung und geprüfte Releaseentwürfe mit Prüfsummen.

## Schnellstart

Node.js 24 LTS: `npm ci`. Optionale lokale Datenbank: `docker compose up -d --wait`. Konfiguration gemäß [.env.example](.env.example). Vollständige Installation einschließlich sicherem Admin-Setup: [Betriebshandbuch](docs/OPERATIONS.md).

## Technische Grundlage

TypeScript, Node.js, Fastify und MySQL in einem modularen Monolithen. Keine Microservice-, Redis- oder Docker-Abhängigkeit im Produktionsbetrieb. Das erste Infrastrukturziel ist netcup Webhosting 8000; der konkrete Account muss noch verifiziert werden. [Architektur](docs/ARCHITECTURE.md), [Hostingnachweise](docs/HOSTING.md), [Abnahmestand](docs/ACCEPTANCE.md).

## Für wen ist die Plattform?

Für Gemeinschaften, die ihre digitale Plattform Schritt für Schritt durch Umfragen, Ideen und Priorisierungsentscheidungen entwickeln möchten. Die Plattform ist allgemein einsetzbar und legt weder Marke noch Thema der Community fest. Technische Diskussionen und Quellcode bleiben auf GitHub; öffentliche Communitymodule brauchen eine vorherige Entscheidung.

## Häufige Fragen

**Gibt es mehrere gleichzeitige Hauptumfragen?** Nein. Veröffentlichung wird zentral serialisiert und überschneidende Zeitfenster werden abgelehnt.

**Sind anonyme Stimmen manipulationssicher?** Nein. Der MVP verhindert Mehrfachstimmen derselben Browseridentität; neue Geräte oder gelöschte Cookies bleiben eine Grenze. E-Mail-Verifizierung je Umfrage und verifizierte Konten sind implementiert; mehrere Mailkonten bleiben eine Grenze.

**Ist die Plattform Open Source?** Ja. Der Product Owner hat Apache-2.0 für den Quellcode freigegeben. Communitybeiträge und Betreiber-Rechtstexte werden gesondert behandelt.

**Wer genehmigt Veröffentlichungen?** Der Product Owner. Ein geschlossenes GitHub Issue löst keine Produktionsfreigabe aus.

## Mitwirken

[CONTRIBUTING.md](CONTRIBUTING.md) · [Sicherheitsmeldungen](SECURITY.md) · [Datenschutz und Lizenzentscheidung](docs/PRIVACY-AND-LICENSE.md)

Beschreibung und strukturierte Fragen erläutern die allgemeine Plattform für Suchmaschinen und KI-Antwortsysteme ohne unbelegte Leistungs-, Rechts- oder Hostingversprechen. Name, Logo und größere Designentscheidungen bleiben der Community vorbehalten.
