# Arbeitszeit v3.9.92: WebKit-Klickkorrektur und Regression

Stand: 1. Oktober 2026. Der freigegebene Korrekturvorschlag ist im lokalen
Arbeitsstand übernommen. Es wurde weder committet noch gepusht; ein produktives
Deployment wurde nicht ausgelöst.

## Änderung

- **Erster Klick/Tap:** Blur-bedingte E-Mail-Hinweise werden während einer
  primären Zeigeraktion erst angezeigt, nachdem das Klickziel feststeht.
  Dadurch kann der Button nicht mehr vor Abschluss dieser Betätigung
  durch den neuen Hinweis aus dem Klickbereich verschoben werden.
- **Validierung:** Native Formularregeln, Pflichtfelder, Formatprüfung,
  Fokus auf die fehlerhafte Adresse und Schutz vor Speichern/Teilen bleiben
  erhalten. Tastatur-Blur bleibt unmittelbar.
- **Touch und Abbruch:** Nach pointerup ausgelöste Kompatibilitätsereignisse
  bleiben geschützt. Pointercancel, Loslassen ohne Click und Window-Blur
  holen ausstehende Hinweise nach. Ein Generationenzähler schützt neuere Gesten
  vor einem älteren Cleanup.
- **Darstellung und Daten:** Keine Layout-/CSS-Änderungen, keine leeren
  Reserveflächen, keine Datenmigration und kein Fokus-Timer.
- **Version:** APP_VERSION, Badge, Paketversion, Lockdatei und Service-Worker-
  Cache sind lokal auf v3.9.92 synchronisiert; Changelog ergänzt.

Die Vergleichsvorschau war nur der Prototyp. Vorschau-Umschalter, Beispieldaten,
Launcher und Vorschau-Sonderbehandlung für Speicher/Service Worker wurden
nicht in die App übernommen.

## Vollständige lokale Prüfungen

| Prüfung | Ergebnis |
|---|---|
| Chromium, `npm run qa` | **806/806 bestanden**, 0 Fehler; 17,0 Sekunden |
| WebKit, `npm run qa:webkit` | **806/806 bestanden**, 0 Fehler; 23,6 Sekunden |
| Bestehende E-Mail-Prüfungen | 82 je Engine, in den Gesamtläufen enthalten |
| Neue Pointer-/Bedienprüfungen | 78 je Engine, in den Gesamtläufen enthalten |
| Visuelle Regression, `npm run visual:test` | **6/6 bestanden**, jeweils 0 abweichende Pixel |
| Typprüfung, `npm run typecheck` | **0 echte Fehler**, 268 DOM-bezogene Meldungen durch bestehenden Projektfilter ausgefiltert |
| `git diff --check` | Keine Whitespace-Fehler |
| Zusätzlicher Offline-Smoke-Test, Chromium | Neuer Cache und korrigiertes Modul nachgewiesen; Offline-Neustart, Versionsbadge, Altwertschutz und erster Speichern-Klick bestanden |
| Zusätzliche Sichtprüfung | Tatsächliches Kontaktformular mit Fehler/Fokus bei Desktopbreite und 390 px geprüft; kein horizontaler Seitenüberlauf |

Die vollständigen Läufe umfassen auch die bestehenden Berechnungs-, Migrations-,
Backup-, Formular-, Teilen- und Exportprüfungen einschließlich PDF-, Word- und
CSV-Inhalten sowie CDN-Subresource-Integrity. Es wurden keine Tests übersprungen,
keine Fehler weggefiltert und keine visuellen Referenzbilder neu erzeugt.
Der schon vorher vorhandene DOM-Typfilter bleibt unverändert.

### Neue dauerhafte Regression

`scripts/email-pointer-tests.mjs` ist in den regulären Runner eingebunden.
Geprüft werden Arbeitgeber, Kunden und beide Teilen-Dialoge jeweils mit
Desktop-Viewport, schmalem Viewport und Touch-Emulation. Jede Betätigung muss
den Button genau einmal erreichen, die Adresse als ungültig markieren und
fokussieren; Speichern bzw. Export bleiben gesperrt.

Weitere Prüfungen betreffen längeres Gedrückthalten ohne Layoutverschiebung,
Tab, Enter, Pointercancel, Pointerup ohne Click und Window-Blur. Die Tests
verwenden das echte App-Modul, keine Vorschau und keine Modul-Ersetzung.
Die vorhandenen Teilen-Tests klicken jetzt direkt aus dem Eingabefeld, ohne
den Fehler vorher durch künstliches Blur sichtbar zu machen.

### WebKit-Testumgebung

Der früher am CDN-Laden gescheiterte lokale Gesamtlauf war durch eine fehlende
GIO/TLS-Komponente der Sandbox blockiert. Für diesen Lauf wurde glib-networking
als private Laufzeitabhängigkeit ergänzt und über GIO_EXTRA_MODULES eingebunden.
Es wurden keine TLS-/SRI-Prüfungen deaktiviert und keine CDN-Antworten gemockt.
Danach lief die vollständige Suite mit dem unveränderten Testkommando für
WebKit und ergänzten Umgebungsvariablen erfolgreich durch.

## Grenzen und offene Schritte

- **Echtes iPhone/iPad:** Noch ausstehend. WebKit und Touch-Emulation ersetzen
  nicht den Test mit Bildschirmtastatur und installierter PWA auf dem Gerät.
- **GitHub-CI:** Für diesen Arbeitsstand noch nicht gestartet, da nicht
  gepusht wurde. Die lokalen grünen Ergebnisse sind keine neue CI-Freigabe.
- **Lighthouse/CodeQL:** In diesem lokalen Durchgang nicht erneut ausgeführt;
  keine Übertragung alter Ergebnisse auf diesen Stand.
- **Bekannter unabhängiger Altfehler:** Das versteckte Beschäftigungsgrad-Feld
  mit Default 100 bei max=99 bleibt außerhalb dieses Änderungspakets.
  Die E-Mail-Formulartests verwenden dort weiterhin den gültigen Wert 60.
- **Update-Banner auf iOS:** Die ausstehende Geräteprüfung bei einem echten
  Versionswechsel ist durch diesen lokalen Test nicht erledigt.
- **Veröffentlichung:** Commit und Push benötigen eine separate Freigabe.

Die sechs vorhandenen visuellen Baselines, die produktiven Speicherpfade,
das Datenmodell und die Update-Logik wurden nicht geändert. Am Service Worker
wurde ausschließlich die Cache-Version erhöht.
