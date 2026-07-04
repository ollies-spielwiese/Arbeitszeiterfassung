# Release-Prozess Arbeitszeiterfassung

Dieses Dokument beschreibt den vollständigen Release-Workflow für die PWA. Zielgruppe ist der Maintainer (Oliver). Ablauf ist getestet und funktioniert Ende-zu-Ende.

## Versionierung

- App-Version steht an zwei Stellen und muss synchron bleiben:
  - `app.js` — Konstante `APP_VERSION` (z. B. `'3.3'`)
  - `sw.js` — Konstante `CACHE_NAME` (z. B. `'arbeitszeit-v3-3'`)
- Schema: `MAJOR.MINOR` in `APP_VERSION`, `arbeitszeit-vMAJOR-MINOR` in `CACHE_NAME`.
- Bei jeder Änderung an ausgelieferten Dateien (app.js, index.html, styles.css, sw.js, manifest.json, Icons) muss `CACHE_NAME` erhöht werden, sonst greift der alte Service-Worker-Cache.
- Neuen Changelog-Eintrag im `CHANGELOG`-Array in `app.js` (oben, nach `LAST_SEEN_VERSION_KEY`) ergänzen. Neuester Eintrag steht oben. Nutzer sehen ihn beim ersten Start als „Was ist neu"-Modal.

## Lokaler Test

Server starten:

```bash
cd /home/user/workspace/arbeitszeit
python3 -m http.server 8765
```

Aufrufen im Browser: `http://localhost:8765`

Prüfen:
- Erfassung, Woche, Monat, Übersicht, Einstellungen ohne Fehler in der Konsole
- Feiertage-Modal öffnet, Deaktivieren/Umbenennen/Custom-Anlegen funktioniert
- Bei neuer Version: „Was ist neu"-Modal erscheint einmalig
- Nach zweitem Reload erscheint das Modal nicht mehr

## GitHub-Deployment

Repo: `ollies-spielwiese/Arbeitszeiterfassung`. Pages läuft direkt vom Root-Branch `main`.

Push-Skript (alle Dateien aus dem Arbeitsverzeichnis kopieren, committen, pushen):

```bash
cd /tmp && rm -rf az_gh
gh repo clone ollies-spielwiese/Arbeitszeiterfassung az_gh -- --depth=1 -q
cd az_gh
cp /home/user/workspace/arbeitszeit/{app.js,index.html,styles.css,sw.js,manifest.json,icon.svg,icon-192.png,icon-512.png,icon-512-maskable.png,RELEASE.md,README.md} .
git config user.name "Oliver Gläser"
git config user.email "glaeser.oliver@icloud.com"
git add -A
git commit -m "vX.Y: Kurzbeschreibung" -q
git push origin HEAD -q
```

Pages-Build-Status prüfen (dauert typischerweise 30-90 Sekunden):

```bash
gh api repos/ollies-spielwiese/Arbeitszeiterfassung/pages/builds/latest \
  --jq '{status:.status, commit:.commit, error:.error.message}'
```

Live-Check (Cache umgehen mit Query-Parameter):

```bash
curl -s "https://ollies-spielwiese.github.io/Arbeitszeiterfassung/sw.js?x=$(date +%s)" | head -2
```

Die zweite Zeile sollte die neue Version zeigen.

Falls der Pages-Build hängt, hilft ein No-op-Commit auf `sw.js` mit einem Header-Kommentar. Wichtig: Kommentar vor Zeile 1 einfügen, nicht Zeile 1 überschreiben:

```bash
sed -i "1i// rebuild $(date +%s)" sw.js
```

Niemals `sed -i "1s/.../.../"` verwenden, das würde `CACHE_NAME` zerstören.

## Perplexity-Deployment

Für Preview-Link im Perplexity-Thread (asset_id bleibt stabil, gleiche URL wird aktualisiert):

```bash
pplx-tool deploy_website <<'JSON'
{"project_path":"/home/user/workspace/arbeitszeit","site_name":"Arbeitszeiterfassung","entry_point":"index.html"}
JSON
```

Ausführen mit `api_credentials=["pplx-tool:deploy_website"]` und `timeout=600000`.

## ZIP für Marielle

```bash
cd /home/user/workspace
rm -f Arbeitszeiterfassung.zip
zip -qj Arbeitszeiterfassung.zip \
  arbeitszeit/{app.js,index.html,styles.css,sw.js,manifest.json,icon.svg,icon-192.png,icon-512.png,icon-512-maskable.png}
```

ZIP wird im Thread mit Asset-Name `arbeitszeit_v2_7` geteilt (Versions-Historie bleibt erhalten).

## Nach dem Deploy

- Falls die PWA auf iPad/iPhone bereits installiert ist: Das v3.3 Auto-Update-Banner erledigt die Aktualisierung automatisch beim nächsten Öffnen. Nutzer tippt auf „Jetzt aktivieren".
- Falls das Banner nicht erscheint (z. B. weil der Browser die SW-Registrierung verzögert): App im Hintergrund komplett schließen und neu öffnen, oder Homebildschirm-Icon entfernen und neu anlegen.

## Rollback

Bei kaputtem Deploy: letzten funktionierenden Commit auf `main` zurücksetzen.

```bash
cd /tmp/az_gh
git log --oneline -5
git revert HEAD --no-edit
git push origin HEAD -q
```

Cache-Version im gerollbackten `sw.js` muss höher sein als die kaputte, sonst nutzen Clients weiter den defekten Cache. Zur Not manuell `CACHE_NAME` bumpen (z. B. `arbeitszeit-v3-3-hotfix`).
