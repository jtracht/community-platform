# Verifizierung, Wartung und Datenschutzbetrieb

Ergänzung zu OPERATIONS.md; ausschließlich technische Verfahren, keine juristische Freigabe.

## Mail und verifiziertes Konto

SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD und SMTP_FROM serverseitig konfigurieren. Port 465 verwendet implizites TLS; andere Ports benötigen STARTTLS. MAIL_DAILY_LIMIT begrenzt den gesamten Versand. Eine E-Mail-Verifizierung gilt je Umfrage, ein verifiziertes Konto ist eine persistente E-Mail-Identität ohne öffentliches Profil. Mehrere Mailkonten bleiben eine Grenze der Manipulationsprävention.

Cron ruft einmal pro Minute `node --env-file=.env dist/scripts/maintenance.js` auf. Er verarbeitet Phasen, höchstens zehn Mailjobs, aktivierte GitHub-GET-Synchronisation und Aufbewahrung. Cron im Hosting tatsächlich prüfen. Verifizierungslinks laufen nach 15 Minuten ab, sind einmalig und transportieren das Token im URL-Fragment. Mailadressen und wartende Mailinhalte werden verschlüsselt gespeichert. Verifikationstoken sind gehasht. Unklare Versandresultate werden als unsicher markiert; keine unbegrenzten Wiederholungen. Im Adminpanel Fehler prüfen; Betroffene können einen neuen Link anfordern. Tests prüfen den verschlüsselten Auftrag und den Verifizierungspfad, noch keine externe SMTP-Zustellung.

## Admins, Berechtigungen und Recovery

Ersten Owner mit setup-admin anlegen. Weitere Konten offline mit ADMIN_ROLE=moderator oder viewer und demselben interaktiven Setup erstellen. Passwort mindestens 16 Zeichen; TOTP mit getrennt gesicherter Authenticator-App. Kontorecovery mit ADMIN_RECOVER=true und ausdrücklicher interaktiver Eingabe WIEDERHERSTELLEN: Passwort und TOTP neu setzen, Sitzungen widerrufen, Vorgang auditieren. Hostingzugriff hierfür strikt begrenzen. Owner-Rechte lassen sich im Web nicht übertragen oder entziehen. Zusätzliche Berechtigungen ändern keine geschützten Owner-Operationen.

## GitHub

Repositorygebundenen Token mit minimalen Issue-/PR-Berechtigungen verwenden, serverseitig hinterlegen. Signierten Webhook auf `/api/github/webhook` für Issues/PRs mit GITHUB_WEBHOOK_SECRET konfigurieren. Empfang prüft Signatur, Repository und Zustellungs-ID. Admins können die regelmäßige GET-Synchronisation ausdrücklich aktivieren. Lesefehler werden mit Backoff und höchstens fünf Versuchen gespeichert. Keine automatische Wiederholung unklarer Issue-Erstellungen: anhand `community-decision:` beziehungsweise `community-evaluation:` im Issue-Text prüfen und vorhandene Issues manuell zuordnen. Kritische ausgehende Aktualisierungen brauchen Bestätigung und prüfen den letzten Remote-Zeitpunkt; GitHub bietet hier keine atomare Compare-and-Swap-Garantie. Remote-Statusänderungen verändern keine Communityentscheidung und genehmigen kein Release.

## Aufbewahrung und Betroffenenanfragen

RAW_VOTE_RETENTION_DAYS nach Betreiberfreigabe zwischen 7 und 3650 setzen. Maintenance entfernt alte Rohstimmen und verbundene Ideen/Historien/Einsprüche erst nach Ergebnisfreigabe. Die eingefrorene aggregierte Entscheidung bleibt erhalten. Temporäre Verifizierung/Sitzungen laufen automatisch ab; Mailjobs nach Ablauf plus sieben Tagen, Sicherheitsereignisse nach 14 Tagen, Webhook-Zustellungsreferenzen nach 30 Tagen. Persistente Konten benötigen zusätzlich eine vom Betreiber definierte Inaktivitäts-/Löschregel; derzeit keine automatische Kontolöschung.

