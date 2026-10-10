# Abnahmestand

Stand: 10.10.2026. Ausführbares Startsystem; noch kein produktiv freigegebenes Release. Die Abnahme auf dem konkreten netcup-Vertrag steht aus.

| Kriterium                  | Umsetzung und Nachweis                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eine aktive Hauptumfrage   | Singleton-Transaktion, eindeutiger DB-Schlüssel, Zeitfensterprüfung; Parallelität getestet                                                                                               |
| Vier Fragetypen            | Freitext, Single-/Multiple-Choice, vollständiges Prioritätenranking; Fach- und mobile Browsertests                                                                                       |
| Validierung und Auswertung | Auswahlgrenzen, Borda, Prozentwerte, Quorum, Gleichstände/Stichwahlkennzeichen; nachvollziehbare Regelversion                                                                            |
| Sichtbarkeit und Teilnahme | Vier Ergebnisregeln; anonym, E-Mail je Umfrage und verifiziertes Konto; gleiche verifizierte Identität doppelt abgewiesen                                                                |
| Übergangszustände          | Warte-/Ergebniszustand, Zeitwechsel, Pause und transparent protokollierte Terminänderungen                                                                                               |
| Umfrageverwaltung          | Entwurf, Bearbeitung, Zeitplanfreigabe, Ende, Stimmenprüfung, Ergebnisfreigabe, Archiv                                                                                                   |
| Ideen                      | Eingang, technische Hinweise, Historie, Moderation, Zusammenführung, Massenbearbeitung, Einsprüche und Vorbereitung neuer Umfragen                                                       |
| Entscheidungen/Bewertungen | Eingefrorene Ergebnisaufnahme, flexible Prozessschritte, positive/neutrale/negative Bewertungen, Herkunft und Verknüpfungen                                                              |
| GitHub                     | Manuelle Vorschau/Bestätigung, Issue- und PR-Verknüpfung, GET-Synchronisation, Konflikte, begrenzte Wiederholungen, signierte und deduplizierte Webhooks; externe API in Tests simuliert |
| Kritische Freigaben        | Owner-Rechte und ausdrückliche Bestätigung; Entwicklungsfreigabe setzt Tests und Version voraus; geschlossene Issues geben kein Release frei                                             |
| Konten und Rechte          | Passwort/TOTP, Replay-Schutz, Sitzungen, granularer Zugriff, geschützte Owner-Rolle, Offline-Setup und Recovery                                                                          |
| Module                     | Registrierte geprüfte Module, Manifest/Abhängigkeiten, Aktivierung/Deaktivierung, Health und Konfigurationsrollback; Codeupdates über kontrollierte Releases                             |
| Öffentlicher Umfang        | Ausschließlich Umfrage/Übergang und notwendige Datenschutz-/Rechtsinformationen; keine vorweggenommenen Communitymodule                                                                  |
| Tests/Datenschutz          | 15 Unit-/MySQL-/API-/Lasttests und 8 mobile Browser-/Accessibilitytests; Export/Löschung, Historien, verschlüsselte Verifizierung und konfigurierbare Rohdatenaufbewahrung               |
| Hostinginstallation        | Dokumentiert, konkrete Node-/MySQL-/WCP-/Cron-/SMTP-Konfiguration und Staging-Restore noch nachzuweisen                                                                                  |
| Open Source                | Apache-2.0, Repository, Mitarbeit/Sicherheit, CI, Branch-/Tagregeln und Release-Reviewer vorhanden                                                                                       |

100 parallele unterschiedliche Abstimmungsanfragen sowie zwölf parallele Anfragen derselben Identität wurden auf lokalem MySQL geprüft. Dies belegt keine Leistung auf netcup. Automatisierte Accessibilityprüfungen ersetzen keine vollständige manuelle Prüfung mit Hilfsmitteln. Ein unabhängiger Sicherheitstest steht aus.

## Verbleibende Livegang-Gates

1. Konkreten Hostingvertrag und Domain anhand HOSTING.md prüfen; HTTPS, Proxy, DB-Zugang, SMTP, Cron und Neustart tatsächlich testen.
2. Rechtlichen Betreiber, geprüfte Texte, Beitragsnutzung, Aufbewahrung und administrative Datenschutzverfahren konfigurieren/freigeben.
3. Staging mit dem Produktionsverfahren installieren; Mailzustellung, echte GitHub-Anbindung, Backup/Restore und Rollback prüfen.
4. Product Owner genehmigt Release und Livegang. CI erzeugt geprüfte Releaseentwürfe; aktuell wurde kein Release veröffentlicht.

Lokaler Wiederherstellungsnachweis am 10.10.2026: acht Migrationen, 28 Umfragen, 216 Stimmen, sechs Ideen, sechs Entscheidungen und 177 Auditereignisse in ein getrenntes Ziel restauriert; Zählwerte und Fremdschlüssel geprüft. Auditkette separat gültig. Ausschließlich synthetische Testdaten; Produktiv-RPO/RTO weiter offen.
