# Rechtstexte für den Start

Stand: 11.10.2026. Vom Product Owner beauftragte, an die implementierte Plattform angepasste Entwürfe. Noch nicht für den Livegang freigegeben. Es werden weder eine Rechtsform noch Unternehmensdaten, abgeschlossene Verträge oder erfolgte Prüfungen behauptet.

Die UTF-8-Dateien `impressum.txt`, `datenschutz.txt` und `beitraege.txt` sind direkt in der Anwendung verwendbar. Sie enthalten vollständige Arbeitsfassungen und konkrete Ergänzungsstellen. `{{OPERATOR_NAME}}`, `{{OPERATOR_ADDRESS}}` und `{{OPERATOR_EMAIL}}` werden aus der Serverkonfiguration ersetzt. Der Name muss den tatsächlichen rechtlichen Diensteanbieter bezeichnen; die Projektbezeichnung allein genügt hierfür nicht verlässlich.

## Einbindung

Für die lokale Vorschau die drei `LEGAL_*_FILE`-Werte aus `.env.example` verwenden und `LEGAL_REVIEWED=false` lassen. Bei Bedarf eigene Dateien außerhalb des Webroots verwenden, Pfade relativ zum App-Root oder absolut. Je Dokument entweder einen Dateipfad oder den bisherigen Inline-Text konfigurieren; gleichzeitige Angaben werden abgewiesen. Dokumente werden beim Start einmal eingelesen. Nach Änderungen die Anwendung neu starten. API, Dialoge und direkt erreichbare Informationsseiten verwenden dieselbe Fassung. Inhalte werden als Text ausgegeben; HTML in Betreiberdateien wird nicht ausgeführt.

Vor Veröffentlichung eigene endgültige Fassungen erstellen: tatsächlichen Betreiber mit Anschrift und Kontakt ergänzen, bedingte Impressumsangaben klären, Hosting/SMTP/Stripe samt Verarbeitungsorten und Vertragslage bestätigen, Datenfristen und Wartungsauftrag prüfen. Alle `[ERGÄNZEN: ...]`-Stellen bearbeiten, Entwurfshinweise entfernen und die Fassungen als Product Owner prüfen und freigeben. Bei unverändertem Softwarestand dürfen Texte auch direkt per `LEGAL_*_TEXT` beziehungsweise `LEGAL_CONTRIBUTION_TERMS` hinterlegt werden. Betreiberdateien sind kein Ort für Geheimnisse.

Der Produktionsstart verlangt gültige Betreiberkonfiguration, ausgefüllte Rechtstexte und `LEGAL_REVIEWED=true` und weist erkennbare Entwurfsmarker ab. Diese technische Sperre bestätigt keine juristische Richtigkeit. Aufbewahrungsfristen im Text müssen zur tatsächlichen Anwendung, Mail-, Log-, Backup- und Buchhaltungskonfiguration passen. Die Software kann aktuell nicht jede dieser externen Fristen selbst steuern; hierfür gelten die dokumentierten Betriebsverfahren. Aufbewahrung ohne Freigabe ist kein stillschweigend gewählter Standard.

Der Entwurf ordnet die Verarbeitungen möglichen Rechtsgrundlagen zu. Der Betreiber muss diese anhand seiner tatsächlichen Nutzung bestätigen. Die Beitragsbedingungen enthalten die vom Projekt verlangte dauerhafte, nicht ausschließliche Nutzungserlaubnis und benötigen eine getrennte Prüfung. Zustimmung zu Beitragsbedingungen ist nicht automatisch eine Datenschutz-Einwilligung. Gemeinnützigkeit und steuerliche Abzugsfähigkeit der Unterstützung werden nicht zugesichert.

## Verwendete Primärquellen

Abgerufen am 11.10.2026; eigene Texte, keine Übernahme fremder Muster:

- [§ 5 DDG – Anbieterinformationen](https://www.gesetze-im-internet.de/ddg/__5.html).
- [DSGVO – unter anderem Art. 6, 12–22 und 28](https://eur-lex.europa.eu/eli/reg/2016/679/oj/deu).
- [§ 25 TDDDG – Zugriff auf Endgeräte](https://www.gesetze-im-internet.de/ttdsg/__25.html).
- [netcup – Auftragsverarbeitung](https://www.netcup.com/de/helpcenter/dokumentation/general/avv). Ein bestehender Vertrag wurde nicht nachgewiesen.
- [Stripe – Datenschutzrichtlinie](https://stripe.com/de/privacy). Vertragspartner und Transfermechanismen des konkreten Kontos sind zu bestätigen.
- [GitHub – Datenschutz](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

Technische Grundlage: `apps/server/src/participation.ts`, `app.ts`, `support.ts`, `mail.ts`, `scripts/maintenance.ts`, `retention.ts` und die Betriebshandbücher dieses Repositories. Nicht eingerichtete Verfahren werden in den Entwürfen ausdrücklich als offene Angaben behandelt.
