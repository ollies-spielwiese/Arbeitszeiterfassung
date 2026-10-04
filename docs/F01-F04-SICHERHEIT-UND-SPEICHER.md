# Arbeitszeit: F01–F04 behoben und Regression erweitert

Stand: 4. Oktober 2026. Änderungspaket v3.9.95 auf Basis von v3.9.94. Nach der erfolgreichen lokalen Korrektur und Regression wurde die Versionsanhebung mit Commit und GitHub-Push ausdrücklich freigegeben. Es wurde keine Vorschau erstellt. F05 bis F22 des Codeprüfberichts gehören nicht zu diesem Paket.

## Änderungen

- **F01: Unsichere Backup-Werte und HTML-Ausgabe.** Das neue Modul `modules/backup-validation.js` prüft importierte Daten vor und nach der Migration. Es kontrolliert Listen und Objekte, relevante Feldtypen, IDs und deren Eindeutigkeit, Beziehungen, Farben, Datums-/Zeitfelder, Einstellungen, Vorlagen, Protokoll, laufenden Timer und Archiv-Snapshots. Prototyp-Steuerschlüssel und unbekannte zukünftige Schema-Versionen werden abgewiesen. Die betroffenen HTML-Attribute in Karten, Auswahllisten, Zeitfeldern und Formularen werden zusätzlich maskiert; Farben werden ausschließlich als Hex-Farbliterale ausgegeben. Normale Sonderzeichen in Namen und Notizen bleiben unverändert als Text erhalten.
- **F02: Alte Zustandsreferenzen nach Import.** Die Ereignisfunktionen in `modules/bootstrap.js` beziehen den aktuellen Zustand über `getState()`. Name, eigene E-Mail, Bundesland, Modus, Arbeitgeberauswahl, Timer-Schutz und Warnungseinstellungen greifen dadurch auch nach einem erneuten Import auf dasselbe aktuelle Zustandsobjekt zu. Der App-Modus wird beim Import unmittelbar in der Oberfläche synchronisiert.
- **F03: Beschädigender Import.** Fehlerhafte Strukturen werden vor der Überschreibbestätigung zurückgewiesen. Die neue Funktion `replaceStateAtomically()` setzt den Kandidaten zunächst nur im Arbeitsspeicher ein und synchronisiert die Oberfläche. Speicheraufrufe während dieser Phase werden unterdrückt. Erst wenn das erfolgreich war, erfolgt ein einzelner dauerhafter Schreibvorgang. Bei Render- oder Schreibfehlern werden die vorherigen Zustandsreferenzen und die Oberfläche wiederhergestellt; die bisher gespeicherten Daten bleiben unangetastet. Im vollständig gesperrten Speichermodus wird ein Import nicht als dauerhaft erfolgreich ausgegeben.
- **F04: Verschluckte Speicherfehler.** Schreibfehler werden aus der Speicherschicht weitergereicht. Die App zeigt einen dauerhaften Warnbereich mit „Backup herunterladen“ und „Speichern wiederholen“. Der Notfall-Download verwendet ausdrücklich den aktuellen Arbeitsspeicher, einschließlich noch ungesicherter Änderungen, und benötigt keinen erfolgreichen Schreibzugriff. Die Warnung verschwindet erst nach einem erfolgreichen Speichern des vollständigen Zustands. Ist der Speicher bereits beim Start voll, bleibt der bisher gespeicherte Bestand lesbar.

## Kompatibilität und Grenzen

- **Ältere Backups:** Fehlende optionale Altfelder werden weiterhin über Defaults und vorhandene Migrationen ergänzt. Die bestehenden Legacy-Importtests bleiben grün. Das bereits vorliegende Nutzerbackup vom 16. September 2026 besteht ebenfalls die neue Strukturvalidierung; es wurde dabei weder verändert noch in die veröffentlichte App importiert.
- **Keine stille Reparatur:** Vorhandene Felder mit falschen Datentypen, unsicheren IDs/Farben oder ungültigen Beziehungen werden mit Feldpfad zurückgewiesen, nicht entfernt oder still umgedeutet. Die ursprüngliche Datei bleibt unverändert.
- **Keine neuen E-Mail-Regeln:** Das bestehende E-Mail-Prüfprofil wurde nicht verändert. Ein strukturell korrektes älteres Backup wird nicht allein wegen einer älteren E-Mail-Schreibweise verworfen; die vorhandenen Eingabe- und Versandprüfungen gelten weiterhin.
- **Keine fachliche Neuberechnung:** Negative Sollzeiten, Abwesenheitskonflikte und andere fachliche Befunde aus F05–F22 sind nicht mitbehoben. Diese Strukturvalidierung ersetzt deren gesonderte Korrektur nicht.
- **Dauerhafter Speicher:** Der Schutz bezieht sich auf erfolgreiches Schreiben in den Browserspeicher, nicht auf eine Garantie gegen spätere Browserbereinigung, Geräteverlust oder das Löschen von Website-Daten. Regelmäßige externe Backups bleiben erforderlich.
- **Keine Servermigration:** Die App bleibt eine lokale Offline-PWA. Neue Bibliotheken, Netzwerkdienste oder zusätzliche Zugriffsrechte wurden nicht eingeführt.

