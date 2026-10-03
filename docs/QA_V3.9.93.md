# Arbeitszeit v3.9.93: Formularprüfung und Regression

Stand: 3. Oktober 2026, lokale Prüfung vor Commit und Push.
Die freigegebene Korrektur des Formularfehlers „Default 100 bei Maximum 99“
ist integriert. Dieser Bericht dokumentiert den getesteten Quellcode-Stand;
spätere CI- und Deployment-Ergebnisse sind separat zu prüfen.

## Änderung

- **Vollzeit:** Das ausgeblendete Prozentfeld ist deaktiviert und blockiert
  die native Formularprüfung nicht mehr. Der gespeicherte Wert bleibt erhalten.
- **Teilzeit:** Das sichtbare Prozentfeld wird wieder aktiviert; ganze Werte
  von 1 bis 99 bleiben vorgeschrieben. Ein vorhandener Wert 100 muss bewusst
  korrigiert werden, nicht automatisch auf 60 oder 99.
- **Minijob/Midijob:** Ausgeblendete Prozent- und Referenzfelder sind deaktiviert.
- **Kunden:** Das gesamte ausgeblendete Arbeitszeitmodell-Fieldset ist beim
  Öffnen deaktiviert, auch bei importierten Teilzeit-/Referenzwerten.
- **Wiederöffnung als Arbeitgeber:** Das Fieldset und die jeweils relevanten
  Einzelwerte werden wieder aktiviert.
- **Unverändert:** Speicherlogik, Datenmodell, Migrationen, HTML-Grenzen,
  Stundenberechnung und Layout. Die vorhandene Teilzeit-Stundenkopplung bleibt.

Der funktionale App-Patch umfasst elf zusätzliche Zeilen in
`modules/ui/employer-modal.js`, einschließlich Kommentaren und Typannotationen.
Vorschau-Launcher, Beispieldaten und Demo-Speicher-/Service-Worker-Ausnahmen
wurden nicht in das Repository übernommen.

## Dauerhafte Testintegration

`scripts/employment-form-validation-tests.mjs` läuft im vorhandenen
Regressionsrunner und damit auch in der bestehenden Chromium-/WebKit-CI.
Es ergänzt 98 Prüfungen je Engine: Desktop und Touch, echte Speichern-Klicks,
Neuanlage/Bearbeiten, Beschäftigungsart-/Moduswechsel, Grenzen/Schrittweite,
Referenzfelder, Altwerte sowie Pflichtname und E-Mail-Prüfung.

Die bisherigen Prozent60-Workarounds wurden aus
`scripts/email-validation-tests.mjs` und `scripts/email-pointer-tests.mjs`
entfernt. Diese Prüfungen laufen jetzt mit dem unveränderten Originaldefault100.
Es werden keine nativen Regeln oder Tests deaktiviert, um den Lauf zu bestehen.

## Vollständige lokale Ergebnisse

| Prüfung | Ergebnis |
|---|---|
| Chromium, `npm run qa` | **904/904 bestanden**, 0 Fehler; 30,3 Sekunden |
| WebKit, `npm run qa:webkit` | **904/904 bestanden**, 0 Fehler; 47,1 Sekunden |
| Davon neue Formularprüfungen | **98 je Engine**, im Gesamtergebnis enthalten |
| Visuelle Regression, `npm run visual:test` | **6/6 bestanden**, jeweils 0 abweichende Pixel |
| Typprüfung, `npm run typecheck` | **0 echte Fehler**, unverändert 268 durch den bestehenden DOM-Filter ausgefilterte Meldungen |
| Syntaxprüfung des neuen Testmoduls | `node --check` erfolgreich |
| Diff-Prüfung | `git diff --check` ohne Fehler |
| Zusätzlicher Offline-Smoke-Test, Chromium | Bestanden: neuer Cache mit Korrektur, Offline-Neustart, Arbeitgeber und Kunde mit Originaldefault100 speichern, Daten nach Offline-Reload erhalten |

Die Gesamtläufe enthalten auch die vorhandenen Berechnungs-, Migrations-,
Backup-, Teilen- und Exportprüfungen einschließlich PDF-/Word-/CSV-Inhalten
sowie CDN-SRI. Es wurden weder Tests übersprungen noch Referenzbilder geändert.

WebKit nutzt in dieser Sandbox die bereits ergänzten privaten Laufzeitbibliotheken
und GIO_EXTRA_MODULES für TLS. CDN- und Integritätsprüfungen laufen regulär,
ohne gemockte Antworten oder deaktivierte Zertifikatsprüfung.

## Versionierung und Grenzen

APP_VERSION, Paketversion, Lockdatei, Versionsbadge und Service-Worker-Cache
sind synchron auf v3.9.93 angehoben; der Changelog enthält den Fix.
Die Freigabe des Nutzers umfasst Übernahme, Tests, Commit und Push.

Die Geräteprüfungen des Update-Buttons und der E-Mail-Klickkorrektur auf einem
echten iPhone/iPad bleiben offen. Touch-Emulation und WebKit ersetzen diese
nicht. GitHub-CI, Lighthouse und Deployment werden erst nach dem Push bewertet.
