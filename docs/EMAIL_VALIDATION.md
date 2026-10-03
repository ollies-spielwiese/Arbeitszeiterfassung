# E-Mail-Prüfung

Ab v3.9.91 verwenden Einstellungen, Arbeitgeber-/Kundenkontakte und beide
Teilen-Dialoge dieselbe lokale Formatprüfung. Es gibt keine Netzwerkanfrage,
Postfachprüfung, Bestätigungsmail oder automatische Tippfehlerkorrektur.

## Eingabe und Speicherung

- Optionale Einzelfelder dürfen leer sein. Äußere Leerzeichen werden bei
  erfolgreicher Übernahme entfernt; Groß-/Kleinschreibung bleibt unverändert.
- Fehler erscheinen nach Verlassen des Feldes sowie beim Speichern bzw. Teilen.
  Nach einem Fehler wird der Hinweis beim Korrigieren aktualisiert.
- Eigene Adresse: Bei ungültiger Eingabe bleibt der gespeicherte Wert erhalten.
  Eine gültige Änderung wird wie bisher beim change-Ereignis gespeichert.
- Ansprechpartner: Ungültige Adressen verhindern das Speichern des Formulars.
  Der Fokus geht zum ersten fehlerhaften E-Mail-Feld. Die übrigen nativen
  Formularregeln bleiben unverändert.
- Beim erneuten Öffnen werden die Hinweise anhand der geladenen Werte erneuert.

## Teilen

- Weitere Adressen durch Komma oder Semikolon trennen. Leerzeichen alleine sind
  keine Trenner; so wird eine beschädigte Adresse nicht still in mehrere zerlegt.
- Jede eingegebene und jede ausgewählte gespeicherte Adresse wird geprüft,
  bevor Datei-Erstellung, Download oder Mailto-Übergabe beginnen.
- Fehlerhafte gespeicherte Adressen bleiben erhalten. Die betroffene Karte zeigt,
  ob sie in den Einstellungen oder beim Arbeitgeber/Kunden korrigiert werden muss.
- Nicht ausgewählte fehlerhafte Kontakte blockieren nicht.
- „Nur teilen“ leert wie bisher die E-Mail-Auswahl und verwendet ohne
  E-Mail-Prüfung den bestehenden System-Share-/Download-Pfad.
- Identische, getrimmte Adressen werden wie bisher dedupliziert, jedoch nicht
  pauschal kleingeschrieben.
- Auch der direkte shareReport-Aufruf prüft explizit übergebene Empfänger.

## Technischer Umfang

`modules/ui/email-validation.js` enthält Prüfer, Listenzerlegung und Feldhinweise.
Die generische Syntaxprüfung verwendet ein natives HTML-E-Mail-Feld statt einer
eigenen restriktiven Regex; ergänzend gibt es konkrete Meldungen für häufige
Eingabefehler. Die Browser-Regeln erlauben auch Domains ohne Punkt
(z. B. `name@intranet`). Internationale Adress-Sonderformen unterliegen den
Grenzen der nativen Browserprüfung.

Fehlermeldungen werden ausschließlich über textContent ausgegeben. Sie sind
über aria-describedby mit dem Feld verbunden; aria-invalid und aria-live
ergänzen den sichtbaren Hinweis. Kein Datenmodellwechsel und keine Migration:
Altwerte werden weder beim Laden noch beim Backup-Import bereinigt.
Das neue Modul steht im Service-Worker-Precache.

## Regression

### Erster Klick und Touch ab v3.9.92

Eine beim Blur eingeblendete Fehlermeldung konnte den Button zwischen
pointerdown und pointerup verschieben. WebKit traf dann beim Loslassen nicht
mehr den Button; der nachgelagerte Fokus-Code wurde gar nicht ausgeführt.

Das gemeinsame Feldmodul stellt ausschließlich Blur-Hinweise während einer
primären Zeigeraktion zurück. Im Click-Capture wird der Hinweis angezeigt,
nachdem das Klickziel feststeht und bevor die vorhandene Formularprüfung
weiterläuft. Tastatur-Blur bleibt unmittelbar, native Regeln und Fokuslogik
bleiben unverändert. Es gibt weder reservierte Leerflächen noch Fokus-Timer.

Pointerup/Pointercancel ohne Click holen ausstehende Hinweise im nächsten
Task nach; Window-Blur erledigt das sofort. Die aktive Geste bleibt bis
Click bzw. Cleanup erhalten, damit Touch-Kompatibilitätsereignisse nach
pointerup ebenfalls geschützt sind. Eine Generationsnummer verhindert, dass
ein älterer Cleanup eine neuere Geste beendet. Nicht mehr sichtbare oder
entfernte Felder werden beim Nachholen ausgelassen.

`scripts/email-pointer-tests.mjs` prüft die reale App ohne Vorschau-Code oder
Modulersetzung: Arbeitgeber, Kunden und beide Teilen-Dialoge bei Desktopbreite,
schmalem Viewport und Touch-Emulation; außerdem längeres Gedrückthalten,
Tab, Enter, Pointercancel, Pointerup ohne Click und Window-Blur.
Der Runner führt diese Tests in Chromium und WebKit aus. Reale iPhone-/iPad-
Tests ergänzen die Engine-/Touch-Emulation, werden durch sie aber nicht ersetzt.

### Bestehende Format- und Ablaufprüfungen

`scripts/email-validation-tests.mjs` ist in `npm run qa` eingebunden und läuft
damit auch über die vorhandene WebKit-CI. Die Tests behandeln Formatregeln,
optionale Felder, Persistenzschutz, Feldfokus, Arbeitgeber/Kunden, beide
Teilen-Dialoge, Altadressen, HTML-Escaping, Korrektur/Abwahl, Mehrfachadressen,
System-Share, wiederholte iOS-Stage2-Zyklen und den direkten Exportaufruf.
E-Mail-Übergaben werden nicht real versendet; Share-Nebeneffekte werden isoliert.

### Separater Formularfehler: behoben ab v3.9.93

Bereits v3.9.90 belegt bei Neuanlage das ausgeblendete Beschäftigungsgrad-Feld mit
100, während das HTML max=99 vorgibt. Dieses Feld wurde beim Ausblenden nicht
deaktiviert. Dadurch konnte die native Browserprüfung Speichern verhindern
(„An invalid form control … is not focusable“).

Die separate Korrektur in v3.9.93 deaktiviert ausgeblendete Prozent-/Referenzfelder
und bei Kunden das gesamte ausgeblendete Arbeitszeitmodell-Fieldset.
Beim Einblenden bzw. Öffnen als Arbeitgeber werden die passenden Felder wieder
aktiviert. Werte, Sollstunden und Speicherlogik bleiben unverändert.
Teilzeit100 wird sichtbar beanstandet, nicht automatisch auf 60 oder 99 gesetzt.

Die E-Mail- und Pointertests verwenden nun den unveränderten Default100;
die bisherigen Prozent60-Workarounds wurden entfernt. Zusätzlich läuft
`scripts/employment-form-validation-tests.mjs` mit 98 Prüfungen pro Engine im
regulären Runner: echte Desktop-Klicks und Touch-Taps, Neuanlage/Bearbeiten,
Beschäftigungsart-/Moduswechsel, Grenzen/Schrittweite, Referenzfelder,
Importwerte, Pflichtname und E-Mail-Validierung.
