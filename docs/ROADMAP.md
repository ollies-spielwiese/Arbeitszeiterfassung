# Arbeitszeit-App — Roadmap v3.9 → v4.0

Reihenfolge nach v3.8.1. Prinzip: erst Sicherheitsnetze, dann Umbauten; erst Verstehen, dann Verändern; niedriger Aufwand mit hohem Hebel zuerst.

## Phase 1 — Sicherheitsnetz

Ziel: keine strukturelle Änderung mehr ohne automatische Absicherung.

### 1. JSDoc-Typen + `//@ts-check`
- **Umfang:** `state`, `Entry`, `Employer`, `getSummaryFields()`, `computeMonthReport()`, `computeMonthOverview()`, `computeWorkMinutes()`
- **Wie:** `@typedef`-Blöcke am Kopf von `app.js`, `//@ts-check` als erste Zeile
- **Aufwand:** 2h
- **Nutzen:** VS Code zeigt Autocomplete und Fehler in Echtzeit; kein Build nötig
- **Fertig wenn:** VS Code meldet 0 Fehler auf `app.js` mit aktivierten Types

### 2. State-Migrations-Layer
- **Umfang:** `state.schemaVersion` einführen (Start = 1), `migrations`-Array mit `{ from, to, fn }`, Aufruf in `loadState()`
- **Wie:** In `state.js` (nach Modul-Split) oder vorerst in `app.js`. Beim Laden alle passenden Migrations sequentiell laufen lassen, danach `schemaVersion` hochziehen
- **Aufwand:** 2h
- **Nutzen:** Feld-Renames und Struktur-Änderungen brechen keine User-Backups mehr
- **Fertig wenn:** Ein Test-Backup mit `schemaVersion: 1` lädt sauber unter neuer Struktur

### 3. Regression um PDF/Word-Inhalt erweitern
- **Umfang:** `scripts/regression.mjs` — nach jedem Blob-Download den Inhalt parsen und auf konkrete Werte prüfen
- **Wie:** `pdf-parse` für PDF (Text-Extraktion), `mammoth` oder ZIP-Textextraktion für Word. Assertions auf `IST`, `SOLL`, `SALDO` und konkrete Beträge (z.B. `595,00 €`)
- **Aufwand:** 3h
- **Nutzen:** Export-Regressionen (falsche Zahlen, fehlende Zeilen) werden sichtbar, nicht mehr nur "Datei existiert"
- **Fertig wenn:** Regression-Sweep prüft ≥ 6 konkrete Textinhalte in generierten Exporten

### 4. GitHub Actions CI
- **Umfang:** `.github/workflows/qa.yml` — bei Push und PR: Node setup → `npm ci` → Playwright install → `npm run qa`
- **Aufwand:** 1h
- **Nutzen:** Rot-Pushes werden mit Badge und Mail sichtbar; unmöglich zu übersehen
- **Fertig wenn:** Grüner Badge in README, ein absichtlich rotgemachter PR wird von Actions gefangen

## Phase 2 — Verstehen

Ziel: nach drei Monaten Pause in fünf Minuten wieder drin sein.

### 5. `docs/ARCHITECTURE.md`
- **Umfang:** 5 Abschnitte à ~1 Absatz
  1. State-Struktur (Baum, Feldbedeutung, wo persistiert)
  2. Datenfluss (Entry → compute → render → export)
  3. Modul-Trennung (was gehört wohin, was NICHT)
  4. Modus-Umschaltung (Employee vs. Freelance, LABELS-Mechanismus)
  5. Warum kein Framework (bewusste Entscheidungen, Trade-offs)
- **Aufwand:** 2h
- **Nutzen:** Grundlage für Modul-Split; Onboarding-Doku für Zukunfts-Ich

### 6. `CONTRIBUTING.md` + `README.md` aktualisieren
- **Umfang:** Lokaler Start (`python3 -m http.server 8765`), QA (`npm run qa`), Release-Prozess (Version-Bump-Regeln, Cache-Name-Schema, Changelog), Commit-Konventionen
- **Aufwand:** 1h
- **Nutzen:** Cache-Bump-Regel dokumentiert; keine vergessenen `sw.js`-Bumps mehr

## Phase 3 — Modul-Split

Ziel: `app.js` (4118 Zeilen) in isolierte Bereiche zerlegen, ohne Build-Pipeline.

### 7. `app.js` in ES-Module aufteilen
- **Reihenfolge (ein Modul pro Commit, nach jedem Commit `npm run qa`):**
  1. `state.js` — State-Objekt, `loadState`/`saveState`, Migrations, Konstanten (STORAGE_KEY, APP_VERSION)
  2. `holidays.js` — Feiertagsberechnung 16 Bundesländer
  3. `compute/report.js` — `computeMonthReport`, `computeMonthOverview`, `computeWorkMinutes`, `getSummaryFields`
  4. `render/views.js` — Tracker, Week, Report, Overview
  5. `render/modals.js` — Entry-Modal, Employer-Modal
  6. `export/pdf.js` — jsPDF-Aufrufe
  7. `export/word.js` — Word-Blob-Generierung
  8. `app.js` als Entry-Point behält Routing/Init und importiert alle Module
- **Aufwand:** 1 Tag
- **Nutzen:** Änderungen in `export/pdf.js` können nichts in `render/views.js` brechen
- **Wichtig:** `<script type="module">` in `index.html`, Cache-Version im `sw.js` bumpen, alle Module in `sw.js` cachen

## Phase 4 — Sauberkeit

Ziel: strukturell unmöglich machen, dass sich Summary-Varianten wieder auseinander entwickeln.

### 8. Compute/Render/Export-Trennung durchziehen
- **Muster:** Selector-Prinzip (`getSummaryFields`) auf alle datenerzeugenden Bereiche ausrollen
  - Tabellen: `computeEntryRows(employerId, ym)` liefert Row-Objekte; `renderEntryRows(rows)` produziert DOM; `exportEntryRows(rows, format)` produziert PDF/Word
  - Overview-Rows: analog
  - Modal-Formulare: `computeFormFields(entry)` liefert Feld-Definitionen; `renderModal(fields)` produziert DOM
- **Aufwand:** 3–5 Tage (verteilt)
- **Nutzen:** ~80% der historischen Bug-Klassen (Home-Office-Regressionen, Summary-Divergenz zwischen Views, Modal-Stack-Bugs) werden strukturell unmöglich

### 9. `tsc --noEmit` als Type-Checker in CI
- **Umfang:** `tsconfig.json` mit `"allowJs": true`, `"checkJs": true`, `"noEmit": true`, `"strict": true`. Kein Build, nur Check
- **Wie:** `npm run typecheck` als Script; in `.github/workflows/qa.yml` mit ausführen
- **Aufwand:** 2 Tage (Setup + Type-Fehler beheben)
- **Nutzen:** ~40% künftiger Bugs werden beim Tippen abgefangen, nicht im Browser

## Nicht-Ziele (bewusst nicht auf der Roadmap)

- Framework-Umstieg (React/Vue/Svelte). Vanilla-JS ist bewusste Entscheidung
- Vollständige TypeScript-Umschreibung. JSDoc + `checkJs` reicht
- Backend/Sync. App bleibt offline-first
- Build-Pipeline (Webpack/Vite/esbuild). ES-Module nativ reichen
