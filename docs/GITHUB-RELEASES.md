# Produktivpakete und Releases über GitHub

Die Pipelines erstellen ein kompiliertes Installationspaket für Node.js und MySQL. Produktionszugänge und Betreiberkonfiguration gehören nicht in GitHub-Artefakte. Ein Paket ersetzt keine Abnahme des konkreten Hostings oder der Rechtstexte.

## 1. Bei jedem Pull Request und nach Änderungen an main

**Quality and security** prüft TypeScript, Server-/MySQL-Tests, Browser und Barrierefreiheit, Abhängigkeiten sowie den Build. Das heruntergeladene Anwendungsartefakt wird separat mit `npm ci --omit=dev` installiert und gestartet. Anschließend entsteht das Artefakt **production-package** mit:

- `community-platform.tar.gz`: kompilierter Server, öffentliche und administrative Oberfläche, Migrationen, lokale Animationen, Dokumentation, Lizenz und `.env.example`.
- `SHA256SUMS`: SHA-256-Prüfsumme des Archivs.
- `RELEASE.json`: Version, vollständiger Quellcommit, Quellzeitpunkt und Node-Anforderung; zusätzlich im Archiv enthalten.

Zwei Paketläufe müssen bytegleiche Archive erzeugen. Pakete aus Pull Requests dienen zur Prüfung, nicht als freigegebenes Release. Artefakte sind 30 Tage verfügbar. Der Workflow lässt sich nach Aufnahme in main zusätzlich manuell starten.

## 2. Eine offizielle Produktivversion erstellen

1. Änderungen per geprüftem Pull Request in main aufnehmen.
2. Die gewünschte stabile Version in `package.json` und `package-lock.json` aktualisieren und prüfen lassen. Beispielsweise `0.1.0`.
3. Als Product Owner den entsprechenden Tag auf den freigegebenen Commit setzen: `v0.1.0`. Der Push startet **Production release**. Alternativ unter Actions den Workflow mit einem bereits vorhandenen Tag manuell starten.
4. Der Workflow akzeptiert ausschließlich stabile Tags `vMAJOR.MINOR.PATCH`, eine übereinstimmende Paketversion und Commits in der main-Historie. Er führt die vollständigen Prüfungen erneut aus, erstellt zwei identische Archive und installiert/testet den tatsächlichen Archivinhalt ausschließlich mit Betriebsabhängigkeiten.
5. Im Lauf die geschützte Umgebung **release-approval** als Product Owner freigeben. Danach entsteht ein GitHub-Releaseentwurf mit Paket, Prüfsumme und Versionsnachweis. Bestehende Releases werden nicht überschrieben.

## 3. Die geprüfte Version veröffentlichen

Nach Product-Owner-Freigabe des jeweiligen Software-Abnahmeumfangs unter Actions **Publish approved production release** auswählen, den Tag angeben und den Lauf starten. Die geschützte Umgebung erfordert erneut die Product-Owner-Freigabe. Der Workflow prüft den vorhandenen Entwurf, Tag/Version/main-Historie, Quellcommit, Archivprüfsumme sowie identische Versionsnachweise im Archiv und als Releaseasset. Erst anschließend wird der Entwurf öffentlich als neueste Version veröffentlicht. Für v0.1.1 hat der Product Owner die vier externen Nachweisblöcke ausdrücklich von der Softwareabnahme ausgenommen; tatsächlicher Livebetrieb benötigt weiterhin die gültige Betreiber- und Produktionskonfiguration.

Die manuell startbaren Workflows erscheinen erst nach Aufnahme ihrer Dateien in den Standardbranch. Sie veröffentlichen Releases; das Hochladen auf netcup und der Neustart der Anwendung folgen dem [Betriebshandbuch](OPERATIONS.md), bis Hostingpfade und Neustartverfahren konkret nachgewiesen sind. Es werden keine Produktionsdatenbankmigrationen automatisch ausgeführt.

## Installation

Releaseassets herunterladen, Prüfsumme prüfen, Archiv außerhalb des Webroots entpacken, `npm ci --omit=dev` ausführen und `.env` manuell konfigurieren. Migration, Admin-Setup und Vorabprüfung laufen über die enthaltenen kompilierten Skripte. Details: [LAUNCH.md](LAUNCH.md).

Die Paketierung verwendet Linux und GNU tar (`bash scripts/package-release.sh APP_ROOT OUTPUT_DIR` mit `RELEASE_COMMIT` und `SOURCE_DATE_EPOCH`). Das fertige Paket benötigt weder Docker noch Entwicklungsabhängigkeiten. Symlinks und typische private Schlüssel-/Umgebungsdateien im Paketinhalt führen zum Abbruch.

Grundlagen: [manuelle Workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [geschützte Umgebungen](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
