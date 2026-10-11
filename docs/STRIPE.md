# Stripe: eingebettete Projektunterstützung

Der Herzknopf öffnet einen Bereich auf der bestehenden Seite. Nach Betragswahl lädt die Anwendung Stripe und erstellt auf dem Server eine Checkout-Sitzung. Beträge: 1 bis 1.000 Euro, einmalig, Karte. Der vorhandene Payment Link wird nicht in einen iframe eingebaut und aktiviert diesen Ablauf nicht.

## Lokale Einrichtung

1. Falls noch keine `.env` existiert, `.env.example` nach `.env` kopieren. Eine bestehende `.env` nicht überschreiben: dort nur die Stripe-Zeilen ergänzen.
2. Im [Stripe-Dashboard](https://dashboard.stripe.com/apikeys) das richtige Konto und eine Sandbox auswählen. Die beiden Schlüssel desselben Testkontos in `.env` eintragen:

   ```dotenv
   STRIPE_PUBLISHABLE_KEY=pk_test_DEIN_WERT
   STRIPE_SECRET_KEY=sk_test_DEIN_WERT
   ```

   Diese Platzhalter sind keine gültigen Schlüssel. Die Datei `.env` wird durch Git ignoriert. Den geheimen Schlüssel ausschließlich auf dem Server beziehungsweise lokal hinterlegen; weder in Chatnachrichten noch im Quellcode oder Browser verwenden. Die Integration erwartet derzeit einen Standard-Schlüssel `sk_`, keinen eingeschränkten Schlüssel `rk_`.
3. Die übrige Konfiguration einschließlich Datenbank und `SESSION_SECRET` entsprechend dem Betriebshandbuch einrichten. Danach `npm run build` und `npm start` ausführen. Nach Schlüsseländerungen den laufenden Server neu starten.
4. Seite neu laden, Herz öffnen, Betrag wählen und „Zahlung mit Stripe öffnen“ drücken. Ohne gültiges Schlüsselpaar erscheint weiterhin der Einrichtungshinweis.

## Test im Stripe-Testkonto

Nur Testschlüssel verwenden. [Stripe-Testkarten](https://docs.stripe.com/testing#cards) ermöglichen erfolgreiche, abgelehnte und authentifizierungspflichtige Zahlungen ohne Geldbewegung. Beispielsweise die Erfolgskarte `4242 4242 4242 4242` mit künftigem Ablaufdatum und beliebiger gültiger Prüfziffer verwenden.

- Erfolg prüfen: Die Bestätigung erscheint erst, wenn der Server die Sitzung bei Stripe als abgeschlossen und bezahlt abruft. Betrag und Empfänger anschließend im Stripe-Testdashboard vergleichen.
- Ablehnung und Bankauthentifizierung prüfen; nach Abbruch darf keine Erfolgsbestätigung erscheinen.
- Bereich schließen und erneut öffnen: Formular bleibt erhalten, die Umfrage wird nicht verlassen. Schließen storniert eine bereits gestartete Zahlung nicht.
- Netzwerkfehler und fehlende Schlüssel prüfen. Keine Zahlung darf allein durch Öffnen des Herzbereichs entstehen.
- Mobile Darstellung, Tastaturbedienung und Datenschutzlink auch mit dem echten Stripe-Formular prüfen.

Automatisierte API- und Browsertests simulieren Stripe. Ein echter Stripe-Testlauf wurde ohne Kontoschlüssel noch nicht durchgeführt.

## Livebetrieb

Nach erfolgreichem Test und Product-Owner-Freigabe das richtige aktivierte Stripe-Konto mit korrektem Empfänger verwenden. Beide Schlüssel auf `pk_live_` und `sk_live_` umstellen. Die Anwendung akzeptiert Live-Schlüssel nur mit `NODE_ENV=production`, einer HTTPS-`SITE_URL` und `LEGAL_REVIEWED=true`. Letzteres erst nach Prüfung der vollständigen Betreiber- und Datenschutzinformationen setzen; es ersetzt keine inhaltliche Prüfung. Produktionsstart prüft zusätzlich die Pflichtkonfiguration.

Stripe verarbeitet Zahlungsdaten auch ohne Plattformkonto; Zahlungen sind nicht anonym. Betreiberinformationen und Datenschutz müssen diesen Zahlungsweg abdecken. Schlüssel außerhalb des Webroots speichern beziehungsweise über die Hosting-Umgebungsvariablen setzen. Bei Schlüsselwechsel Server neu starten und Zahlungsbereich prüfen.

Kein Webhook ist für die derzeitige Bestätigung innerhalb einer geöffneten Sitzung nötig. Die Plattform führt kein Zahlungsregister, stellt keine Spendenbescheinigungen aus und schaltet keine Funktionen durch Zahlungen frei. Buchhaltung, Rückerstattungen und Zahlungsprüfung erfolgen im Stripe-Dashboard. Eine möglicherweise erforderliche Bankauthentifizierung wird von Stripe gesteuert.

## Fehlerdiagnose

- **Einrichtungshinweis:** fehlende Schlüssel, gemischter Test-/Livemodus oder nicht erfüllte Live-Voraussetzungen.
- **Zahlungsformular nicht erreichbar:** Konto, Schlüsselberechtigung und API-Anfrage im Stripe-Dashboard prüfen; keine Schlüssel in Fehlerberichte kopieren.
- **Status nicht bestätigt:** Stripe-Dashboard prüfen, bevor erneut bezahlt wird. Eine unterbrochene Browserbestätigung beweist keinen Zahlungsfehlschlag.

Technische Details und Grenzen: [Verifizierung und Datenschutz](VERIFICATION-AND-PRIVACY.md). Quellen: [Stripe-Schlüssel](https://docs.stripe.com/keys), [Checkout-Sitzungen](https://docs.stripe.com/api/checkout/sessions/create).
