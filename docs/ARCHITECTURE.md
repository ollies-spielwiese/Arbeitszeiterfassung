# Architektur

Stand: v3.8.5. Wird gepflegt, wenn sich Struktur oder Kontrakte ändern.

## Ziel dieser Datei

Ein präzises, aktuelles Modell der App. Nicht Marketing, nicht Onboarding — sondern die Antworten auf: „Wo lebt was?", „Was ist ein State?", „Was darf ich verändern, ohne dass Regression bricht?", „Wie füge ich Feature X hinzu, ohne Duplikate zu schaffen?".

Wer die App weiterentwickelt, sollte diese Datei zuerst lesen und danach `types.js` und die Migrations-Sektion in `app.js`.

---

## Big Picture

- **Statische PWA.** Kein Build-Step, kein Framework. HTML/CSS/JS werden 1:1 von GitHub Pages ausgeliefert.
- **Offline-First.** Service Worker cached alle Assets. State liegt im `localStorage` unter `arbeitszeit_v1`.
- **Single Source of Truth für Daten:** das globale `state`-Objekt (`app.js:592`), definiert durch `AZState` in `types.js`.
- **Single Source of Truth für Zusammenfassungs-Felder:** `getSummaryFields()` (`app.js:254`). Screen, PDF, Word und E-Mail rendern aus demselben Feld-Array.
- **Zwei Modi:** `employee` (mit Soll/Saldo/Urlaub/Krank) und `freelance` (nur Ist + Rechnungsbetrag). Umschaltung via `state.settings.appMode`. Labels via `L(key)` (`app.js:216`).
- **Zwei Deploy-Pfade:** GitHub Actions (`.github/workflows/pages.yml`, mit Regression-Gate) und altes branch-basiertes Pages-Deployment (läuft parallel, kann später abgeschaltet werden).

Nicht-Ziele:
- Kein Server, kein Konto, keine Cloud-Sync.
- Kein Bundler. Kein npm-Runtime. `node_modules` ist reine Dev-Umgebung für Regression und Typing.

---

## Datenfluss

```
┌──────────────┐   User-Event    ┌──────────────┐  mutiert   ┌──────────┐
│  DOM / Modal │ ──────────────► │  Save-Fn.    │ ─────────► │  state   │
│  Klicks/Form │                 │ (saveEntry,  │            │ (global) │
└──────────────┘                 │  saveEmp,    │            └────┬─────┘
                                 │  saveHO,...) │                 │
                                 └──────┬───────┘                 │
                                        │                         │
                                        ▼                         │
                                  saveState()  ── persistiert ────┤
                                        │        (localStorage)   │
                                        ▼                         │
                                  render*()   ◄────liest──────────┘
                                (renderTracker,
                                 renderEntries,
                                 renderReport,
                                 renderOverview,
                                 renderEmployers, ...)
                                        │
                                        ▼
                                     DOM-Update
```