Export liefert zuordenbare Stimmen, Ideen, Bearbeitungshistorie, Einsprüche und gespeicherte Kontoadresse. Löschung entfernt Rohdaten und das verifizierte Konto; anonyme Identitäten anderer Browser sind ohne Zugriffsnachweis nicht zuordenbar. Bei manuellen Auskunfts-/Berichtigungsanfragen Identität datensparsam prüfen, Umfang und Ausführung dokumentieren. Originale von moderierten Beiträgen bleiben bis zur Löschfrist nachvollziehbar; Änderungen mit begründeter Historie durchführen. Bei Backup-Restore zuvor erledigte Löschanfragen erneut anwenden, bevor der wiederhergestellte Dienst öffentlich erreichbar wird. Backupfristen und rechtliche Ausnahmen müssen vom Betreiber freigegeben werden.

## Betrieb und Module

Sicherheitsereignisse verwenden täglich wechselnde HMAC-Quellen statt Klartext-IP. Kritische Endpunkte besitzen zusätzlich gemeinsame DB-Ratenlimits; der allgemeine Limiter gilt je Prozess. Webserver-/Hostinglogs gesondert datensparsam konfigurieren. Alle registrierten Module sind geprüfter Anwendungscode. Aktivierungsrollback betrifft Konfiguration und freigegebene vorhandene Versionen; Code-Rollback folgt dem Releaseverfahren einschließlich Datenbankkompatibilität. Kein fremder Code wird nachgeladen. Auditkette regelmäßig prüfen und Endhash extern unveränderlich sichern.

Lokaler Restoretest: TEST_MYSQL=true und `node scripts/verify-local-restore.mjs`; nur isolierte Docker-Testdatenbank community_test. Er erstellt ein getrenntes Restoreziel und prüft Datenzahlen und Fremdschlüssel. Dieser Test ist kein Hostingnachweis.

## Freiwillige Unterstützung über Stripe

Der Product Owner hat eine ausklappbare Zahlung innerhalb der Seite freigegeben. Ein Payment Link lässt sich nicht als eingebettetes Checkoutformular verwenden. STRIPE_PUBLISHABLE_KEY und STRIPE_SECRET_KEY müssen zum selben Test-/Livemodus gehören. Der geheime Schlüssel bleibt auf dem Server; Stripe.js wird erst beim Anfordern des Zahlungsformulars geladen. Live-Schlüssel werden nur mit NODE_ENV=production, HTTPS und LEGAL_REVIEWED=true verwendet. Ohne gültige Konfiguration zeigt der Bereich einen Einrichtungshinweis und startet keine Zahlung.

Stripe SDK 23 mit API-Version 2026-09-30.endive erstellt serverseitig embedded_page-Sitzungen für Karten, EUR und frei gewählte Beträge von 1 bis 1.000 Euro. redirect_on_completion=never vermeidet eine Weiterleitung nach Abschluss; eine erforderliche Bankauthentifizierung bleibt durch Stripe bestimmt. Wiederholte identische API-Anfragen desselben Browsers verwenden denselben Idempotenzschlüssel. Ein HttpOnly-Cookie und ein signierter Sitzungshinweis binden den Statusabruf an den erstellenden Browser. Eine Bestätigung erscheint erst nach serverseitiger Prüfung auf complete und paid. Keine Zahlungsdaten werden in der Plattform gespeichert; Stripe bleibt Quelle der Zahlungsbuchhaltung. Es gibt keine Zahlungsrechte, automatischen Freischaltungen oder Webhook-Buchhaltung.

STRIPE_PAYMENT_LINK kann als bestehende Betreiberreferenz hinterlegt bleiben, wird aber nicht automatisch als eingebettetes Formular oder als Weiterleitungsersatz verwendet. Vor Livebetrieb Empfänger, Beträge, Zahlungsbestätigung und Fehlerfälle im echten Stripe-Testkonto prüfen und die Datenschutzinformationen einschließlich Stripe freigeben. Zahlungen sind auch ohne Plattformkonto nicht anonym. API- und Oberflächentests mit simulierten Stripe-Antworten ersetzen diesen externen Nachweis nicht.