## Integrierte Regressionstests

Die Datei `scripts/backup-safety-tests.mjs` wird vom bestehenden Gesamtlauf `scripts/regression.mjs` aufgerufen. Damit laufen die neuen Tests sowohl unter `npm run qa` als auch unter `npm run qa:webkit` und den entsprechenden CI-Befehlen.

Die erste kleine Gegenprobe gegen den unveränderten Produktcode ergab 12 fehlgeschlagene von 13 Prüfungen. Nach der Korrektur und Erweiterung enthält der neue Testbaustein 102 bestandene Prüfungen je Browser-Engine.

| Prüfung | Abschließendes Ergebnis |
|---|---|
| Chromium-Gesamtregression, Release v3.9.95 | 1.135/1.135 bestanden, 0 Fehler, 38,2 Sekunden |
| WebKit-Gesamtregression, Release v3.9.95 | 1.135/1.135 bestanden, 0 Fehler, 62,9 Sekunden |
| Neue F01–F04-Prüfungen | 102/102 in beiden Engines |
| Bestehende visuelle Regression | 6/6 bestanden, jeweils 0 abweichende Pixel |
| Typecheck | 0 ungefilterte Fehler; unverändert 268 gefilterte DOM-Typmeldungen |
| Whitespace-/Patchprüfung | `git diff --check` ohne Fehler |
| Neuer Warnbereich | Intern bei 1.280 und 375 Pixel Breite kontrolliert; auf 375 Pixel kein horizontaler Seitenüberlauf |
| Release-Konsistenz | App-Konstante, Badge, Paketdateien, Changelog und Cache stimmen auf v3.9.95 überein |
| Offline-Kaltstart, Chromium | Cache `arbeitszeit-v3-9-95`, Badge v3.9.95 und neues Validierungsmodul ohne Netzwerk geladen; keine Pageerrors |

Die neuen Tests verwenden echte Datei-Imports und normale Formularereignisse. Speicherknappheit, Schreibsperre und Renderfehler werden gezielt simuliert, ohne Nutzerdaten oder die veröffentlichte App zu beeinflussen.

### Abgedeckte Fehlerpfade

- **Manipulierte Inhalte:** HTML in Farbe, IDs, Zeitfeldern, Vorlagen und Archivdaten; falsche Feldtypen; Prototyp-Schlüssel; gültiger Sonderzeichentext bleibt Text. Zusätzlich direkte Prüfung der abgesicherten Renderer.
- **Datenintegrität:** Doppelte IDs, ungültiges Datum, unbekannte Arbeitgeberreferenzen, fehlerhafte Listen, defekte Archiv-Snapshots, ungültige Timer, unbekannte Schema-Version und fehlerhaftes Migrationsergebnis.
- **Importverhalten:** Gültiger Import mit Archiv, Überleben des Neuladens, Abbruch durch den Benutzer, fehlgeschlagener Import ohne Speicheränderung und Rücksetzen nach einem simulierten Renderfehler.
- **Zustandsreferenzen:** Einstellungsänderungen nach Import, E-Mail, Bundesland, Warnung, Arbeitgeberauswahl, Moduswechsel sowie Timer-Schutz nach erneutem Import.
- **Speicherprobleme:** Fehler nach erfolgreichem App-Start, unveränderter alter Speicher bei gleichzeitig aktuellem RAM-Zustand, Notfall-Download mit ungesicherten Änderungen, erfolgreicher Wiederholungsversuch, wiederhergestellter Persistenzstatus, Neustart, voller Speicher schon beim Start und vollständig gesperrter Speicherzugriff.

## Technische Hinweise für die weitere Arbeit

- **Importvertrag:** `importBackup()` erwartet nun `commitImport(candidate, onImport)` statt getrennter `setState`-/`saveState`-Aufrufe. Die App verwendet dafür `replaceStateAtomically()`; die beiden vorhandenen isolierten Migrationstests wurden entsprechend angepasst.
- **Speichervertrag:** `modules/state.js:saveState()` gibt Speicherfehler weiter. Der UI-Wrapper in `app.js` fängt sie ab, zeigt den Hinweis und liefert einen Erfolgsstatus. Der Speicherstatus wird über `arbeitszeit-storage-status` an den Warnbereich gemeldet.
- **Offline-Ressourcen:** Das neue Validierungsmodul steht in der Precache-Liste. App-Konstante, Versions-Badge, Paketdateien und Service-Worker-Cache wurden synchron auf v3.9.95 angehoben.
- **Noch offen:** Physischer iPhone-/iPad-Test des neuen Notfall-Downloads und des Warnbereichs. WebKit-Automation ersetzt diesen Gerätetest nicht.

## Freigabestatus

Versionsanhebung auf v3.9.95, Commit und GitHub-Push sind vom Nutzer ausdrücklich freigegeben. Der Release-Stand wurde vor dem Commit erneut vollständig geprüft; die Tabelle enthält diese abschließenden Ergebnisse. Es werden keine Vorschau und keine weiteren Fehlerkorrekturen außerhalb F01–F04 ergänzt.
