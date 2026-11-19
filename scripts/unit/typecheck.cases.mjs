// Vergleich mit der gespeicherten Typecheck-Liste (seit v3.15.10). Läuft nur in Node.
import { countMessages, compareCounts, totalOf } from '../typecheck-baseline.mjs';

export async function cases() {
  const out = [], test = (n, v, e) => out.push([n, v, e]);
  const msg = "TS2339: Property 'value' does not exist on type 'HTMLElement'.";
  const base = countMessages([
    `modules/ui/a.js(10,5): error ${msg}`,
    `modules/ui/a.js(20,7): error ${msg}`,
  ]);
  test('TC1 Zählung ohne Zeilennummern', [base, totalOf(base)], [{ 'modules/ui/a.js': { [msg]: 2 } }, 2]);
  const moved = countMessages([`modules/ui/a.js(11,5): error ${msg}`, `modules/ui/a.js(30,7): error ${msg}`]);
  test('TC2 verschobene Zeilen bleiben gleich', compareCounts(moved, base), { added: [], removed: [] });
  const more = countMessages([
    `modules/ui/a.js(10,5): error ${msg}`, `modules/ui/a.js(20,7): error ${msg}`,
    "modules/b.js(3,1): error TS2322: Type 'string' is not assignable to type 'number'.",
  ]);
  test('TC3 neue Meldung wird erkannt', compareCounts(more, base).added,
    [{ file: 'modules/b.js', msg: "TS2322: Type 'string' is not assignable to type 'number'.", count: 1 }]);
  const three = countMessages([1, 2, 3].map(i => `modules/ui/a.js(${i},1): error ${msg}`));
  test('TC4 häufigere Meldung wird erkannt', compareCounts(three, base).added, [{ file: 'modules/ui/a.js', msg, count: 1 }]);
  const fewer = countMessages([`modules/ui/a.js(10,5): error ${msg}`]);
  test('TC5 abgebaute Meldung', compareCounts(fewer, base), { added: [], removed: [{ file: 'modules/ui/a.js', msg, count: 1 }] });
  return out;
}
