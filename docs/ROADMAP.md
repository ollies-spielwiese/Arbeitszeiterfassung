# Arbeitszeit-App — Roadmap v3.9 → v4.0

**Status (Stand v3.9.96, 27.10.2026): Phasen 1–4 und 6 sind vollständig umgesetzt, Phase 5 bis auf einen optionalen Punkt.** Die strukturellen Phasen 1–4 wurden bis v3.9.36 abgeschlossen (Typprüfung per `@ts-check`/`tsc --noEmit`, Migrations-Layer, Export-Inhaltsprüfung, CI, Modul-Split von `app.js`). Die Abschnitte zu Phase 1–4 bleiben als historische Referenz erhalten. Aktuelle offene Aufgaben stehen unter „Phase 7“ am Ende.

Reihenfolge nach v3.8.1. Prinzip: erst Sicherheitsnetze, dann Umbauten; erst Verstehen, dann Verändern; niedriger Aufwand mit hohem Hebel zuerst.

## Phase 1 — Sicherheitsnetz ✅ Erledigt

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

## Phase 2 — Verstehen ✅ Erledigt

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

## Phase 3 — Modul-Split ✅ Erledigt

Ziel: `app.js` (4118 Zeilen) in isolierte Bereiche zerlegen, ohne Build-Pipeline. **Ergebnis:** `app.js` ist auf 1683 Zeilen (Entry-Point, Wiring, Ctx-Builder) geschrumpft; alle unten genannten Module existieren real (`modules/state.js`, `holidays.js`, `compute.js`, `render/*`, `export/pdf.js`+`word.js`, `ui/*`).

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

## Phase 4 — Sauberkeit ✅ Erledigt

Ziel: strukturell unmöglich machen, dass sich Summary-Varianten wieder auseinander entwickeln. **Ergebnis:** `modules/selectors.js` zieht das Selector-Prinzip über Compute/Render/Export; `npm run typecheck` läuft in beiden CI-Workflows mit.

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

## Phase 5 — Feature-Ideen nach der Strukturphase (Stand v3.9.96, 27.10.2026)

