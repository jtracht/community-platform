# Community Platform

Eine modulare Webplattform für Community-Umfragen und nachvollziehbare Entscheidungen. Die Community bestimmt die nächsten Funktionen; der Product Owner verantwortet Sicherheit, Umsetzung und Releases.

**Stand: ausführbares Startsystem, noch keine Produktionsfreigabe.** Die Startseite zeigt genau eine Hauptumfrage oder einen Ergebnis-/Wartezustand. Der Product Owner hat zusätzlich Projektinformationen und freiwillige Stripe-Unterstützung freigegeben. Weitere öffentliche Communitymodule benötigen eine entsprechende Entscheidung.

## Was funktioniert?

- Freitext-Ideensammlung, Single-Choice, Multiple-Choice und Prioritäten-Rankings.
- Transaktionale Stimmen, Umfragezeitplanung, feste Regeln, Quoren und konfigurierbare Ergebnisanzeige.
- Geschütztes Admin-Panel mit Passwort/TOTP, granularen Rechten, Ideenmoderation, Einsprüchen, Entscheidungen, Bewertungen und Entwicklungsfreigaben.
- Manuell genehmigte GitHub-Issues, PR-Verknüpfung, signierte Webhooks, Konfliktprüfung und Auditprotokolle.
- MySQL-Migrationen, Modulverwaltung, Datenschutzexport/-löschung, Rohdatenaufbewahrung und geprüfte Releaseentwürfe mit Prüfsummen.

GitHub erstellt nach erfolgreichen Prüfungen das Artefakt `production-package`. Versionierte Releaseentwürfe und deren Veröffentlichung laufen über getrennte, durch den Product Owner freizugebende Workflows. Anleitung: [GitHub-Produktivpakete und Releases](docs/GITHUB-RELEASES.md).
- Responsive Oberfläche in Schwarz und Anthrazit mit transparenten Karten, lokal bereitgestellten Motion-Animationen und Ergebnisbalken in den Auswahlfeldern. Der Countdown erscheint nach der eigenen Abstimmung; Ergebnisregeln bleiben wirksam.

## Schnellstart

Node.js 24 LTS: `npm ci`. Optionale lokale Datenbank: `docker compose up -d --wait`. Konfiguration gemäß [.env.example](.env.example). Vollständige Installation einschließlich sicherem Admin-Setup: [Betriebshandbuch](docs/OPERATIONS.md).

Der freigegebene ausklappbare Unterstützungsbereich verwendet Stripe Embedded Checkout. Einrichtung, Testzahlung und Live-Check: [Stripe-Anleitung](docs/STRIPE.md).

Bearbeitbare Entwürfe für Impressum, Datenschutz und Beitragsbedingungen: [Rechtstexte und Einbindung](docs/legal/README.md). Betreiberangaben, Dienstleister und Fristen sind vor Veröffentlichung zu ergänzen und freizugeben; die Vorschau kennzeichnet die Fassungen als Entwurf.

Die noch offenen Angaben können später manuell eingetragen werden. Die [Livegang-Anleitung](docs/LAUNCH.md) und `npm run preflight -- --database` helfen, Konfiguration, Migrationsstand und Admin-Einrichtung vor dem Start zu prüfen.

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
