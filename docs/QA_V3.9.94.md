# Arbeitszeit v3.9.94: E-Mail-Prüfprofil und WebKit-Gesamtlauf

Stand: 4. Oktober 2026, lokaler Teststand vor Commit und Push.
Das freigegebene Prüfprofil ist integriert. Der Fehler im WebKit-Gesamtlauf
ist reproduziert, ursächlich eingegrenzt und korrigiert; die Ergebnisse
beziehen sich auf das Repository, nicht auf einen isolierten Vorschau-Runner.

## Übernommene Änderungen

- **E-Mail-Prüfung:** Gemeinsames ASCII-Prüfprofil mit getrennten Regeln
  vor und nach dem @; Punktregeln, erlaubte Zeichen, Domainteile und
  Längengrenzen werden explizit geprüft.
- **Rückmeldungen:** Konkreter Fehlergrund auch für manuelle Empfängerlisten
  und ausgewählte gespeicherte Kontakte. Sonderformen werden als nicht
  unterstützt erklärt, statt ihre grundsätzliche Gültigkeit zu bestreiten.
- **Direkte Exporte:** Prüfung des unveränderten Eingabewerts vor dem
  Trimmen; CR/LF und weitere Steuerzeichen können so nicht verschwinden.
- **Unverändert:** Datenmodell, gespeicherte Altwerte, Layout, Berechnungen,
  Pointer-/Blur-Korrektur aus v3.9.92 und Formularfix aus v3.9.93.
- **Versionierung:** App-Badge, Konstanten, Changelog, Paketmetadaten und
  Service-Worker-Cache sind lokal auf v3.9.94 gesetzt.

Das genaue Profil einschließlich Standardsbezug und bewusst nicht
unterstützter Sonderformen steht in `docs/EMAIL_VALIDATION.md`.
Es bleibt eine lokale Formatprüfung ohne DNS-, Postfach- oder Zustellprüfung.

## Ursache des WebKit-Fehlers

Der vollständige Lauf wurde durch einen fälschlich eingeblendeten
„Neue Version verfügbar“-Banner blockiert. Die bisherige Erkennung
interpretierte `installing.state === 'installed'` zusammen mit einem
vorhandenen `navigator.serviceWorker.controller` als Update einer alten Version.

Bei einer frischen WebKit-Installation wurde jedoch zeitweise bereits
derselbe gerade installierte Worker als `controller` gemeldet.
Ein älterer aktiver Worker existierte zu diesem Zeitpunkt nicht.
Die beobachtete Reihenfolge in einem instrumentierten Fehlversuch war:

| Zeitpunkt ab Seitenstart | Beobachtung |
|---|---|
| 516 ms | Registrierung: Worker 1 wird installiert; Controller, Active und Waiting noch leer |
| 986 ms | Worker 1 meldet `installed`; Controller und Waiting sind ebenfalls Worker 1, Active bleibt leer |
| 987 ms | Update-Banner wird sichtbar, obwohl es eine Erstinstallation ist |
| 987–989 ms | Derselbe Worker aktiviert sich, Controllerchange und Activated folgen |

Das zusätzliche Logging kann das Timing beeinflussen; entscheidend ist
die nachgewiesene Identität von Controller und installiertem Worker.
Der falsche Banner fing nachfolgende Formular-Klicks ab. Je nach Timing
zeigte sich der Fehler daher an verschiedenen Stellen des Gesamtlaufs.

### Minimale Korrektur

Ein Banner wird nur für einen tatsächlich wartenden Worker angezeigt,
der sich vom aktuellen Controller unterscheidet. Das gilt sowohl für
einen beim Start bereits wartenden Worker als auch für `updatefound`.
Damit wird Erstinstallation von einem echten Update unterschieden.

„Später“, SKIP_WAITING, explizite Nutzeraktivierung, Controllerchange,
Aktivierungs-Polling und der vorhandene Reload-Fallback bleiben erhalten.
Es wurden weder der Banner pauschal deaktiviert noch Service Worker im
Hauptlauf blockiert oder Konsolenfehler herausgefiltert.

## Dauerhafte Testintegration

- **83 neue E-Mail-Prüfungen je Engine:** Zeichen, Punkte, Domains,
  64/65-, 63/64- und 254/255-Grenzen, Sonderformen, Steuerzeichen,
  Altwertschutz, erster Speichern-Klick, beide Teilen-Dialoge und direkte Exporte.
- **46 neue Lifecycle-Prüfungen je Engine:** Normale Erstinstallation,
  früher gleichidentischer Controller, bereits wartender gleicher Worker,
  echte vorhandene/neue Updates, nicht wartender Worker, „Später“ sowie
  Aktivierung mit Controllerchange und ausschließlich per Polling.
- **Testtechnik:** Die Lifecycle-Tests importieren das echte Update-Modul
  in isolierte Testseiten mit deterministischen Worker-Testobjekten und
  prüfen auch echte Seitenneuladungen. Sie ergänzen die realen
  Service-Worker-Starts im Hauptlauf, ersetzen sie aber nicht.

Beide neuen Module sind in `scripts/regression.mjs` eingebunden.
904 bisherige plus 83 E-Mail- plus 46 Lifecycle-Prüfungen ergeben
1.033 Prüfungen je Engine.

## Lokale Ergebnisse

| Prüfung | Ergebnis |
|---|---|
| Chromium, `npm run qa` | 1.033/1.033 bestanden, 0 Fehler; 33,9 Sekunden |
| WebKit, vollständiger Runner | 1.033/1.033 bestanden, 0 Fehler; 53,4 Sekunden |
| WebKit, unabhängiger Wiederholungslauf | 1.033/1.033 bestanden, 0 Fehler; 42,1 Sekunden |
| Typecheck | 0 echte Fehler; 268 bereits bestehende DOM-Meldungen gefiltert |
| Visuelle Regression | 6/6 Snapshots bestanden; jeweils 0 abweichende Pixel |
| Offline-Smoke, Chromium | Bestanden: echter SW-Kaltstart, Cache v3.9.94, Offline-Neustart, Altwertschutz, erster Speichern-Klick, gültige Sonderzeichen und Persistenz in beiden Modi mit Default100; keine Pageerrors |
| Getrennte interaktive Vorschau | 36/36 Prüfungen in Chromium/WebKit bei 1280 und 390 Pixeln Breite; Screenshots geprüft |
| Patch-Prüfung | `git diff --check` ohne Fehler |

WebKit läuft lokal mit den für die Sandbox bereitgestellten
Runtime-Bibliotheken und Sandbox-Anpassungen. Im Regressionsrunner
wurden für diesen Teststand keine Service-Worker-Ausnahmen hinzugefügt.
Die vorhandenen isolierten Pointer-/Formulartests bleiben unverändert.

## Abgrenzung und offene Freigaben

Der frühere isolierte Versuch mit blockierten Service Workern erzeugte
zusätzliche Mock-Fehler (`reg.scope` bei undefinierter Registrierung).
Dieser Versuch ist kein bestandener Gesamtlauf und nicht die Grundlage
der hier genannten Ergebnisse. Die endgültigen vollständigen Läufe
nutzen den regulären Runner und bestehen ohne diese Umgehung.

Dieser Stand ist noch nicht committet, gepusht oder auf GitHub Pages
veröffentlicht. Ein GitHub-CI-Lauf für v3.9.94 steht entsprechend noch aus.
Die praktische Prüfung auf einem realen iPhone/iPad, insbesondere beim
Update einer installierten PWA, bleibt zusätzlich offen; Engine- und
Touch-Emulation ersetzen sie nicht.
