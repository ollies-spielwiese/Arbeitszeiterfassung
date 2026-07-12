# Arbeitszeiterfassung

[![Regression](https://github.com/ollies-spielwiese/Arbeitszeiterfassung/actions/workflows/regression.yml/badge.svg)](https://github.com/ollies-spielwiese/Arbeitszeiterfassung/actions/workflows/regression.yml)
[![Deploy](https://github.com/ollies-spielwiese/Arbeitszeiterfassung/actions/workflows/pages.yml/badge.svg)](https://github.com/ollies-spielwiese/Arbeitszeiterfassung/actions/workflows/pages.yml)

Offline-fähige Progressive Web App zur Erfassung von Arbeitszeit mit mehreren Arbeitgebern oder Kunden, Monatsübersicht, PDF- und Word-Export sowie rechtssicheren Pausen- und Feiertagsregeln für Deutschland. Zwei Modi: Angestellter (Soll/Ist/Saldo) und Freiberufler (Ist + Rechnungsbetrag).

**Live-App:** https://ollies-spielwiese.github.io/Arbeitszeiterfassung/

## Was die App kann

- Zeiterfassung per Start-/Stopp-Taste oder nachträglich per Formular
- Mehrere Arbeitgeber parallel mit unterschiedlichen Sollstunden und Zeitplänen
- Wöchentliche und monatliche Übersichten mit Soll/Ist/Saldo
- Übersichts-Tab: alle Arbeitgeber im Monatsvergleich
- PDF-Export einzelner Monatsberichte und der Übersicht
- Feiertage für alle Bundesländer, inklusive nachträglicher Anpassung (deaktivieren, umbenennen, ergänzen)
- Urlaubs- und Krankheitstage separat erfasst und im Saldo berücksichtigt (Gutschrift = Wochen-Soll ÷ 5 pro Werktag, siehe [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#berechnungsregel-urlaubkrank-absence-credit) für Regel und Grenzen)
- Vorlagen für häufige Überstundengründe
- Datensicherung als JSON-Export mit Wiederherstellung
- Läuft komplett offline. Keine Datenübertragung an Server. Alle Daten bleiben auf dem Gerät.

## Screenshots

### Desktop

**Erfassung**

![Erfassung](screenshots/desktop_erfassen.png)

**Wochenübersicht**

![Woche](screenshots/desktop_woche.png)

**Monatsbericht**

![Monat](screenshots/desktop_monat.png)

**Monatsübersicht aller Arbeitgeber**

![Übersicht](screenshots/desktop_uebersicht.png)

**Einstellungen**

![Einstellungen](screenshots/desktop_einstellungen.png)

### Mobil

Auf iPhone und Android installiert als Home-Screen-App.

| Erfassung | Woche | Monat |
|---|---|---|
| ![](screenshots/mobile_erfassen.png) | ![](screenshots/mobile_woche.png) | ![](screenshots/mobile_monat.png) |

| Übersicht | Einstellungen |
|---|---|
| ![](screenshots/mobile_uebersicht.png) | ![](screenshots/mobile_einstellungen.png) |

## Installation

### iPhone / iPad

1. https://ollies-spielwiese.github.io/Arbeitszeiterfassung/ in Safari öffnen
2. Teilen-Icon unten in der Leiste antippen
3. „Zum Home-Bildschirm" wählen
4. Namen bestätigen, dann „Hinzufügen"

Das App-Icon liegt jetzt auf dem Homebildschirm und öffnet die App im Vollbildmodus. Sie funktioniert auch ohne Internet, sobald sie einmal geladen wurde.

### Android

1. https://ollies-spielwiese.github.io/Arbeitszeiterfassung/ in Chrome öffnen
2. Menü oben rechts (drei Punkte) antippen
3. „Zum Startbildschirm hinzufügen" wählen
4. Bestätigen

### Desktop

Im Chrome oder Edge auf das Installations-Icon in der Adressleiste klicken oder über das Menü „App installieren" wählen.

## Technischer Stack

- Reines HTML, CSS, JavaScript. Keine Frameworks, keine Build-Pipeline.
- Service Worker mit Cache-First-Strategie für Offline-Betrieb.
- Speicherung ausschließlich in `localStorage` des Browsers.
- Feiertagsberechnung nach Gauß'scher Osterformel, keine externen Datenquellen.
- Auto-Update: Beim Deployment einer neuen Version erscheint in der geöffneten App ein Banner „Neue Version verfügbar", das nach einem Klick den Cache leert und die App neu lädt.

## Datenschutz

Keine Server-Kommunikation, keine Analytics, keine Cookies, kein Tracking. Die App verlässt nach dem ersten Laden den Browser nicht. Backups sind manuell als JSON-Datei möglich und werden vom Nutzer selbst gespeichert.

## Für Entwickler

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Datenfluss, State-Layout, Modul-Karte (Ist und Ziel), Kontrakte für Selektoren, Migrationen und Regression
- [CONTRIBUTING.md](CONTRIBUTING.md) — Setup, QA-Ablauf, Version-Bump-Checkliste, CI-Details
- [docs/ROADMAP.md](docs/ROADMAP.md) — Vier-Phasen-Plan (Sicherheitsnetz, Verstehen, Modul-Split, Sauberkeit)
- [docs/CHECKLIST.md](docs/CHECKLIST.md) — Pro-Feature-Checkliste
- [RELEASE.md](RELEASE.md) — Deploy-Kommandos, Versions-Schema und Rollback

## QA — Regression-Sweep

Vor jedem Version-Bump und in CI bei jedem Push auf `main`:

```bash
npm ci
npm run serve &          # lokaler HTTP-Server auf Port 8765
npm run qa               # 51 Checks, ~3 s
```

Umgebungsvariablen:
- `BASE_URL` — Server-URL (Default `http://localhost:8765`)
- `HEADLESS=0` — Browser sichtbar starten (`npm run qa:headed`)

Deckt Selector-Unit-Tests, Migrations-Unit-Tests, Freelance- und Employee-E2E in allen Views sowie PDF/Word/OverviewPDF inhaltlich (Text-Extraktion via pdf-parse und mammoth) ab. Exit-Code 0 = alles grün, 1 = mindestens ein Fehler.

CI läuft automatisch bei Push und PR auf `main`. Pages-Deployment ist gated: rote Regression blockt den Deploy.

## Autor

Oliver Gläser · Frankfurt am Main

## Lizenz

Nutzung frei für nichtkommerzielle Zwecke. Kein Support-Anspruch.
