# Technische Mitarbeit

Issues, Architekturgespräche und Code Reviews finden auf GitHub statt. Beschreibe das Problem und warte auf Product-Owner-Freigabe vor größeren Implementierungen. Neue öffentliche Funktionen benötigen zusätzlich eine dokumentierte Communityentscheidung.

Installiere Node.js 24 LTS, führe `npm ci`, `npm run check`, `npm test` und `npm run build` aus. Integrationstests benötigen eine eigene MySQL-Testdatenbank; siehe docs/OPERATIONS.md. Keine produktiven Daten in Tests. Niemals Geheimnisse oder personenbezogene Daten in Issues, Logs oder Commits veröffentlichen.

Pull Requests benötigen erfolgreiche CI und Product-Owner-Review. Kein direkter Push auf main durch Mitwirkende. Der Product Owner genehmigt Releases. Lizenzentscheidung steht noch aus: Bis dahin ist keine Open-Source-Nutzungslizenz erteilt; Beiträge nur nach individueller Abstimmung.
