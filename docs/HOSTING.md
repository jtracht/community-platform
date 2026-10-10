# netcup-Prüfung

Öffentlich belegt, abgerufen 10.10.2026:

- [Hostingübersicht](https://www.netcup.com/de/hosting): Node.js ab Webhosting 4000, SSH, SSL.
- [Tarifbeispiel Webhosting 8000 VIE iv](https://www.netcup.com/en/hosting/web-hosting/webhosting-8000-vie-iv): Node.js, Cronjobs, Datenbanken und Subdomains. Angaben gelten nicht automatisch für einen älteren Vertrag. Der dort genannte Memory-Limit-Wert ist kein Nachweis eines Node.js-Prozesslimits.
- [Webhosting-Oberfläche](https://www.netcup.com/de/helpcenter/dokumentation/webhosting/interface): SSH-Zugang, geplante Befehle/URL-Aufrufe, HTTPS-Einstellungen.
- [Fastify v5](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/): benötigt Node.js >=20. Projekt verlangt unterstütztes Node.js 22/24 LTS, bevorzugt 24.

Vor Architekturabnahme auf dem konkreten Account protokollieren:

1. Tarifgeneration, Rechenzentrum, WCP Node-Version und Patchstand.
2. Node-App-Root, Document-Root, Startdatei, PORT-Zuweisung, Neustartverfahren und Umgebungsvariablen.
3. `node --version`, DB `SELECT VERSION()`, InnoDB, TLS zum DB-Host; Migrations- und Sperrentests.
4. Dateisystemrechte, freie Kapazität, Upload- und Prozesslimits, Idle-Sleep, maximaler RSS. Kein PM2 oder zusätzlicher Dauerprozess erforderlich.
5. Cron-Aufruf, Laufzeitlimit, Pfad zu Node, parallele Aufrufe. Phasenwechsel werden im MVP außerdem bei öffentlichem Abruf ausgeführt.
6. HTTPS-Zertifikat, Weiterleitung, Domain/Subdomains und Proxy-IP-Konfiguration. Keine beliebigen Forwarded-Header vertrauen; MVP vertraut keinen Proxies.
7. SSH/SFTP-Key, host-key pinning, Backups außerhalb Webroot, Restore und Neustart einer vorherigen Version.

Ohne diese Nachweise besteht keine behauptete Produktionskompatibilität. Wenn Node 22/24 fehlt, zunächst Upgrade beim Anbieter prüfen. Ein PHP-Rewrite wäre keine stillschweigende Alternative zum beschlossenen TypeScript-/Node-Stack. VPS-Wechsel ist technisch möglich, aber bedarf einer Infrastrukturentscheidung.
