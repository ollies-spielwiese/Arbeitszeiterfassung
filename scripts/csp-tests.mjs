/**
 * scripts/csp-tests.mjs — CSP Stufe 1 (seit v3.15.9).
 *
 * CSP2 Richtlinie in index.html und diag.html entspricht der erwarteten Fassung.
 * CSP3 Quelltext ohne style-Attribute, Inline-Ereignisse und Inline-Skripte.
 * CSP4 Bibliotheksversionen in Lader, Service Worker und CSP stimmen überein.
 * CSP5 Alle Exporte und die Diagnose-Seite laufen ohne Verstoß (echte Bibliotheken).
 * CSP6 Rahmen-Schutz: fremder Rahmen zeigt nur den Hinweis, eigener Rahmen die App.
 * CSP7 Farben an Einträgen und Arbeitgebern kommen über element.style an.
 * CSP-Wächter: installCspGuard() meldet jeden securitypolicyviolation-Fall aller Seiten.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

export const LIB_URLS = [
  'https://unpkg.com/docx@8.5.0/build/index.umd.js',
  'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
];
export const EXPECTED_CSP_INDEX = "default-src 'self'; script-src 'self' " + LIB_URLS.join(' ')
  + "; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'";
export const EXPECTED_CSP_DIAG = "default-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'";

const GUARD_SCRIPT = `document.addEventListener('securitypolicyviolation', (e) => {
  console.error('[CSP-VERSTOSS] ' + e.effectiveDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sourceFile || '') + ':' + (e.lineNumber || 0));
}, true);`;

/**
 * Hängt den CSP-Wächter an jeden künftigen Kontext des Browsers (auch browser.newPage).
 * @param {import('playwright').Browser} browser
 * @returns {{ violations: string[] }}
 */
export function installCspGuard(browser) {
  /** @type {string[]} */
  const violations = [];
  const orig = browser.newContext.bind(browser);
  const attach = (page) => page.on('console', (msg) => {
    const t = msg.text();
    if (t.startsWith('[CSP-VERSTOSS]') || /Content Security Policy/i.test(t)) violations.push(`${page.url()} ${t}`);
  });
  browser.newContext = async (opts) => {
    const ctx = await orig(opts);
    await ctx.addInitScript(GUARD_SCRIPT);
    ctx.on('page', attach);
    return ctx;
  };
  return { violations };
}

function cspOf(html) {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  return m ? m[1] : '';
}

function walk(dir, out = []) {
  for (const f of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, f);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (f.endsWith('.js')) out.push(rel);
  }
  return out;
}

