# Abnahmestand

Kein produktionsfertiges Release. Ein ausführbarer MVP wurde implementiert; die vollständigen Anforderungen bleiben verbindlich.

| Kriterium | Stand |
|---|---|
| Eine offizielle aktive Hauptumfrage | Transaktionale Umsetzung und lokaler MySQL-Parallelitätstest |
| Vier Fragetypen | Implementiert; Fachtests vorhanden |
| Validierung/Auswertung | Auswahlgrenzen, Borda, Quorum, Gleichstand implementiert |
| Sichtbarkeit/Teilnahme | Vier Sichtbarkeiten; nur anonyme Teilnahme fertig; E-Mail/Konto offen |
| Übergänge | Zeit-/Abrufwechsel, Ergebnis-/Wartezustand implementiert |
| Umfrageverwaltung | Entwurf, Bearbeitung, Zeitplanfreigabe, Ende, Ergebnisfreigabe, Archiv |
| Ideen | Eingang, Spam-/Duplikathinweis, manuelle Prüfung, Bearbeitungshistorie; Merge, Einspruch, Massenbearbeitung offen |
| Entscheidungen/Bewertungen | Unveränderliche Ergebnisaufnahme; Bewertungsworkflow und flexible Prozessschritte offen |
| GitHub | Vorschau, ausdrückliche Issue-Erstellung, Statusabruf, Duplikatsperre; PR-Verknüpfung, Konflikte, Reconciliation und konfigurierbare automatische Synchronisation offen |
| Freigaben | Owner-Schreibrechte, Issuebestätigung, Releaseentwurf; Hostingfreigabe offen |
| Zugänge | scrypt, TOTP, Replay-Schutz, sessions, Origin/CSP/Rate-Limit; Rollenverwaltung/-granularität und Recovery offen |
| Module | Geprüfte Registry, Abhängigkeiten/Freigabetests; voll integrierte Aktivierung, Health/Update/Rollback offen |
| Keine Zusatzbereiche | Öffentliche Oberfläche ausschließlich Umfrage/Übergang/Pflichtlinks |
| Tests/Datenschutz | Unit/MySQL/API; Browser-/Accessibility-/Securityabnahme und Datenschutzverfahren noch ausstehend |
| Hostinginstallation | Anleitung vorhanden; konkreter netcup-Vertrag noch nicht verifiziert |
| Open Source | Richtlinien, Codeowner, CI; Lizenzfreigabe, Branchschutz und öffentlicher Release offen |

## Nächster Meilenstein
Hostingverifikation und rechtliche Betreiberkonfiguration; fehlende MVP-Schutz-/Betriebsnachweise abschließen. Danach optional separater früher MVP-Livegang nur mit ausdrücklich akzeptierter reduzierter Abnahme. Das vollständige erste Release erst nach allen Masterprompt-Kriterien.
