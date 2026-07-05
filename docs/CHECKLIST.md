# Projekt-Checkliste — für neue Webprojekte

Lehre aus der Arbeitszeit-App (v1.0 → v3.8.1, 38 Releases). Nicht jeder Punkt ist bei jedem Projekt Pflicht, aber jeder soll bewusst entschieden werden.

## Vor der ersten Zeile Code

- [ ] **Zweck in einem Satz.** "Diese App macht X für Y, damit Z." Wenn der Satz unklar ist, ist die Feature-Grenze unklar.
- [ ] **Scope-Grenzen dokumentieren.** Was ist NICHT-Ziel. Verhindert Feature-Creep von Tag 1.
- [ ] **Technologie bewusst wählen.** Vanilla-JS, Framework, Fullstack — Begründung schriftlich, nicht "war halt so".
- [ ] **Deployment-Ziel klar.** GitHub Pages, S3, Vercel, PWA — beeinflusst Struktur und Cache-Strategie.
- [ ] **Datenmodell skizzieren** bevor Code entsteht. Mindestens JSDoc `@typedef` oder JSON-Beispiel.

## Repo-Setup (Tag 1)

- [ ] `README.md` mit: Zweck, lokaler Start, Deployment
- [ ] `docs/ARCHITECTURE.md` — auch wenn erst 3 Absätze
- [ ] `CONTRIBUTING.md` mit Commit-Konvention, Release-Prozess, QA-Kommando
- [ ] `.gitignore` sauber (node_modules, .DS_Store, dist, .env)
- [ ] Version-Konstante im Code (`APP_VERSION`) — sichtbar für User
- [ ] Cache-Name-Schema definiert, falls PWA (z.B. `projekt-vMAJOR-MINOR-PATCH`)

## Code-Struktur

- [ ] **Trennung von Compute, Render und Export** von Anfang an. Nicht erst später refactoren.
- [ ] **Ein Selector-Layer** für abgeleitete Daten (Summaries, aggregierte Views) — nicht in jeder View neu berechnen.
- [ ] **ES-Module ab Datei 2.** Nie zulassen, dass ein Modul >2000 Zeilen wächst.
- [ ] **Keine Business-Logik in Event-Handlern.** Handler ruft Compute → Render, nichts sonst.
- [ ] **State an einer Stelle.** Kein verstreuter globaler State, kein doppelter Speicher.
- [ ] **JSDoc + `//@ts-check`** in allen State- und Compute-Dateien.
- [ ] **State-Version** und Migrations-Layer ab v1.0 vorbereitet, nicht erst wenn's brennt.

## Persistenz

- [ ] `STORAGE_KEY` mit Projekt-Prefix
- [ ] `schemaVersion` im gespeicherten Objekt
- [ ] Migrations-Array vorhanden, auch wenn zunächst leer
- [ ] Export/Import (Backup) implementiert, bevor >10 Testuser existieren
- [ ] Fehler-Handling für kaputten LocalStorage (JSON-Parse-Fehler, Quota exceeded)

## Testing / QA

- [ ] **Regression-Skript ab v1.0.** Mindestens: App startet, Kernflow funktioniert, Export erzeugt korrekten Inhalt
- [ ] **Selector-Unit-Tests** für Compute-Funktionen (Roh-Input → Roh-Output, kein DOM)
- [ ] **E2E-Test pro Hauptmodus** (falls App mehrere Modi hat)
- [ ] **Export-Inhalt prüfen**, nicht nur "Datei existiert" — konkrete Werte im PDF/Word/CSV assert-en
- [ ] **CI ab Tag 1** (GitHub Actions). Ohne Grün kein Merge.
- [ ] **Playwright oder ähnlich** für Browser-Tests, nicht "läuft im Chrome"

## Release-Disziplin

- [ ] Version-Bump immer in mindestens 3 Stellen synchron: Code-Konstante, `index.html`-Badge, `sw.js` (PWA-Cache)
- [ ] Changelog-Eintrag Pflicht bei jedem Release
- [ ] Tag im Git bei jedem Release (`git tag v3.8.1`)
- [ ] Nach Release Live-Verify per curl auf Version-String
- [ ] Keine Releases ohne grünen Regression-Sweep

## PWA-spezifisch

- [ ] `manifest.json` vollständig (name, short_name, icons 192/512/maskable, theme_color, background_color, display, start_url, scope)
- [ ] Service Worker mit versioniertem Cache-Namen
- [ ] `sw.js` listet ALLE gecachten Assets — bei jedem neuen Asset ergänzen
- [ ] Update-Flow für User (Prompt "Neue Version verfügbar")
- [ ] Offline-Fallback getestet, nicht nur angenommen

## UX-Grundlagen

- [ ] Tastatur-Navigation funktioniert
- [ ] Mobile-Test auf echtem Gerät, nicht nur DevTools-Emulation
- [ ] Kontrast WCAG AA (4.5:1 Body, 3:1 Large Text)
- [ ] Loading-States für alle async Operationen
- [ ] Fehler-States mit konkreter Handlungsanweisung, nicht "Something went wrong"
- [ ] Leere Zustände (Empty States) mit Call-to-Action, nicht leere Seite

## Vor jedem Commit

- [ ] `npm run qa` grün
- [ ] Manuell im Browser geprüft, nicht nur Tests
- [ ] Cache-Version gebumpt, falls PWA-Asset geändert
- [ ] Changelog-Eintrag ergänzt
- [ ] Commit-Message erklärt WARUM, nicht nur WAS

## Bewusst NICHT-Regeln (aus Erfahrung)

- **Kein Framework "weil man das so macht".** Vanilla + JSDoc reicht für 90% der Projekte.
- **Kein TypeScript-Build, wenn `checkJs` + JSDoc reicht.**
- **Kein npm install für alles.** Jede Dependency ist Wartungslast.
- **Keine Feature-Requests im laufenden Refactor.** Erst Refactor grün, dann neue Features.
- **Kein Merge ohne Regression grün.** Auch nicht "nur eine kleine Änderung".
- **Kein Cache-Bump vergessen.** User bekommen sonst stale JavaScript und melden Bugs, die nicht existieren.