Regel: **Renderer lesen nur, Save-Fn. schreiben nur.** Aktuell mit Ausnahmen (siehe „Bekannte Verschmutzungen"), langfristig sauber getrennt.

Für Exporte (PDF/Word):

```
state ──► computeMonthReport ──► AZMonthReport ──► generatePdfBlob
                                                └─► generateWordBlob
                                                └─► renderReport (Screen)
                                                └─► shareReport (E-Mail)

state ──► computeMonthOverview ──► AZMonthOverview ──► generateOverviewPdfBlob
                                                    └─► renderOverview (Screen)
```

`AZMonthReport` und `AZMonthOverview` sind reine Werte-Objekte. Jeder Konsument (Screen, PDF, Word, E-Mail) leitet daraus seine Darstellung ab. Die zentrale Feld-Ableitung passiert in `getSummaryFields` (Report) und `getOverviewSummaryFields` (Overview) — dort ist die einzige Stelle, an der entschieden wird, welche Felder ein Modus zeigt.

---

## State-Layout

Vollständige Typen: `types.js` (`AZState`). Persistiert unter `localStorage['arbeitszeit_v1']`.

```
state (AZState)
├── schemaVersion: number              // aktuell 3
├── employers: AZEmployer[]            // im Freelance-Modus sind das "Kunden"
│   ├── id, name, hourlyRate, currency
│   ├── targetHours: number | null     // Monats-Soll (schlicht)
│   ├── weeklySchedule: AZSchedule|null // wenn gesetzt: pro Wochentag Std./Pause/Modus
│   └── contact: AZContact?             // Empfänger für Share
├── activeEmployerId: string
├── entries: AZEntry[]                 // die eigentlichen Zeit-Einträge
│   ├── id, employerId, date (YYYY-MM-DD)
│   ├── type: 'work' | 'vacation' | 'sick' | 'homeoffice'
│   ├── start/end/breakMinutes         // wenn type=work
│   ├── segments: [{start,end}]        // wenn type=homeoffice (Multi-Slot pro Tag)
│   └── note, createdAt
├── archives: AZArchive[]              // eingefrorene Monate
├── templates: AZTemplate[]            // Notiz-Bausteine, scope=employee|freelance|both
├── settings: AZSettings
│   ├── appMode: 'employee' | 'freelance'
│   ├── state: DE-Bundesland (Feiertage)
│   ├── holidayOverrides: { [stateCode]: { [YYYY-MM-DD]: {name,type} } }
│   └── ... UI-Präferenzen
└── runningTimer: AZRunningTimer | null // live gestartete Erfassung
```

**Regeln:**
- Kein Feld darf ohne Migration umbenannt oder gelöscht werden. Siehe „Migrations-Kontrakt".
- `entries[i].type` bestimmt, welche Felder gelten (`work` → start/end/breakMinutes; `homeoffice` → segments; `vacation`/`sick` → nur date).
- `hourlyRate === 0` bedeutet „keine Rechnung", nicht „unbezahlt". Getriggert im Freelance-Modus.
- `weeklySchedule` schlägt `targetHours` bei der Soll-Berechnung — siehe `computeMonthTargetMinutes` (`app.js:1042`).

---

## Aktuelle Modul-Karte (Ist-Zustand)

Alles lebt in `app.js`. Sektions-Kommentare markieren die logischen Cluster. Zeilenangaben sind Anker für v3.8.5:

| Cluster                    | Zeilen        | Kernfunktionen                                                            |
| -------------------------- | ------------- | ------------------------------------------------------------------------- |
| Konstanten & Changelog     | 30–133        | `APP_VERSION`, `SCHEMA_VERSION`, `CHANGELOG`                              |
| Storage-Abstraktion        | 136–186       | Wrapper um `localStorage`                                                 |
| State & Persistence        | 170–229       | `L()`, `formatMoney()`                                                    |
| Zentrale Selektoren        | 230–398       | `getSummaryFields`, `getOverviewSummaryFields`                            |
| Renderer für Selektoren    | 400–495       | `renderSummary{HTML,PdfLines,WordParagraphs,Plaintext}`                   |
| loadState / Migrationen    | 497–652       | `loadState`, `runMigrations`, `migrations[]`, `saveState`                 |
| Zeit/Datum-Utilities       | 654–825       | `todayISO`, `minutesToHM`, `hhmmToMinutes`, ISO-Wochen-Fallback           |
| Compute (Kern-Berechnung)  | 827–870       | `computeWorkMinutes`, `computeHomeofficeMinutes`, `isWorkedEntry`         |
| Feiertage                  | 871–1017      | `getHolidays`, Overrides, Easter-Algorithmus                              |
| Soll-Berechnung            | 1018–1156     | `computeMonthTargetMinutes`, `computeWeekTargetMinutes`                   |
| Employer-Helpers           | 1157–1189     | `getEmployer`, `ensureActiveEmployer`                                     |
| Views/Router               | 1168–1189     | `switchView`                                                              |
| Tracker (Tages-Ansicht)    | 1191–1425     | `renderTracker`, `startWork`, `endWork`, Live-Timer                       |
| Entry-Modal                | 1427–1605     | `openEntryModal`, `saveEntry`, `deleteEntry`, Template-Picker             |
| Home-Office-Modal          | 1607–1897     | `openHomeofficeModal`, Segment-Handling                                   |
| Entries-Liste              | 1898–1978     | `renderEntries`                                                           |
| Week-View                  | 1979–2087     | `renderWeek`, `isoWeekToDates`                                            |
| Monthly Report             | 2088–2398     | `computeMonthReport`, `renderReport`                                      |
| Word-Export                | 2223–2398     | `generateWordBlob`                                                        |
| PDF-Export                 | 2399–2572     | `generatePdfBlob`, `wrapText`                                             |
| Overview                   | 2574–2909     | `computeMonthOverview`, `renderOverview`, `generateOverviewPdfBlob`       |
| Export-UI (Buttons)        | 2911–2948     | `exportPdf`, `exportWord`, `exportOverviewPdf`                            |
| Share (E-Mail/WebShare)    | 2950–3252     | `openShareModal`, `shareReport`, `shareOverviewPdf`                       |
| Archiv                     | 3254–3337     | `archiveCurrentMonth`, `renderArchive`                                    |
| Employer-Modal             | 3338–3537     | `renderEmployers`, `openEmployerModal`, Schedule-Grid                     |
| Templates                  | 3538–3579     | `renderTemplates` (Setup-View)                                            |
| Feiertag-Overrides UI      | 3580–3765     | `renderHolidayList`, `openHolidayModal`                                   |
| Template-Modal             | 3767–3862     | `openTemplateModal`, `saveTemplate`                                       |
| Backup Import/Export       | 3863–3893     | `exportBackup`, `importBackup`                                            |
| Toast/Utils                | 3894–3908     | `escapeHtml`, `toast`                                                     |
| DOMContentLoaded / Wiring  | 3909–4113     | Event-Handler-Verkabelung                                                 |
| „What's new"-Modal         | 4114–4173     | `maybeShowWhatsNew`, `compareVersions`                                    |
| Service-Worker-Update-Flow | 4175–4234     | Update-Banner, Skip-Waiting-Handshake                                     |

---

## Ziel-Modul-Karte (Phase 3)

Wenn `app.js` in ES-Module zerlegt wird, dann so:

```
app.js  ── Einstiegspunkt (DOMContentLoaded, Router, Wiring)
│
├── modules/state.js       ← STORAGE_KEY, loadState, saveState, state (default export)
├── modules/migrations.js  ← SCHEMA_VERSION, migrations[], runMigrations
├── modules/types.js       ← bereits vorhanden, bleibt
├── modules/util-time.js   ← minutesToHM, hhmmToMinutes, isoDateAdd, etc.
├── modules/util-format.js ← formatMoney, formatDateLong, escapeHtml
├── modules/holidays.js    ← getHolidays, Overrides, Easter
├── modules/compute.js     ← computeWorkMinutes, computeMonthReport, computeMonthOverview, computeMonthTargetMinutes
├── modules/selectors.js   ← getSummaryFields, getOverviewSummaryFields
├── modules/render/
│   ├── summary.js         ← renderSummary{HTML,PdfLines,WordParagraphs,Plaintext}
│   ├── tracker.js         ← renderTracker + Live-Timer
│   ├── entries.js         ← renderEntries + Entry-Modal
│   ├── homeoffice.js      ← Home-Office-Modal (Segmente)
│   ├── week.js            ← renderWeek
│   ├── report.js          ← renderReport
│   ├── overview.js        ← renderOverview
│   ├── employers.js       ← renderEmployers + Employer-Modal + Schedule-Grid
│   ├── templates.js       ← renderTemplates + Template-Modal
│   ├── archive.js         ← renderArchive
│   └── settings.js        ← renderSettings + Holiday-Overrides UI
├── modules/export/
│   ├── pdf.js             ← generatePdfBlob, generateOverviewPdfBlob, wrapText
│   ├── word.js            ← generateWordBlob
│   └── share.js           ← shareReport, openShareModal, downloadBlob
└── modules/sw-update.js   ← Service-Worker-Update-Banner
```

Wichtige Grenzen:
- `compute/*` darf `render/*` nicht importieren. Nie.
- `render/*` darf `compute/*` und `selectors.js` importieren, aber nicht direkt an `state` schreiben — nur über explizite Save-Fn., die in demselben `render/*`-Modul wohnt.
- `export/*` konsumiert `AZMonthReport` / `AZMonthOverview` — keine State-Zugriffe.
- Der Einstiegs-`app.js` importiert nur, verkabelt Events und ruft Renderer.

Migration von hier nach dort: Phase 3 der Roadmap. Diese Modul-Karte ist der Plan.

---

## Zentrale Selektoren (Contract)

`getSummaryFields(input): AZSummaryField[]`

Einzige Stelle, an der entschieden wird, welche Zusammenfassungs-Felder ein Modus zeigt. Vier Konsumenten:

- `renderSummaryHTML` — DOM
- `renderSummaryPdfLines` — jsPDF
- `renderSummaryWordParagraphs` — docx
- `renderSummaryPlaintext` — E-Mail-Body

**Kontrakt:**
- Input: `AZSummaryInput` (mode, workedMin, hourlyRate, targetMin, balance, ...).
- Output: Array von `AZSummaryField` mit `key`, `label`, `value` (formatiert), plus `rawMinutes`/`rawAmount` für nicht-textliche Konsumenten (Word-Zellen).
- Neue Felder werden **hier** hinzugefügt. Renderer sind Feld-agnostisch.

Wenn ein Report ein Feld anzeigen soll, das PDF/Word nicht kennen, ist das ein Design-Fehler — `getSummaryFields` ist die Quelle.

`getOverviewSummaryFields(ov): AZSummaryField[]` — analog für die Monatsauswertung über alle Arbeitgeber/Kunden.

Nicht zentralisiert (Phase 4):
- **Tabellen-Zeilen** in Overview, Entries, Report — aktuell werden Zeilen an mehreren Stellen leicht anders gebaut.
- **Modal-Formulare** (Entry, Employer, Template, Contact, Schedule) — jedes Modal hat eigene Show/Validate/Submit-Logik.

---

## Migrations-Kontrakt

Formalisiert in v3.8.3. Regeln:

1. **`SCHEMA_VERSION` ist die einzige Wahrheit.** Aktuell 3.
2. **`migrations[]` ist ein Array von `{ from, to, apply(state) }`.** Jede Migration erhöht die Version um genau 1 und ist idempotent bei doppelter Anwendung.
3. **`runMigrations(state)` läuft in `loadState`** und iteriert vom aktuellen `state.schemaVersion` (Default 0 für Alt-Daten) bis `SCHEMA_VERSION`.
4. **Bestehende Daten dürfen sich nicht verändern**, außer die Migration steht dafür. Test: `mig-M2` in `scripts/regression.mjs` prüft genau das.
5. **Neue Migration = neuer Regression-Test** in Sektion 1b von `regression.mjs`. Sonst brechen die Idempotenz-Garantien.

Bekannte Migrationen:
- 0→1 (implizit, historisch): Baseline
- 1→2: Home-Office-Duplikat-Konsolidierung (`migrateHomeofficeEntries`, `app.js:600`)
- 2→3: Template `scope`-Feld setzen (`tpl-2` → `employee`, sonst `both`)

Neue Migration hinzufügen:
1. `SCHEMA_VERSION` erhöhen (`app.js:43`).
2. Neues Objekt in `migrations[]` einfügen (`app.js:538`).
3. `apply(state)` schreiben, muss `state` mutieren und ist der einzige Ort mit dieser Kenntnis.
4. Regression-Test in `runMigrationUnits` (`scripts/regression.mjs:129`) ergänzen: legacy in → migrated out.

---

## Regression-Kontrakt

`scripts/regression.mjs` ist das Sicherheitsnetz. CI läuft ihn bei jedem Push. Grün ist Voraussetzung für jeden Version-Bump und für den Pages-Deploy.

**Aktueller Umfang: 51 Checks in vier Sektionen.**

1. **Selektor-Unit-Tests** (8) — `getSummaryFields` in 5 Konfigurationen. Erwartet: richtige Felder pro Modus, richtige `rawAmount` und `rawMinutes`.
2. **Migrations-Unit-Tests** (8) — Legacy → migriert; Idempotenz; keine ungewollten Mutationen; Home-Office-Konsolidierung.
3. **E2E Freelance** (17) — Seed mit „Kunde Alpha" 09:00–16:00 @ 85 €/h → Tracker, Week, Report, Overview zeigen 595,00 €. PDF/Word/OverviewPDF werden generiert und **inhaltlich** gegen die Werte gecheckt.
4. **E2E Employee** (18) — Analog mit Ist/Soll/Saldo. PDF/Word/OverviewPDF-Textextraktion (via `pdf-parse` und `mammoth`) prüft, dass die Labels und die 7:00 Ist tatsächlich im Blob stehen.

**Regeln:**
- Rot = kein Merge, kein Bump, kein Deploy.
- Wenn ein Feature ohne neuen Test gebaut wird, ist es nicht fertig.
- Wenn ein Test einen Bug findet, wird der Bug gefixt — der Test bleibt.

Aufruf lokal:
```
npm run qa
```

Voraussetzung: HTTP-Server auf 8765 läuft (`npm run serve` in einem zweiten Terminal).

---

## Bekannte Verschmutzungen (technische Schuld)

Nicht kritisch, kommt in Phase 4 dran:

1. **Renderer mutiert manchmal `state`.** Einige `render*`-Funktionen setzen z. B. `activeEmployerId` oder aktualisieren `settings.lastView`. Wandert in Save-Fn.
2. **`saveEntry` schreibt DOM.** Die Entry-Save-Fn. macht mehr als speichern — sie rendert auch. Trennung: `saveEntry(dto)` mutiert nur, `renderEntries()` liest.
3. **Overview-Zeilen werden vierfach gebaut.** In `computeMonthOverview`, `renderOverview`, `generateOverviewPdfBlob`, sowie im Share-Weg. Kandidat für `getOverviewRows` nach `getSummaryFields`-Muster.
4. **Modal-Formulare sind wiederholend.** Jedes hat eigenes Show/Validate/Submit-Boilerplate. Kandidat für einen Modal-Controller mit deklarativen Bindings.
5. **`app.js` ist eine Datei.** Wird in Phase 3 auf ES-Module aufgeteilt (Ziel-Karte siehe oben).
6. **Alte Pages-Deployment läuft parallel.** Neben dem CI-gated Actions-Deploy triggert das Repo noch das Legacy „pages build and deployment". Sobald in den Repo-Settings die Pages-Source auf „GitHub Actions" umgestellt wird, verschwindet der Legacy-Run.

---

## Erweiterungs-Rezepte

### Neues Zusammenfassungs-Feld (z. B. „Fahrtkosten")

1. Feld in `AZSummaryInput` ergänzen (`types.js`).
2. In `getSummaryFields` das Feld in das Output-Array pushen (mit `key`, `label`, `value`, `rawAmount` falls nötig).
3. Wenn nötig, den Aufrufer erweitern, der `getSummaryFields` mit den Rohdaten füttert (Tracker / Report / Overview).
4. Unit-Test in `runSelectorUnits` ergänzen: „mode=X mit fahrtkosten liefert Feld `fahrtkosten` mit rawAmount=…".
5. Kein Renderer muss angefasst werden.

### Neues Entry-Typ (z. B. „Bildungsurlaub")

1. `AZEntry.type` erweitern (`types.js`).
2. `isWorkedEntry` prüfen — soll der neue Typ als geleistete Zeit zählen? (`app.js:853`)
3. `renderEntries` und `openEntryModal` ergänzen (UI).
4. Wenn nötig Migration schreiben (falls der Typ Bestandsdaten ersetzt).
5. Regression: seed einen Entry vom neuen Typ, Report muss ihn richtig zählen.

### Neuer Export-Format (z. B. CSV)

1. Neue Funktion `generateCsvBlob(report)` bauen.
2. Konsumiert `AZMonthReport` und `getSummaryFields` — greift nie direkt auf `state` zu.
3. Nutzt `renderSummaryPlaintext`-Ideen als Vorlage.
4. Button in Export-UI ergänzen.
5. Regression: `checkBlob(page, 'freelance', 'csv')` mit passenden Content-Assertions ergänzen.

### Neues Bundesland-Feiertag

Nicht Code, sondern `getHolidays` (`app.js:939`). Konstante Tabelle erweitern. Regression sollte einen Test bekommen, wenn der Feiertag exotisch ist.

---

## Versionierung & Release

- **`APP_VERSION`** in `app.js:31` — sichtbar im Header-Badge.
- **`CACHE_NAME`** in `sw.js:1` — muss synchron zu `APP_VERSION` sein (Schema `arbeitszeit-vMAJOR-MINOR-PATCH`), sonst zeigt der Service Worker alte Assets.
- **Badge in `index.html`** — im `<span class="app-version">`.
- **`CHANGELOG`** in `app.js:46` — neuester Eintrag oben. Wird beim ersten Öffnen einer neuen Version als „Was ist neu"-Modal angezeigt.

Der Version-Bump-Ablauf lebt in `CONTRIBUTING.md`.

---

## Referenzen

- `types.js` — alle Typ-Signaturen
- `scripts/regression.mjs` — 51 Checks
- `.github/workflows/regression.yml` — CI-Sweep
- `.github/workflows/pages.yml` — CI-gated Deploy
- `docs/ROADMAP.md` — Phasen und Reihenfolge
- `docs/CHECKLIST.md` — pro-Feature-Checkliste
- `CONTRIBUTING.md` — Setup, QA-Workflow, Version-Bump