Vorschläge aus den „Erweiterungs-Rezepten“ in [docs/ARCHITECTURE.md](ARCHITECTURE.md#erweiterungs-rezepte):

- **CSV-Export** ✅ Erledigt (v3.9.47) — Monatsbericht als CSV (Excel-kompatibel, UTF-8 mit BOM), analog zu PDF/Word.
- **Undo für Zeitraum-Erfassung** ✅ Erledigt (v3.9.47) — Rückgängig-Aktion direkt im Toast nach dem Anlegen mehrerer Tage.
- **Weitere Bulk-Erfassungs-Typen** — offen (optional): Muster aus `modules/range-entry.js` auf einen eigenen Eintragstyp wie „Fortbildung“ oder „Bildungsurlaub“ übertragen (Rezept „Neues Entry-Typ“).
- **Bundesland-Feiertage pflegen** — laufende Pflegeaufgabe: sobald neue gesetzliche Feiertage hinzukommen (Rezept „Neues Bundesland-Feiertag“).

### Zusätzlich umgesetzt (Nutzeranfragen, nicht vorab geplant)

Details jeweils im `CHANGELOG` in `modules/constants.js`.

- **v3.9.47–v3.9.48:** Eintragstyp „Freier Tag“, Backup-Erinnerung, Änderungsprotokoll, Gleitzeitkonto-Ansicht mit Kalenderjahr-Auswahl.
- **v3.9.53–v3.9.59:** Hilfe-Buttons (Einstellungen, Arbeitgeber/Kunden), Arbeitgeberwechsel mit „Beschäftigt bis“ und „Ehemalige anzeigen“, Pers.-Nr., strikte Trennung Arbeitgeber/Kunden inkl. Migration.
- **v3.9.60–v3.9.65:** Migrationsketten-Test, zweiter Regressionslauf unter WebKit (Safari-Engine), visuelle Regression mit festen Baselines, Lighthouse-Check in CI.
- **v3.9.66–v3.9.71:** Layout-/Label-Fixes im Freiberufler-Modus, Service-Worker-Update-Fix, Backup-Erinnerung im 7-Tage-Takt, Backup-Ordner (Chrome/Edge) bzw. Hinweis für Safari/iOS.
- **v3.9.72–v3.9.77:** Arbeitszeitmodell (Beschäftigungsart, Gleitzeit usw.) inkl. Anzeige in Berichten, Sollstunden „pro Jahr“, Info-Tooltip an der Saldo-Kachel, Gleitzeitkonto-PDF, Jahr-Pulldowns.
- **v3.9.78–v3.9.81:** Sollstunden-Warnung (Monats-Saldo mit anteiligem Soll und Mindest-Arbeitstage-Schutz; Gleitzeitkonto-Saldo über rollierendes 3-Monats-Fenster; Standard 20 %/10 %), Saldo-Kachel „Stand heute“, Hinweis „Bitte auf fehlende Einträge achten.“
- **v3.9.82–v3.9.89:** Modus „Freiberuflich/Nebenerwerb“ mit passenden Bezeichnungen, Hinweis bei Wochenschema ohne Arbeitstag, iOS-Freigabe-Dialog-Fix, Urlaubsplanung-Kalender, einheitlicher Teilen-Dialog, Bemerkungsfeld für alle Eintragsarten.
- **v3.9.90–v3.9.94:** Zuverlässiges Update auf iPhone/iPad, einheitliche Offline-Prüfung von E-Mail-Adressen inkl. WebKit-Fixes.
- **v3.9.95–v3.9.96:** Audit-Korrekturen F01–F22 (siehe [F01-F04-SICHERHEIT-UND-SPEICHER.md](F01-F04-SICHERHEIT-UND-SPEICHER.md) und [AUDIT-F05-F22.md](AUDIT-F05-F22.md)): Backup-Validierung, sichtbare Speicherfehler mit Notfall-Backup, Home-Office über Mitternacht/Zeitumstellung, Stichtag- und Beschäftigungsgrenzen im Gleitzeitsaldo, Konfliktschutz bei Abwesenheiten, robustere Offline-Updates.

## Phase 6 — Stabilität, Sicherheit, Weiterentwicklungsfähigkeit ✅ Erledigt

Aus der Bestandsaufnahme vom 11.09.2026 (v3.9.48). Alle Punkte umgesetzt und am 27.10.2026 im Repository bzw. in den GitHub-Einstellungen geprüft:

1. **Backup-Import mit Migrations-Lauf** ✅ v3.9.49 — `importBackup()` hebt Backups auf den aktuellen Schema-Stand; seit v3.9.95 zusätzlich Strukturprüfung vor und nach der Migration (`modules/backup-validation.js`).
2. **Kein stiller Datenverlust bei defektem localStorage** ✅ v3.9.49 / v3.9.95 — beschädigte Daten werden gemeldet statt still zurückgesetzt; Speicherfehler bleiben sichtbar, Notfall-Backup sichert ungespeicherte Änderungen.
3. **Dependabot-Sicherheitsupdates** ✅ v3.9.50 — aktiviert; aktuell 0 offene Warnungen.
4. **Subresource Integrity für CDN-Libraries** ✅ v3.9.50 — jsPDF, AutoTable und docx werden mit Integrity-Hash geladen (`modules/lib-loader.js`).
5. **CodeQL in CI** ✅ v3.9.50 — Standardanalyse aktiv; die Warnungen zu fehlenden Workflow-Berechtigungen wurden am 06.10.2026 behoben (`permissions: contents: read`), aktuell 0 offene Warnungen.
6. **Branch Protection auf `main`** ✅ v3.9.65 — Schutz gegen Force-Push/Löschung; Pflicht-Prüfungen: Playwright-Regression, Playwright-Regression (WebKit/Safari), Visual-Regression, Lighthouse-Check.

## Phase 7 — Offene Aufgaben (Stand 27.10.2026)

Priorisiert nach Notwendigkeit:

1. **Test auf echtem iPhone/iPad** (notwendig) — Update-Übernahme und Datenerhalt in der installierten PWA, Notfall-Download und Speicher-Warnbereich (v3.9.95), E-Mail-Fehlerhinweise (v3.9.92–v3.9.94). WebKit-Automation und Touch-Emulation ersetzen diesen Gerätetest nicht.
2. **Manuelle Szenario-Prüfung** (empfohlen) — Arbeitgeberwechsel, Urlaub und Nebenerwerb mit dem Test-Backup in der laufenden App durchklicken, inklusive aller Ansichten und der PDF-, Word- und CSV-Exporte.
3. **Restliche Audit-Themen** (empfohlen, eigener Change) — ungenutzte Deklarationen, mögliche überflüssige Dateien/Assets, umfassendere Dokumentationsbereinigung und weitere Härtungspunkte; laut [AUDIT-F05-F22.md](AUDIT-F05-F22.md) bewusst nicht mit v3.9.96 erledigt.
4. **Weitere Bulk-Erfassungs-Typen** (optional) — siehe Phase 5.
5. **Feiertage pflegen** (laufend) — siehe Phase 5.

## Nicht-Ziele (bewusst nicht auf der Roadmap)

- Framework-Umstieg (React/Vue/Svelte). Vanilla-JS ist bewusste Entscheidung
- Vollständige TypeScript-Umschreibung. JSDoc + `checkJs` reicht
- Backend/Sync. App bleibt offline-first
- Build-Pipeline (Webpack/Vite/esbuild). ES-Module nativ reichen
