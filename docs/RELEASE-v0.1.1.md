# Release v0.1.1

Der Product Owner hat am 11. Oktober 2026 die vier externen Abnahmebereiche aus dem aktuellen Abschlussumfang genommen: tatsächlicher netcup-/Stagingbetrieb, endgültige Betreiber- und Rechtstextfreigabe, reale Mail-/GitHub-/Stripe-Anbieterprüfungen und tatsächlicher Livegang. Für den verbleibenden technischen Masterprompt-Umfang sind **28 von 28 Anforderungsblöcken erfüllt (100 %)**. Der vollständige ursprüngliche Produktionsabnahmeumfang ist dadurch nicht nachgewiesen; die Einschränkung ist in docs/PROGRESS.md dokumentiert.

## Änderungen

- Freitextstimmen speichern exakt die angezeigte Fassung der Beitragsbedingungen, einschließlich Dateikonfiguration und eingesetzter Betreiberangaben.
- Der Produktionsstart erzwingt die obligatorische Konfigurationsprüfung; unvollständige Rechtstexte, Beispielzugänge, ungeeignete Origin, Demomodus und fehlende Rohdatenfrist werden abgewiesen.
- CI und Release prüfen den kompilierten Server zusätzlich im Produktionsmodus: sichere Cookies, geschützte Administration und Origin-Prüfung.
- Automatisierte Backup-/Restoreprüfung mit Datenvergleich und identischer vollständiger Auditkette.
- Wiederverwendbare Auditprüfung mit Tests gegen Manipulation, ausgelassene Ereignisse und geänderte Reihenfolge.
- Nachvollziehbare Fortschritts- und Abnahmedokumentation.

## Validierung und Installation

37 automatisierte Unit-/MySQL-/API-/Browser-/Accessibilitytests, TypeScript-Prüfung, Abhängigkeitsaudit, separate Installation ohne Entwicklungsabhängigkeiten und zwei bytegleiche Paketierungen. Der Releaseworkflow wiederholt die Prüfungen auf dem getaggten Commit.

Die Releaseassets enthalten community-platform.tar.gz, SHA256SUMS und RELEASE.json. Prüfsumme kontrollieren, außerhalb des Webroots entpacken und npm ci --omit=dev ausführen. Konfiguration, Migrationen und Admin-Setup nach docs/OPERATIONS.md und docs/LAUNCH.md durchführen. Produktionszugänge sind nicht enthalten.

Dieses Release veröffentlicht Quellcode und ein Installationspaket. Es führt kein Hostingdeployment aus. Sicherheitssperren für die tatsächliche Produktionskonfiguration bleiben aktiv. Nicht beschlossene Communitymodule bleiben außerhalb des Startumfangs.
