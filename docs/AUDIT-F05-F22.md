# Arbeitszeit: Korrekturen F05–F22

Releasepaket v3.9.96 vom 6. Oktober 2026 auf Basis von v3.9.95. Dieses Paket enthält die Korrekturen der 18 nummerierten Restbefunde aus der Codeprüfung. Versions- und Cachekennung wurden gemeinsam angehoben; der zusätzliche CI-Berechtigungscommit bleibt erhalten.

## Rechen- und Datenregeln

- **Kalendertage:** Home-Office wird mit lokalen Kalendertagsgrenzen zerlegt. `24:00` ist ausschließlich als Ende eines Home-Office-Segments erlaubt, niemals als Beginn. Das Formular bildet diese Grenze mit einem eigenen Schalter ab; die HTML-Zeiteingabe selbst zeigt dafür deaktiviert `00:00`.
- **Zeitumstellung:** Die Zerlegung erzeugt keine zusätzlichen Kalendertage. Wie manuelle Einträge bleiben Segmente lokale Uhrzeitintervalle, keine UTC-Dauern. Eine reale Schicht unmittelbar über die zurückgestellte oder übersprungene Stunde ist damit weiterhin kein sekundengenauer Laufzeitnachweis.
- **Tages-Soll:** Wochenmodelle verwenden das vorhandene individuelle Schema. Monats- und Jahresmodelle verwenden Monatsstunden × 60 / Anzahl aller Montag-bis-Freitag-Daten des Kalendermonats. Feiertage, freie Tage und Daten außerhalb der Beschäftigung erhalten Soll 0. Wochenwerte und Abwesenheitsgutschriften verwenden dieselben Tageswerte; Summen werden auf Minuten gerundet.
- **Stichtag:** Der aktuelle Gleitzeitsaldo und die rollierende Warnung berücksichtigen keine späteren Einträge oder Solltage. Der Vorjahresvortrag bleibt erhalten. Beschäftigungsbeginn und -ende begrenzen Soll und berücksichtigte Einträge; vorhandene Datensätze werden dabei nicht gelöscht.
- **Standardplan:** Neue 40-Stunden-Standardschemata enthalten fünf Netto-Arbeitstage zu acht Stunden; die Pause verlängert die Anwesenheitszeit. Bestehende gespeicherte individuelle Schemata bleiben unverändert. Ein fehlendes Schema verwendet weiterhin den berechneten Standard.
- **Exklusive Abwesenheit:** Urlaub, Krankheit, freier Tag und Überstundenabbau dürfen beim Speichern nicht mit einem anderen Eintrag desselben Arbeitgebers und Datums zusammentreffen. Mehrere Arbeitsblöcke bleiben zulässig. Bei einem Konflikt am Timerende wird kein Teil gespeichert und der Timer bleibt erhalten.
- **Archiv:** Arbeitgeber und Einträge werden tief kopiert. Die Wiederherstellung eines alten Archivs verwendet dessen eingefrorene Summen und vorhandene Einträge, nicht die heutigen Einstellungen. Ein bei alten Archiven unbekannter Resturlaub wird nicht erfunden. Home-Office bleibt im Export absichtlich ein Tagesnachweis; private Block-Uhrzeiten werden nicht offengelegt.
- **Berichtstyp:** Wie die Monatsansicht bestimmen hinterlegte Sollstunden den Einzelberichtstyp. PDF, Word, CSV und E-Mail-Zusammenfassung folgen dieser Entscheidung statt dem gerade ausgewählten globalen App-Modus.
- **Tage in der Übersicht:** Eindeutige Datumswerte aus Präsenz und Home-Office je Arbeitgeber. Die Gesamtzeile addiert Arbeitgeber-Tage; Arbeit für zwei Arbeitgeber am selben Datum bleibt dort zweimal gezählt.
- **Offline-Installation:** Lokales HTML, JavaScript, CSS und Manifest sind Pflicht. Optionale Bilder und externe Exportbibliotheken dürfen fehlen; Exporte können dann bis zum erfolgreichen Nachladen eingeschränkt sein. Die Aktivierung entfernt ausschließlich ältere Caches mit dem Präfix `arbeitszeit-`.

## Befunde und Absicherung

