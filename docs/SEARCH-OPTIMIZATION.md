# Technisches SEO, GEO und AEO

Vorbereitet ab v0.1.5, ohne Änderung sichtbarer Texte, Seitentitel, Gestaltung, Abstimmungsverfahren oder Navigation. Die Optimierung ergänzt ausschließlich HTTP-/Head-Metadaten und technische Crawl-Endpunkte. Tests vergleichen die kompletten Body-Bytes der Start- und Projektseite mit den unveränderten Quelldokumenten.

## Umsetzung

- Serverseitige Canonicals im HTML und HTTP-Linkheader, abgeleitet ausschließlich aus SITE_URL. Queryparameter erzeugen keinen weiteren Canonical; eingehende Hostheader werden nicht dafür verwendet.
- Open-Graph-/Twitter-Metadaten übernehmen die vorhandenen Seitentitel und Beschreibungen. Ohne freigegebene Domain werden keine erfundenen absoluten URLs erzeugt. Ein Vorschauimage wird nicht erfunden.
- JSON-LD beschreibt WebSite und WebPage beziehungsweise AboutPage. Sprache und stabile IDs verbinden die öffentlichen Seiten. Es enthält keine Privatdaten, Umfrageantworten, ungeprüften Betreiberbehauptungen, Bewertungen oder unsichtbaren FAQs. Die CSP wird nicht gelockert.
- Sitemap mit den fünf vorhandenen öffentlichen HTML-Seiten: Start, Projektinfo, Impressum, Datenschutz und Beitragsbedingungen. Keine privaten APIs, Adminseiten oder erfundenen Aktualisierungsdaten.
- robots.txt erlaubt bei freigegebener Indexierung öffentliches Rendering einschließlich der drei lesenden APIs /api/poll, /api/project und /api/legal. Die JSON-Endpunkte bleiben selbst noindex; private APIs bleiben im Crawl ausgeschlossen und weiterhin unabhängig davon authentifiziert.
- /admin, APIs, Health und Fehlerantworten erhalten keine Suchindexfreigabe. Entwicklungs-/Stagingbetrieb, fehlende Freigabe oder ungültige Domain erzeugen noindex und eine leere Sitemap.
- Suchcrawler wie OAI-SearchBot verwenden die allgemeinen Regeln. Trainingcrawler GPTBot, CCBot und ClaudeBot werden getrennt ausgeschlossen. robots.txt ist eine freiwillige Crawlerregel und kein technischer Zugriffsschutz.

Die Hauptumfrage wird weiterhin durch die vorhandene Anwendung gerendert. Google kann JavaScript rendern, benötigt dafür erreichbare Ressourcen. Die Projektseite enthält ihre allgemeinen Informationen bereits im gelieferten HTML und ist auch für Systeme ohne JavaScript lesbar. Ein vollständiges serverseitiges Rendern des Umfrageformulars würde die bestehende Darstellung/Initialisierung verändern und ist nicht Teil dieses Auftrags. Es werden keine unsichtbaren Keywords, neuen Inhaltsseiten, Drittanbietertracker oder automatischen externen Einreichungen eingeführt.

## Aktivierung nach Hostingfreigabe

1. Ausschließlich die geprüfte öffentliche Produktionsdomain als HTTPS-Origin in SITE_URL setzen. Auf Vorschau/Staging SEARCH_INDEXING_ENABLED=false belassen, auch bei produktionsähnlicher Konfiguration.
2. Erst nach rechtlicher/technischer Produktionsfreigabe NODE_ENV=production und SEARCH_INDEXING_ENABLED=true setzen. LEGAL_REVIEWED allein genügt nicht: vollständige Texte und Betreiberfakten werden ebenfalls überprüft. Die vorhandenen Startprüfungen bleiben aktiv.
3. Server kontrolliert neu starten. Die tatsächliche Domain muss über HTTPS erreichbar sein; das Werkzeug prüft keine DNS-/Zertifikatsausstellung.
4. Auf der echten Domain robots.txt, sitemap.xml, Canonicals, HTML-Metadaten und Statuscodes prüfen. Sitemap darf keine Staging-/Admin-/API-URLs enthalten. robots.txt/Sitemap werden fünf Minuten öffentlich gecacht; HTML bleibt no-store.
5. Domain selbst in Google Search Console und Bing Webmaster Tools verifizieren. Sitemap einreichen und URL-Prüfung mit gerendertem HTML durchführen; die Formulare müssen weiterhin identisch bedienbar sein. Strukturierte Daten mit Schema Markup Validator und gegebenenfalls Rich Results Test prüfen. WebSite/WebPage allein versprechen keinen besonderen Rich-Result-Typ.
6. Nach Veröffentlichung Indexierungsberichte und relevante Suchanfragen beobachten. Core Web Vitals mit tatsächlichen Felddaten beurteilen, bevor weitere Änderungen geplant werden. Keine Besucheranalyse oder zusätzliche Datensammlung ist für diese Umsetzung eingerichtet.

Indexierung und Zitierungen durch KI-Systeme sind externe Ergebnisse, kein automatisierter Abnahmestatus. Ohne echte Domain und Livebetrieb liegen noch keine Sichtbarkeits-/Rankingnachweise vor. Die bestehende Abnahmemappe bleibt dafür maßgeblich.

## Offizielle Grundlagen, geprüft am 12. Oktober 2026

Google verlangt keine besonderen KI-Dateien oder spezielle KI-Schema-Erweiterungen; bestehende SEO-Grundlagen und Übereinstimmung strukturierter Daten mit sichtbaren Inhalten bleiben relevant. [Google: AI features](https://developers.google.com/search/docs/appearance/ai-features), [Structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

Canonical- und Renderingprüfung folgen den [JavaScript-SEO-Grundlagen](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics). Search- und Trainingzugriff werden getrennt betrachtet, entsprechend der [OpenAI-Crawlerdokumentation](https://developers.openai.com/api/docs/bots). Keine pauschalen Sichtbarkeitssteigerungen aus nicht geprüften Skill-Statistiken werden behauptet.
