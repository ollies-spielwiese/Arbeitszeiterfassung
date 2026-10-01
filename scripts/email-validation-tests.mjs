// v3.9.91: läuft über npm run qa in Chromium und in der vorhandenen WebKit-CI.
// Alle Mail-/Download-Aktionen werden im Share-Test über ctx/Navigator isoliert.
export async function runEmailValidationTests(page, { assertTrue, assertEq, assertContains }) {
  console.log('\n=== E-Mail-Formatprüfung: Felder, Persistenz und beide Teilen-Dialoge ===');
  const cases = [
    ['', true], ['   ', true], ['name@example.de', true],
    [' name+arbeit@example.de ', true], ["o'connor@example.de", true],
    ['name@sub.example.travel', true], ['name@intranet', true],
    ['name.example.de', false], ['name@', false], ['@example.de', false],
    ['name@@example.de', false], ['name @example.de', false],
    ['name@example..de', false], ['name@-example.de', false],
    ['name@example.de,chef@example.de', false], ['name\n@example.de', false],
  ];
  for (const [value, valid] of cases) {
    assertEq(`EMAIL Format ${JSON.stringify(value)}`,
      await page.evaluate(value => !emailFormatError(value), value), valid);
  }
  assertEq('EMAIL Liste: Komma/Semikolon, äußere Leerzeichen und leere Trenner',
    await page.evaluate(() => JSON.stringify(splitEmailAddresses(' a@example.de ; b@example.de,, ; '))),
    JSON.stringify(['a@example.de', 'b@example.de']));
  assertTrue('EMAIL Liste: Leerzeichen sind keine stillen Empfängertrenner',
    await page.evaluate(() => !!emailListError('a@example.de b@example.de')));
  assertContains('EMAIL Liste: fehlerhafte Adresse wird genau genannt',
    await page.evaluate(() => emailListError('a@example.de; chef@')), 'chef@');

  const saved = await page.evaluate(() => ({ state: JSON.stringify(state), ua: navigator.userAgent }));
  try {
    await page.evaluate(() => {
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      state.settings.ownEmail = 'alt@example.de';
      saveState();
      switchView('settings');
    });
    await page.fill('#setting-own-email', 'ungueltig');
    assertEq('EMAIL eigene Adresse: kein Hinweis beim ersten Tippen',
      await page.locator('#setting-own-email-error').textContent(), '');
    await page.locator('#setting-own-email').blur();
    assertContains('EMAIL eigene Adresse: Hinweis nach Blur',
      await page.locator('#setting-own-email-error').textContent(), 'mit @');
    assertEq('EMAIL eigene Adresse: alter State bleibt bei Fehler',
      await page.evaluate(() => state.settings.ownEmail), 'alt@example.de');
    assertEq('EMAIL eigene Adresse: alter localStorage bleibt bei Fehler',
      await page.evaluate(() => JSON.parse(localStorage.getItem(STORAGE_KEY)).settings.ownEmail), 'alt@example.de');
    await page.fill('#setting-own-email', 'neu+arbeit@example.de');
    assertEq('EMAIL eigene Adresse: Hinweis verschwindet während Korrektur',
      await page.locator('#setting-own-email-error').textContent(), '');
    await page.locator('#setting-own-email').blur();
    assertEq('EMAIL eigene Adresse: gültige Korrektur gespeichert',
      await page.evaluate(() => state.settings.ownEmail), 'neu+arbeit@example.de');
    await page.fill('#setting-own-email', '');
    await page.locator('#setting-own-email').blur();
    assertEq('EMAIL eigene Adresse: optional leer speichern',
      await page.evaluate(() => state.settings.ownEmail), '');
    await page.fill('#setting-own-email', 'kaputt@');
    await page.locator('#setting-own-email').blur();
    await page.evaluate(() => { switchView('tracker'); switchView('settings'); });
    assertEq('EMAIL eigene Adresse: erneutes Öffnen setzt alten Fehler zurück',
      await page.locator('#setting-own-email-error').textContent(), '');
    await page.evaluate(() => { state.settings.ownEmail = 'importiert@'; saveState(); renderSettings(); });
    assertContains('EMAIL eigene Adresse: importierte fehlerhafte Adresse beim Bearbeiten sichtbar',
      await page.locator('#setting-own-email-error').textContent(), 'nach @');
    assertEq('EMAIL eigene Adresse: importierter Wert bleibt unverändert',
      await page.evaluate(() => state.settings.ownEmail), 'importiert@');

    for (const mode of ['employee', 'freelance']) {
      await page.evaluate(mode => {
        state.settings.appMode = mode;
        state.employers = [];
        state.entries = [];
        state.activeEmployerId = null;
        saveState();
        switchView('employers');
      }, mode);
      await page.click('#btn-add-employer');
      // Isolierter E-Mail-Test mit gültigen übrigen Feldern. Der bestehende
      // Vollzeit-Default setzt im versteckten Prozentfeld 100 bei max=99;
      // dieser unabhängig bestehende Fehler wird separat dokumentiert.
      await page.evaluate(() => { document.getElementById('employer-parttime-percent').value = '60'; });
      await page.fill('#employer-name', 'E-Mail-Test');
      await page.fill('#employer-contact1-email', 'buero@');
      await page.fill('#employer-contact2-email', 'vertretung@');
      await page.click('#form-employer button[type="submit"]');
      assertEq(`EMAIL ${mode}: ungültige Kontakte blockieren Speicherung`,
        await page.evaluate(() => state.employers.length), 0);
      assertEq(`EMAIL ${mode}: erstes fehlerhaftes Feld erhält Fokus`,
        await page.evaluate(() => document.activeElement.id), 'employer-contact1-email');
      assertContains(`EMAIL ${mode}: auch zweiter Fehler sichtbar`,
        await page.locator('#employer-contact2-email-error').textContent(), 'nach @');
      await page.fill('#employer-contact1-email', 'buero@example.de');
      await page.fill('#employer-contact2-email', '');
      await page.fill('#employer-name', '');
      await page.click('#form-employer button[type="submit"]');
      assertEq(`EMAIL ${mode}: required Name bleibt wirksam`,
        await page.evaluate(() => state.employers.length), 0);
      await page.fill('#employer-name', 'E-Mail-Test');
      await page.click('#form-employer button[type="submit"]');
      assertEq(`EMAIL ${mode}: gültig und leer gemeinsam gespeichert`,
        await page.evaluate(() => JSON.stringify(state.employers[0]?.contacts.map(c => c.email))),
        JSON.stringify(['buero@example.de', '']));
      assertTrue(`EMAIL ${mode}: Modal schließt nach gültigem Speichern`,
        await page.locator('#modal-employer').evaluate(el => el.classList.contains('hidden')));
      await page.click('#btn-add-employer');
      assertEq(`EMAIL ${mode}: keine alten Fehler bei Neuanlage`,
        await page.locator('#employer-contact1-email-error').textContent(), '');
      await page.locator('#modal-employer .modal-close').click();
    }

    await page.evaluate(async () => {
      const { openShareModal, openOverviewShareModal, shareReport } = await import('/modules/share.js');
      Object.defineProperty(navigator, 'userAgent', { value: 'iPhone', configurable: true });
      const canShareDescriptor = Object.getOwnPropertyDescriptor(navigator, 'canShare');
      const shareDescriptor = Object.getOwnPropertyDescriptor(navigator, 'share');
      const probe = window.__emailProbe = { downloads: 0, generated: 0, system: 0, toasts: [], canShareDescriptor, shareDescriptor };
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { probe.system++; } });
      const employer = { name: 'Beispiel', contacts: [{ name: 'Alt', email: 'kontakt@' }, { name: 'Gültig', email: 'name+arbeit@example.de' }] };
      const report = { employer, ym: '2026-10', workedMin: 60, targetMin: 60, balance: 0, vacationEntries: [], sickEntries: [] };
      const ownState = { settings: { ownEmail: 'importiert@' } };
      const generate = async () => { probe.generated++; return new Blob(['test'], { type: 'application/pdf' }); };
      const ctx = {
        getState: () => ownState, getCurrentReport: () => report,
        getCurrentOverview: () => ({ ym: '2026-10', rows: [{ employer }] }),
        fileNameForReport: () => 'test.pdf', fileNameForOverview: () => 'test.pdf',
        formatMonthYear: () => 'Oktober 2026', renderSummaryPlaintext: () => [],
        getSummaryFields: () => [], getOverviewSummaryFields: () => [],
        generateWordBlob: generate, generatePdfBlob: generate, generateOverviewPdfBlob: generate,
        downloadBlob: () => { probe.downloads++; },
        toast: text => probe.toasts.push(text),
        escapeHtml: text => String(text).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])),
        closeModals: () => document.getElementById('modal-share').classList.add('hidden'),
      };
      probe.open = mode => mode === 'report' ? openShareModal(ctx) : openOverviewShareModal(ctx);
      probe.direct = addresses => shareReport('pdf', addresses, ctx);
      probe.savedEmails = () => [ownState.settings.ownEmail, ...employer.contacts.map(c => c.email)];
    });

    for (const mode of ['report', 'overview']) {
      const before = await page.evaluate(() => ({ generated: __emailProbe.generated, downloads: __emailProbe.downloads, system: __emailProbe.system }));
      await page.evaluate(mode => __emailProbe.open(mode), mode);
      await page.fill('#share-manual-emails', 'gut@example.de; chef@');
      // Ohne vorbereitendes Blur: Schon der erste echte Klick muss ankommen.
      await page.click('#share-send-btn');
      assertContains(`EMAIL ${mode}: ungültige manuelle Adresse benannt`,
        await page.locator('#share-manual-emails-error').textContent(), 'chef@');
      assertTrue(`EMAIL ${mode}: manueller Fehlerrahmen bleibt sichtbar`,
        await page.evaluate(() => getComputedStyle(document.getElementById('share-manual-emails')).borderTopColor
          === getComputedStyle(document.getElementById('share-manual-emails-error')).color));
      assertEq(`EMAIL ${mode}: Fokus manuelle Adresse`,
        await page.evaluate(() => document.activeElement.id), 'share-manual-emails');
      assertEq(`EMAIL ${mode}: vor Dateierstellung blockiert`,
        await page.evaluate(() => __emailProbe.generated), before.generated);
      assertEq(`EMAIL ${mode}: kein Download bei Fehler`,
        await page.evaluate(() => __emailProbe.downloads), before.downloads);
      assertEq(`EMAIL ${mode}: keine Mailto-Stufe bei Fehler`, await page.locator('#mailto-open-btn').count(), 0);
      await page.fill('#share-manual-emails', '<img src=x onerror=alert(1)>@');
      await page.locator('#share-manual-emails').blur();
      assertEq(`EMAIL ${mode}: Fehlermeldung erzeugt kein HTML`,
        await page.locator('#share-manual-emails-error img').count(), 0);
      await page.fill('#share-manual-emails', 'gut@example.de');
      assertEq(`EMAIL ${mode}: Korrektur entfernt Hinweis`,
        await page.locator('#share-manual-emails-error').textContent(), '');
      await page.check('#share-recipient-0');
      await page.click('#share-send-btn');
      assertContains(`EMAIL ${mode}: gespeicherte eigene Adresse mit Korrekturort`,
        await page.locator('#share-recipient-0-error').textContent(), 'in den Einstellungen');
      assertEq(`EMAIL ${mode}: Fokus auf fehlerhaften ausgewählten Empfänger`,
        await page.evaluate(() => document.activeElement.id), 'share-recipient-0');
      await page.uncheck('#share-recipient-0');
      assertEq(`EMAIL ${mode}: Abwahl entfernt Hinweis`, await page.locator('#share-recipient-0-error').textContent(), '');
      await page.check('#share-recipient-1');
      assertContains(`EMAIL ${mode}: Kontaktfehler mit Korrekturort`,
        await page.locator('#share-recipient-1-error').textContent(), 'im Arbeitgeber/Kunden');
      assertTrue(`EMAIL ${mode}: Fehlerrahmen hat Vorrang vor Auswahlfarbe`,
        await page.evaluate(() => getComputedStyle(document.getElementById('share-recipient-1').closest('.recipient-card')).borderTopColor
          === getComputedStyle(document.getElementById('share-recipient-1-error')).color));
      await page.check('#share-mode-system');
      assertEq(`EMAIL ${mode}: Nur teilen entfernt Fehler`, await page.locator('#share-recipient-1-error').textContent(), '');
      await page.click('#share-send-btn');
      await page.waitForFunction(before => __emailProbe.system > before, before.system);
      assertEq(`EMAIL ${mode}: Nur teilen nutzt Systempfad`,
        await page.evaluate(() => __emailProbe.system), before.system + 1);
      await page.evaluate(mode => __emailProbe.open(mode), mode);
      assertEq(`EMAIL ${mode}: frischer Dialog ohne Fehler`, await page.locator('#share-manual-emails-error').textContent(), '');
      await page.check('#share-recipient-2');
      await page.fill('#share-manual-emails', ' name+arbeit@example.de ; chef@example.de, name+arbeit@example.de ');
      await page.click('#share-send-btn');
      await page.waitForSelector('#mailto-open-btn', { timeout: 3000 });
      const mailto = await page.locator('#mailto-open-btn').getAttribute('href');
      assertEq(`EMAIL ${mode}: gültige Empfänger bereinigt/dedupliziert, keiner verloren`,
        decodeURIComponent(mailto.split('?')[0]), 'mailto:name+arbeit@example.de,chef@example.de');
      assertEq(`EMAIL ${mode}: kein gespeicherter Altwert geändert`,
        await page.evaluate(() => JSON.stringify(__emailProbe.savedEmails())),
        JSON.stringify(['importiert@', 'kontakt@', 'name+arbeit@example.de']));
      await page.locator('#modal-share .mailto-stage2 button[data-close-modal]').click();
      await page.evaluate(mode => __emailProbe.open(mode), mode);
      assertEq(`EMAIL ${mode}: nach Stage2 erneut fehlerhaft senden blockiert`,
        await page.evaluate(() => {
          document.getElementById('share-manual-emails').value = 'kaputt@';
          document.getElementById('share-send-btn').click();
          return document.getElementById('share-manual-emails').getAttribute('aria-invalid');
        }), 'true');
      await page.locator('#modal-share .modal-close').click();
    }
    const count = await page.evaluate(() => __emailProbe.generated);
    await page.evaluate(() => __emailProbe.direct(['kaputt@']));
    assertEq('EMAIL direkter Share-Aufruf: ungültig vor Blob-Erstellung blockiert',
      await page.evaluate(() => __emailProbe.generated), count);
  } finally {
    await page.evaluate(saved => {
      if (window.__emailProbe) {
        for (const [name, descriptor] of [['canShare', __emailProbe.canShareDescriptor], ['share', __emailProbe.shareDescriptor]]) {
          if (descriptor) Object.defineProperty(navigator, name, descriptor);
          else delete navigator[name];
        }
        delete window.__emailProbe;
      }
      Object.defineProperty(navigator, 'userAgent', { value: saved.ua, configurable: true });
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      Object.assign(state, JSON.parse(saved.state));
      saveState();
    }, saved);
  }
}
