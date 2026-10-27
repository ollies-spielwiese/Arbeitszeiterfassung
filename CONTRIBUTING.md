# Contributing

Kurz: Lies `docs/ARCHITECTURE.md`, dann `docs/CHECKLIST.md`. Danach die Regeln hier.

Diese Datei sagt, wie ein Change konkret durch das Repo geht — vom Setup bis zum Release.

---

## Setup

```
git clone https://github.com/ollies-spielwiese/Arbeitszeiterfassung.git
cd Arbeitszeiterfassung
npm ci
```

`npm ci` installiert die Dev-Dependencies (Playwright, pdf-parse, mammoth, TypeScript für JSDoc-Checks). Die App selbst hat keine Runtime-Dependencies.

**Optional:** Playwright-Chromium einmal lokal installieren, wenn du Regression fahren willst:
```
npx playwright install chromium
```

In CI wird das automatisch mit `--with-deps` gemacht.

---

## Lokal starten

Zwei Terminals — die App ist statisch, der HTTP-Server läuft getrennt:

```
# Terminal 1
npm run serve
```

```
# Terminal 2
open http://localhost:8765
```

Live-Reload gibt es nicht. Nach Änderungen an `app.js` oder `modules/` einmal Hard-Reload (Cmd/Ctrl-Shift-R). Der Service Worker cached aggressiv — im DevTools „Application" → „Service Workers" → „Update on reload" aktivieren, oder den Cache manuell löschen.

---

## Regression fahren

```
# In Terminal 2, während Terminal 1 den Server hält:
npm run qa
```

Erwartete Ausgabe: `N/N Checks OK — 0 Fehler — X.Xs` (N wächst mit jedem neuen Test). Jeder Fehler ist rot.

Vor der Regression außerdem den JSDoc-Typcheck fahren:
```
npm run typecheck
```
Erwartet: `echte Fehler: 0` (DOM-Rauschen wird gefiltert).

Weitere Prüfungen:
- `ENGINE=webkit npm run qa` — dieselbe Regression in WebKit (Safari).
- `npm run visual:test` — Pixelvergleich gegen `visual-baselines/`; Abweichungen landen in `visual-diffs/` (nicht versioniert). Bewusste Layout-Änderungen mit `npm run visual:update` übernehmen.

Headed-Modus für Debugging (Chromium öffnet sichtbar):
```
npm run qa:headed
```

Wenn Regression rot ist, ist der Change nicht fertig. Kein Bump, kein Commit auf `main`, kein Deploy.

---

## Änderungen umsetzen

### Vor dem Coden

1. Lies das relevante Kapitel in `docs/ARCHITECTURE.md`.
2. Prüfe die Erweiterungs-Rezepte dort — es gibt für die üblichen Fälle bereits einen Ablauf.
3. Wenn dein Change eine State-Migration braucht: siehe „Migrations-Kontrakt" in `ARCHITECTURE.md`.

### Beim Coden

- Neue Zusammenfassungs-Felder gehen durch `getSummaryFields`. Nicht direkt in Renderer.
- Neue Berechnungen in `compute`-Funktionen. Renderer rufen nur auf.
- Neue Exporte konsumieren `AZMonthReport` oder `AZMonthOverview`. Nie direkt `state`.
- JSDoc-Signaturen für neue Public-Funktionen setzen — `types.js`-Typen wo passend referenzieren.
- Kein Feature-Creep: wenn du bei einem Fix ein zweites Ding entdeckst, das dich stört — separater Commit oder Ticket. Nicht einfach mitnehmen.

### Nach dem Coden

1. `npm run qa` — muss grün sein.
2. Wenn dein Change eine neue Fähigkeit einführt, füge einen Regression-Test hinzu. Ohne Test ist der Change nicht abgeschlossen.
3. Wenn dein Change persistierte Daten verändert, schreibe eine Migration (siehe `ARCHITECTURE.md`).

---

## Version-Bump-Ablauf

Jede Änderung, die Nutzer sichtbar erreicht (Feature, Bugfix, UI-Änderung, Regression-Erweiterung), bekommt einen Bump. Reine Doku-Änderungen (README, ARCHITECTURE, CONTRIBUTING) brauchen keinen Bump.

### Checkliste

1. `npm run qa` — grün.
2. Version an **vier Stellen** anheben, synchron:
   - `modules/constants.js` → `export const APP_VERSION = 'X.Y.Z';`
   - `package.json` → `"version": "X.Y.Z"`
   - `sw.js` → `const CACHE_NAME = 'arbeitszeit-vX-Y-Z';`
   - `index.html` → `#app-version-badge` (`vX.Y.Z`)
3. `CHANGELOG` in `modules/constants.js` erweitern — neuer Eintrag oben (Umlaute direkt als UTF-8 schreiben):
   ```js
   { version: 'X.Y.Z', items: [
       'Kurzer Satz, was drin ist',
       'Nächster Punkt',
   ]},
   ```