| Befund | Korrektur | Dauerhafter Regressionstest |
|---|---|---|
| F05 | Exklusive Mitternachtsgrenze und lokale Kalendertagsschritte | Normalfall, Sommer-/Winterzeit, Jahreswechsel, Backup-Grenzwerte, Eingabe/Bearbeitung und schmaler Dialog |
| F06 | Stichtagsgenaue gemeinsame Berechnung | Zukunftsurlaub, freier Tag, Januarvortrag und Beschäftigungsende |
| F07 | Rollierendes Fenster innerhalb der Beschäftigung | Eintrittsmonat, Mindesttage, freie Tage, Zukunftsurlaub und Ende |
| F08 | Gemeinsame symmetrische Konfliktprüfung | Alle Abwesenheitstypen, Selbstbearbeitung, fremder Arbeitgeber, Formular, Home-Office, Timerstart und atomarer Timerabbruch |
| F09 | Aktive Wochenendtage erhalten Tagesgutschrift | Aktiver und deaktivierter Samstag |
| F10 | Gemeinsame Tageswerte für Tracker, Woche und Monat | Hessen Mai: 8.229 Minuten Soll, 457 Minuten Gutschrift; Rundungsgrenze |
| F11 | Pausen zusätzlich zur Netto-Sollzeit im Standardplan | 20-, 40- und 50-Stunden-Woche |
| F12 | Formular lehnt überlange Pause ab; Berechnung niemals negativ | Rechenfunktion und tatsächlicher Speicherversuch |
| F13 | Vollständige Archiv-Rekonstruktion und tiefe Kopie | Altes Snapshot-Format, unverändertes Archiv nach Live-Änderung, echte Word-/PDF-Downloads |
| F14 | PDF übernimmt denselben aktuellen Saldo wie die App | Ausgelesener PDF-Text: −80:00 statt Jahresendwert |
| F15 | Gemeinsamer Berichtstyp | Gemischter Modus in Bildschirm, PDF, Word und CSV; bestehende Exporttests |
| F16 | Eindeutige Arbeitstage einschließlich Home-Office | Mehrere Präsenzblöcke am selben Tag und reiner Home-Office-Tag |
| F17 | Inaktive Felder sind deaktiviert | Ungültige Pause und Wochenstunden ausblenden, Rückwechsel und tatsächliches Speichern |
| F18 | Leeres Vorlagenarray bleibt leer | Speichern und echter Seiten-Neustart |
| F19 | Fehlgeschlagenes Script und Promise entfernen | CDN-Fehler, Entfernen des Script-Tags, erfolgreicher erneuter Word-Bibliotheksabruf |
| F20 | Installation ohne vollständigen Kern schlägt fehl | Ausfall verschiedener Kernassets, kompletter Netzausfall, erlaubte optionale Ausfälle |
| F21 | Cachebereinigung auf eigene Namen begrenzt | Fremder Cache bleibt erhalten, eigener alter Cache wird gelöscht |
| F22 | Compiler-Prozessfehler führen zu Exit 1 | ENOENT, Signal, Exit 1, Exit 2 ohne Diagnostik, echter Typfehler, erlaubter DOM-Filter, Erfolg |

Die neuen Prüfungen liegen in `scripts/audit-regression-tests.mjs` und werden vom bestehenden Gesamtlauf aufgerufen. Ein veralteter Export-Testdatensatz wurde von dem nicht mehr verwendeten `targetHours` auf `hoursMode: 'month', monthlyHours: 160` umgestellt; seine inhaltlichen Export-Erwartungen bleiben bestehen.

## Lokale Prüfergebnisse

| Prüfung | Ergebnis |
|---|---|
| Chromium-Gesamtlauf | 1.246/1.246 bestanden |
| WebKit-Gesamtlauf | 1.246/1.246 bestanden |
| Neu integrierte Audit-Prüfungen | 111 pro Browserlauf |
| Bestehende visuelle Regression | 6/6, jeweils 0 abweichende Pixel |
| Home-Office-Dialog | Zusätzlich bei 1.280 und 375 Pixeln visuell geprüft |
| Typecheck | 0 ungefilterte Fehler; 277 bekannte DOM-Typmeldungen gefiltert |
| Whitespace-Prüfung | `git diff --check` ohne Befund |

Die Tests verwenden isolierte Browserdaten und kontrollierte Fehler-Injektion. Service-Worker-Kernfehler und Compiler-Abstürze werden am tatsächlichen Quellcode in isolierten Testumgebungen simuliert; bestehende Browser-Lifecycle-Tests laufen zusätzlich mit. WebKit auf Linux ist kein Test auf einem physischen iPhone oder iPad.

## Release- und Prüfgrenzen

- **Releaseumfang:** Version v3.9.96 umfasst die hier dokumentierten Korrekturen und Tests. Persönliche Backups und private Prüfdaten sind nicht Bestandteil des Repositorys.
- **Backup-Kompatibilität:** Neu erzeugte Home-Office-Segmente mit Ende `24:00` können von der strengeren Backup-Prüfung der unveränderten v3.9.95 noch abgewiesen werden. Ein Downgrade auf diese alte Anwendung ist für solche Backups nicht unterstützt.
- **Bestandsdaten:** Bereits gespeicherte Konflikte, falsche individuelle Wochenpläne oder historisch fehlerhafte Archiv-Summen werden nicht still nachträglich umgeschrieben. Die Korrekturen schützen neue Speichervorgänge und die jeweiligen Berechnungswege.
- **Restliche Audit-Themen:** Die separat aufgelisteten ungenutzten Deklarationen, Asset-Kandidaten, umfassendere Dokumentationsbereinigung und weiteren Härtungspunkte sind nicht pauschal miterledigt. Die Minuten-Rundung `0:60` wurde wegen der neuen gebrochenen Tageswerte mitkorrigiert.
- **Geräteprüfung:** Update-Übernahme und Datenerhalt in der installierten PWA auf echten iPhones/iPads bleiben gesondert zu prüfen. Ergänzende Backup-Rundlauftests in emulierten Geräteprofilen ersetzen keinen Test auf physischer Hardware.