export function runCspStaticTests({ assertEq: raw }) {
  const assertEq = (n, a, e) => raw(n, JSON.stringify(a), JSON.stringify(e));
  console.log('\n=== v3.15.9: CSP Stufe 1 (statisch) ===');
  const indexHtml = read('index.html');
  const diagHtml = read('diag.html');
  const ci = cspOf(indexHtml), cd = cspOf(diagHtml);
  assertEq('CSP2: Richtlinie index.html', ci, EXPECTED_CSP_INDEX);
  assertEq('CSP2: Richtlinie diag.html', cd, EXPECTED_CSP_DIAG);
  for (const [name, csp] of [['index.html', ci], ['diag.html', cd]]) {
    const hostOnly = csp.split(/[;\s]+/).filter(t => /^https?:\/\/[^/]+\/?$/.test(t));
    assertEq(`CSP2: ${name} ohne unsafe-inline, unsafe-eval, * und Host ohne Pfad`,
      [/unsafe-inline/.test(csp), /unsafe-eval/.test(csp), /(^|\s)\*(\s|;|$)/.test(csp), hostOnly], [false, false, false, []]);
  }

  const files = ['index.html', 'diag.html', 'app.js', 'diag.js', ...walk('modules')];
  const hits = [];
  for (const f of files) {
    const src = read(f);
    src.split('\n').forEach((line, i) => {
      const code = line.replace(/^\s*(\/\/|\*).*$/, '');
      if (/\sstyle\s*=\s*["'`$]/.test(code)) hits.push(`${f}:${i + 1} style=`);
      if (/<[a-z][^>]*\s on[a-z]+\s*=/i.test(code) || /<[a-z][^>]*\son[a-z]+\s*=\s*["']/i.test(code)) hits.push(`${f}:${i + 1} on…=`);
      if (/setAttribute\(\s*['"](style|on[a-z]+)['"]/.test(code)) hits.push(`${f}:${i + 1} setAttribute`);
    });
    if (f.endsWith('.html')) {
      const inline = [...src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)].map(m => m[0]);
      if (inline.length) hits.push(`${f}: Inline-Skript ${inline.join(' ')}`);
      if (/<style[\s>]/.test(src)) hits.push(`${f}: <style>`);
    }
  }
  assertEq('CSP3: keine style-Attribute, Inline-Ereignisse und Inline-Skripte', hits, []);

  const loader = read('modules/lib-loader.js');
  const sw = read('sw.js');
  const pick = (s) => [...s.matchAll(/https:\/\/unpkg\.com\/[^'"\s;]+/g)].map(m => m[0]).filter((u, i, a) => a.indexOf(u) === i).sort();
  const want = [...LIB_URLS].sort();
  assertEq('CSP4: Versionen Lader = Service Worker = CSP', [pick(loader), pick(sw), pick(ci)], [want, want, want]);
}

/**
 * @param {import('playwright').Browser} browser
 * @param {string} baseURL
 */
export async function runCspBrowserTests(browser, baseURL, { assertEq: raw }) {
  const assertEq = (n, a, e) => raw(n, JSON.stringify(a), JSON.stringify(e));
  console.log('\n=== v3.15.9: CSP Stufe 1 (Browser) ===');
  const base = baseURL.replace(/\/$/, '');
  const context = await browser.newContext({ acceptDownloads: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  /** @type {string[]} */
  const seen = [];
  context.on('page', (p) => p.on('console', (m) => { if (/CSP-VERSTOSS|Content Security Policy/i.test(m.text())) seen.push(m.text()); }));
  const page = await context.newPage();
  try {
    await page.clock.install({ time: new Date('2026-12-15T10:00:00+01:00') });
    await page.goto(base + '/');
    await page.waitForFunction(() => typeof window.renderTracker === 'function');
    await page.evaluate(() => {
      const s = window.state;
      s.employers = [{ id: 'm', name: 'Muster GmbH', kind: 'employer', color: '#16a34a', contacts: [], hoursMode: 'week', weeklyHours: 39, monthlyHours: 0, schedule: {}, hiredSince: '2025-01-01', employmentEndDate: '2026-12-31', annualVacation: 30, breakMode: 'legal' }];
      s.activeEmployerId = 'm'; s.runningTimer = null; s.settings.employeeName = 'Max Mustermann';
      s.settings.fieldService = { enabled: true, employerIds: ['m'] };
      const c = '2026-12-07T06:00:00.000Z';
      s.entries = [
        { id: 'c1', employerId: 'm', date: '2026-12-01', type: 'work', start: '08:00', end: '16:30', breakMinutes: 30, overtimeReason: '', note: '', createdAt: c, km: 42 },
        { id: 'c2', employerId: 'm', date: '2026-12-02', type: 'vacation', note: '', createdAt: c },
      ];
      window.saveState();
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    });

    // CSP7: Farben über element.style.
    const colors = await page.evaluate(() => {
      window.switchView('entries');
      const m = document.getElementById('filter-month');
      m.value = '2026-12'; window.renderEntries();
      const card = document.querySelector('[data-testid="entry-c1"]');
      window.switchView('employers');
      const dot = document.querySelector('.employer-card .employer-color');
      return [card?.getAttribute('style') || '', getComputedStyle(card).borderLeftColor, getComputedStyle(dot).backgroundColor];
    });
    assertEq('CSP7: Farbe am Eintrag und am Arbeitgeber', colors, ['border-left-color: rgb(22, 163, 74);', 'rgb(22, 163, 74)', 'rgb(22, 163, 74)']);

    // CSP5: alle Exporte.
    const go = (view, inputId, value) => page.evaluate(([view, inputId, value]) => {
      window.switchView(view);
      if (inputId) { const i = document.getElementById(inputId); i.value = value; i.dispatchEvent(new Event('change', { bubbles: true })); }
    }, [view, inputId, value]);
    const exports = [
      ['report', 'report-month', '2026-12', 'btn-export-pdf'],
      ['report', 'report-month', '2026-12', 'btn-export-word'],
      ['report', 'report-month', '2026-12', 'btn-export-csv'],
      ['report', 'report-month', '2026-12', 'btn-export-km-pdf'],
      ['overview', null, null, 'btn-export-overview-pdf'],
      ['gleitzeitkonto', null, null, 'btn-export-gleitzeitkonto-pdf'],
      ['settings', null, null, 'btn-export-backup'],
    ];
    const got = [];
    for (const [view, inp, val, btn] of exports) {
      await go(view, inp, val);
      try {
        const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#' + btn)]);
        got.push(btn + ':' + (d.suggestedFilename() ? 'ok' : 'leer'));
      } catch (e) { got.push(btn + ':' + String(e.message).split('\n')[0]); }
      await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));
    }
    // Urlaubsbescheinigung (8. Export) im Jahr des Beschäftigungsendes.
    await go('vacation-planning', null, null);
    try {
      const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btn-export-vacation-certificate')]);
      got.push('urlaubsbescheinigung:' + (d.suggestedFilename() ? 'ok' : 'leer'));
    } catch (e) { got.push('urlaubsbescheinigung:' + String(e.message).split('\n')[0]); }
    assertEq('CSP5: alle Exporte erzeugen eine Datei', got.filter(g => !g.endsWith(':ok')), []);
    assertEq('CSP5: Anzahl geprüfter Exporte', got.length, 8);

    // Diagnose-Seite.
    await page.goto(base + '/diag.html');
    await page.waitForFunction(() => !/wird geladen/.test(document.getElementById('manifest-out')?.textContent || ''));
    const diag = await page.evaluate(() => [!!document.getElementById('btn-reload'), getComputedStyle(document.body).backgroundColor]);
    await Promise.all([page.waitForEvent('load'), page.click('#btn-reload')]);
    assertEq('CSP5: Diagnose-Seite mit Stilen und Knopf „Neu prüfen“', diag, [true, 'rgb(15, 23, 42)']);
    assertEq('CSP5: keine Verstöße bei Exporten und Diagnose', seen, []);

    // CSP6: Rahmen-Schutz. Fremder Rahmen = andere Adresse (127.0.0.1 statt localhost).
    const foreign = base.includes('localhost') ? base.replace('localhost', '127.0.0.1') : base.replace('127.0.0.1', 'localhost');
    const framed = async (outer) => {
      const url = outer + '/__rahmen-test.html';
      await context.route(url, (r) => r.fulfill({ contentType: 'text/html', body: `<!DOCTYPE html><iframe src="${base}/" width="800" height="600"></iframe>` }));
      await page.goto(url);
      await context.unroute(url);
      const frame = await (await page.waitForSelector('iframe')).contentFrame();
      await frame.waitForLoadState('load');
      await frame.waitForFunction(() => !!document.querySelector('[data-testid="frame-guard"]') || typeof window.renderTracker === 'function');
      return frame.evaluate(() => [!!document.querySelector('[data-testid="frame-guard"]'), document.querySelector('[data-testid="frame-guard"] a')?.getAttribute('target') || '', !!document.getElementById('view-tracker')]);
    };
    assertEq('CSP6: fremder Rahmen zeigt nur den Hinweis', await framed(foreign), [true, '_top', false]);
    assertEq('CSP6: eigener Rahmen zeigt die App', await framed(base), [false, '', true]);
  } finally {
    await context.close();
  }
}