4. `npm run qa` erneut — grün.
5. Commit mit klarer Nachricht:
   ```
   vX.Y.Z: kurze Beschreibung
   ```
6. `git push origin main` → CI läuft automatisch.
7. Auf grüne CI warten (Regression + Pages-Deploy).
8. Live prüfen: `curl -s "https://ollies-spielwiese.github.io/Arbeitszeiterfassung/modules/constants.js?nc=$(date +%s)" | grep APP_VERSION`

Wenn CI rot ist, wird der Push zurückgezogen oder ein Fix-Commit auf denselben Branch hinterhergeschoben. Nie einen roten Zustand auf `main` liegen lassen.

### Semver-Konvention

- **Patch** (X.Y.Z → X.Y.Z+1): Bugfix, Refactor ohne Verhaltensänderung, interne Regression-Erweiterung.
- **Minor** (X.Y.Z → X.Y+1.0): Neues Feature, das rückwärtskompatibel ist.
- **Major** (X.Y.Z → X+1.0.0): Persistiertes Datenformat inkompatibel geändert (auch wenn migrierbar).

---

## CI

Drei Workflows in `.github/workflows/` (alle mit `permissions: contents: read`, sofern nicht mehr nötig ist):

- `regression.yml` — läuft bei jedem Push und PR auf `main`. Drei Jobs: `Playwright-Regression` (Typcheck + Chromium), `Playwright-Regression (WebKit/Safari)` und `Visual-Regression`. Zeitlimit je Job (auch in `lighthouse.yml` und `pages.yml`) 20 Minuten (Playwright-Installation auf langsamen Runnern dauert teils über 6 Minuten).
- `lighthouse.yml` — Lighthouse-Check (Performance, Barrierefreiheit, Best Practices).
- `pages.yml` — deployt GitHub Pages, aber nur nach grüner Regression im selben Run (Job `qa`, `needs: qa`). Kopiert nur statische App-Files ins Artifact (kein `node_modules`, kein `scripts/`, kein `package.json`).

Dependabot und CodeQL laufen zusätzlich über die Repo-Einstellungen.

---

## Pull Requests

Aktuell arbeitet das Projekt direkt auf `main`. Seit v3.9.65 ist `main` per GitHub Branch Protection gegen Force-Pushes und Löschung geschützt; zusätzlich sind die Checks `Playwright-Regression`, `Playwright-Regression (WebKit/Safari)`, `Visual-Regression` und `Lighthouse-Check` als Required Status Checks hinterlegt (`strict: true`). `enforce_admins` ist bewusst deaktiviert, damit der bisherige Direct-Push-Workflow von Repo-Admins unverändert weiterläuft — die Required Checks greifen vor allem, sobald Dritte (z. B. Dependabot- oder externe PRs) einen Merge-Button sehen wollen. Wenn Mitentwickler einsteigen, gilt zusätzlich:

- Feature-Branch von `main` abzweigen.
- PR gegen `main` öffnen — CI-Regression muss grün sein.
- Review-Kriterien:
  - Hält sich an die Modul-Grenzen aus `ARCHITECTURE.md`.
  - Neue Fähigkeit → neuer Regression-Test.
  - Neue persistierte Struktur → Migration mit Test.
  - Version gebumpt, `CHANGELOG` gepflegt.
- Merge nur bei grün + einem Review.

---

## Was NICHT ins Repo gehört

- `node_modules/` — `.gitignore` regelt das.
- Persönliche `state`-Backups (die JSON-Exports der App).
- `.env` — die App braucht keine Secrets.
- `dist/`, `build/` — die App wird nicht gebaut, sondern statisch ausgeliefert.

---

## Häufige Stolperfallen

**„Regression läuft lokal grün, in CI rot."** Meist Playwright-Version-Drift. `package.json` pinnt `playwright: 1.59.0` exakt (kein `^`). Wenn ein anderer Dev-Package eine Range-Version einbringt, kann das den Chromium-Download brechen. Bei Verdacht: `rm -rf node_modules package-lock.json && npm install`.

**„Service Worker zeigt alte Version nach Push."** `CACHE_NAME` in `sw.js` wurde nicht gebumpt. Das ist Pflicht bei JEDER gecachten Änderung, siehe Checkliste oben. Der Update-Banner triggert nur, wenn der Cache-Name sich ändert.

**„Pages baut den neuen Stand nicht."** Sollte mit dem CI-Deploy nicht mehr passieren. Falls doch: Actions-Tab im Repo öffnen, Run manuell via „Run workflow" starten. Historisch war ein leerer Trigger-Commit nötig — mit `pages.yml` nicht mehr.

**„localStorage-Migration hängt."** Migrations sind idempotent gebaut. Wenn eine hängt, ist entweder `SCHEMA_VERSION` nicht erhöht oder die Migration mutiert state falsch. Regression-Test M2 fängt das ab.

---

## Ansprechpartner

Repo-Owner: [ollies-spielwiese](https://github.com/ollies-spielwiese)

Issues bitte im GitHub-Repo öffnen, nicht per E-Mail.
