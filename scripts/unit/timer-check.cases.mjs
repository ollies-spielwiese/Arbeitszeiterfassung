// Reine Rechenfälle Timer prüfen (v3.15.6), seit v3.15.10 gemeinsam für Node
// (scripts/unit.mjs) und Browser (scripts/timer-check-tests.mjs). load(name) lädt ein Modul aus modules/.
export async function cases(load) {
      const T = await load('timer-check.js');
      const out = [], test = (n, v, e) => out.push([n, v, e]);
      // Zeitangaben als Berliner Uhrzeit (UTC+1 im November), in jeder Zeitzone auf dieselbe
      // Ortszeit abgebildet — so liefern die Fälle auch mit TZ=America/New_York dieselben Uhrzeiten.
      const at = (iso) => { const u = new Date(Date.parse(iso) + 3600e3); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes()); };
      const start = at('2026-11-16T07:00:00.000Z').toISOString(); // Mo 08:00 Ortszeit
      test('Schwelle', [T.needsTimerCheck(start, at('2026-11-16T18:59:00Z')), T.needsTimerCheck(start, at('2026-11-16T19:00:00Z'))], [false, true]);
      const sug = T.suggestTimerEnd({ startISO: start, type: 'work', now: at('2026-11-17T08:00:00Z'), dayTargetMin: 480, breakMode: 'legal' });
      test('Vorschlag Präsenz 25 Std.', T.toTimeInput(sug), '16:30');
      const sugNone = T.suggestTimerEnd({ startISO: start, type: 'work', now: at('2026-11-17T08:00:00Z'), dayTargetMin: 480, breakMode: 'none' });
      test('Vorschlag ohne Pause', T.toTimeInput(sugNone), '16:00');
      const sugWe = T.suggestTimerEnd({ startISO: start, type: 'work', now: at('2026-11-17T08:00:00Z'), dayTargetMin: 0, breakMode: 'legal' });
      test('Vorschlag ohne Soll (8 Std.)', T.toTimeInput(sugWe), '16:30');
      const sugHo = T.suggestTimerEnd({ startISO: start, type: 'homeoffice', now: at('2026-11-17T08:00:00Z'), dayTargetMin: 480 });
      test('Vorschlag Home-Office = jetzt', T.toTimeInput(sugHo), '09:00');
      const v = (end, type = 'work') => T.validateTimerEnd({ startISO: start, type, end, now: at('2026-11-17T08:00:00Z') });
      test('Prüfung', [
        !!v(null), !!v(at('2026-11-16T06:00:00Z')), !!v(at('2026-11-17T09:00:00Z')),
        !!v(at('2026-11-17T07:00:00Z')), v(at('2026-11-17T07:00:00Z'), 'homeoffice'), v(at('2026-11-16T15:30:00Z')),
      ], [true, true, true, true, null, null]);
      test('Ergebnistext', T.describeTimerResult({ startISO: start, type: 'work', end: at('2026-11-16T15:30:00Z'), breakMode: 'legal' }),
        'Ergebnis: Mo, 16.11.2026, 08:00–16:30 = 8:30 Std., Pause 30 Min., netto 8:00 Std.');
      return out;
}
