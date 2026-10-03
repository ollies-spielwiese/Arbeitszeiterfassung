// Echte App, echte Pointer-/Touch-Aktivierung, keine Vorschau und kein Module-Mock.
// Ungültige Testdaten verhindern Speichern/Teilen; Share-Nebeneffekte sind zusätzlich isoliert.
export async function runEmailPointerTests(browser, baseURL, { assertTrue, assertEq, assertContains }) {
  console.log('\n=== E-Mail: erster Klick, Touch und Blur-Koordination ===');
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'schmal', viewport: { width: 390, height: 844 } },
    { name: 'touch', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ];
  for (const { name, ...options } of profiles) {
    const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof state !== 'undefined' && typeof switchView === 'function');

      async function prepare(scene) {
        await page.evaluate(async scene => {
          document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
          window.__pointerProbe = { clicks: 0, effects: 0 };
          if (scene === 'employee' || scene === 'freelance') {
            state.settings.appMode = scene;
            state.employers = [];
            state.entries = [];
            state.activeEmployerId = null;
            saveState();
            switchView('employers');
            document.getElementById('btn-add-employer').click();
            document.getElementById('employer-name').value = 'Pointer-Test';
            // Originaldefault100 beibehalten; kein Prozentfeld-Workaround.
            document.getElementById('employer-contact1-email').value = 'buero@example.de';
          } else {
            const { openShareModal, openOverviewShareModal } = await import('/modules/share.js');
            const employer = { name: 'Pointer-Test', contacts: [] };
            const noEffect = () => { window.__pointerProbe.effects++; throw new Error('Ungültige E-Mail darf keinen Export starten'); };
            const ctx = {
              getState: () => ({ settings: { ownEmail: '' } }),
              getCurrentReport: () => ({ employer, ym: '2026-10', workedMin: 60, targetMin: 60, balance: 0, vacationEntries: [], sickEntries: [] }),
              getCurrentOverview: () => ({ ym: '2026-10', rows: [{ employer }] }),
              fileNameForReport: () => 'test.pdf', fileNameForOverview: () => 'test.pdf',
              formatMonthYear: () => 'Oktober 2026', renderSummaryPlaintext: () => [],
              getSummaryFields: () => [], getOverviewSummaryFields: () => [],
              generateWordBlob: noEffect, generatePdfBlob: noEffect, generateOverviewPdfBlob: noEffect,
              downloadBlob: noEffect, toast: () => {},
              escapeHtml: text => String(text).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])),
              closeModals: () => document.getElementById('modal-share').classList.add('hidden'),
            };
            if (scene === 'report') openShareModal(ctx);
            else openOverviewShareModal(ctx);
          }
        }, scene);
        const contact = scene === 'employee' || scene === 'freelance';
        const field = contact ? '#employer-contact2-email' : '#share-manual-emails';
        const button = contact ? '#form-employer button[type=submit]' : '#share-send-btn';
        await page.fill(field, contact ? 'vertretung@' : 'buero@example.de; chef@');
        await page.locator(button).scrollIntoViewIfNeeded();
        await page.locator(button).evaluate(el => {
          // Wiederholte Vorbereitung darf keine alten Zähler-Listener behalten.
          if (el.__pointerTestListener) el.removeEventListener('click', el.__pointerTestListener);
          el.__pointerTestListener = () => { window.__pointerProbe.clicks++; };
          el.addEventListener('click', el.__pointerTestListener);
        });
        return { field, button };
      }

      for (const scene of ['employee', 'freelance', 'report', 'overview']) {
        const { field, button } = await prepare(scene);
        assertEq(`POINTER ${name}/${scene}: Fehler vor erstem Klick noch leer`,
          await page.locator(`${field}-error`).textContent(), '');
        if (options.hasTouch) await page.locator(button).tap();
        else await page.locator(button).click();
        assertEq(`POINTER ${name}/${scene}: genau erster Klick erreicht Ziel`,
          await page.evaluate(() => __pointerProbe.clicks), 1);
        assertEq(`POINTER ${name}/${scene}: fehlerhaftes Feld fokussiert`,
          await page.evaluate(() => document.activeElement.id), field.slice(1));
        assertEq(`POINTER ${name}/${scene}: ungültig markiert`,
          await page.locator(field).getAttribute('aria-invalid'), 'true');
        assertEq(`POINTER ${name}/${scene}: kein Export/Versand`,
          await page.evaluate(() => __pointerProbe.effects), 0);
        if (scene === 'employee' || scene === 'freelance') {
          assertEq(`POINTER ${name}/${scene}: keine Speicherung`,
            await page.evaluate(() => state.employers.length), 0);
        }
      }

      if (name === 'desktop') {
        let { field, button } = await prepare('employee');
        const box = await page.locator(button).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(120); // Absichtlich längere aktive Geste, kein Stabilitäts-Workaround.
        assertEq('POINTER halten: Blur-Hinweis während Geste zurückgestellt',
          await page.locator(`${field}-error`).textContent(), '');
        assertTrue('POINTER halten: Button bleibt an seiner Position',
          Math.abs((await page.locator(button).boundingBox()).y - box.y) <= 2);
        await page.mouse.up();
        assertEq('POINTER halten: Loslassen löst genau einen Klick aus',
          await page.evaluate(() => __pointerProbe.clicks), 1);

        ({ field } = await prepare('employee'));
        await page.locator(field).press('Tab');
        assertContains('POINTER Tastatur: Blur-Hinweis ohne Pointer sofort sichtbar',
          await page.locator(`${field}-error`).textContent(), 'nach @');
        ({ field } = await prepare('employee'));
        await page.locator(field).press('Enter');
        assertEq('POINTER Tastatur: Enter fokussiert ungültige Adresse',
          await page.evaluate(() => document.activeElement.id), field.slice(1));
        assertEq('POINTER Tastatur: Enter markiert ungültige Adresse',
          await page.locator(field).getAttribute('aria-invalid'), 'true');

        for (const finish of ['pointercancel', 'pointerup', 'window-blur']) {
          ({ field } = await prepare('employee'));
          await page.evaluate(({ field, finish }) => {
            document.dispatchEvent(new PointerEvent('pointerdown', { isPrimary: true, button: 0, pointerId: 55, bubbles: true }));
            document.querySelector(field).blur();
            if (finish === 'window-blur') window.dispatchEvent(new Event('blur'));
            else document.dispatchEvent(new PointerEvent(finish, { isPrimary: true, pointerId: 55, bubbles: true }));
          }, { field, finish });
          await page.waitForFunction(field => document.querySelector(`${field}-error`).textContent.includes('nach @'), field);
          assertContains(`POINTER ${finish}: ausstehender Hinweis wird nachgeholt`,
            await page.locator(`${field}-error`).textContent(), 'nach @');
        }
      }
      assertEq(`POINTER ${name}: keine unbehandelten Browserfehler`, errors.length, 0);
    } finally {
      await context.close();
    }
  }
}
