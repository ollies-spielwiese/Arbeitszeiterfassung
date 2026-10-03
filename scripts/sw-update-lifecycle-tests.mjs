// Deterministische Lebenszyklus-Tests des echten sw-update.js mit isolierten
// ServiceWorker-Testobjekten. Der Haupt-Regressionslauf nutzt weiterhin echte SWs.
export async function runServiceWorkerLifecycleTests(browser, baseURL, { assertEq }) {
  console.log('\n=== Service Worker: Erstinstallation, echtes Update und Aktivierung ===');
  const scenarios = [
    'first-normal', 'first-early-controller', 'existing-same-controller',
    'existing-update', 'new-update', 'not-waiting',
    'activate-controllerchange', 'activate-polling',
  ];
  for (const scenario of scenarios) {
    const context = await browser.newContext();
    try {
      const fixtureURL = `${baseURL}/?sw-lifecycle=${scenario}`;
      await context.route(fixtureURL, route => route.fulfill({
        contentType:'text/html',
        body:'<!doctype html><style>.hidden{display:none}</style><div id="update-banner" class="hidden"><button id="btn-update-later">Später</button><button id="btn-update-now">Jetzt aktualisieren</button></div>',
      }));
      const page = await context.newPage();
      let navigations = 0;
      page.on('pageerror', error => assertEq(`SWL ${scenario}: Browserfehler ${error.message}`, true, false));
      page.on('console', message => {
        if (message.type() === 'error') assertEq(`SWL ${scenario}: Konsole ${message.text()}`, true, false);
      });
      await page.goto(fixtureURL);
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
      await page.evaluate(async scenario => {
        const messages = [];
        const worker = state => Object.assign(new EventTarget(), {
          state, scriptURL: new URL('./sw.js', location.href).href,
          postMessage: message => messages.push(message),
        });
        const old = worker('activated');
        const next = worker('installing');
        const container = new EventTarget();
        const reg = Object.assign(new EventTarget(), {
          active:null, waiting:null, installing:next, scope:location.origin+'/',
          updates:0, update(){ this.updates++; return Promise.resolve(); },
        });
        container.controller = null;
        if (scenario === 'existing-same-controller') {
          next.state = 'installed'; reg.installing = null;
          reg.waiting = next; container.controller = next;
        } else if (scenario === 'existing-update') {
          next.state = 'installed'; reg.installing = null;
          reg.waiting = next; reg.active = old; container.controller = old;
        } else if (!scenario.startsWith('first-')) {
          reg.active = old; container.controller = old;
        }
        container.register = () => Promise.resolve(reg);
        container.ready = Promise.resolve(reg);
        Object.defineProperty(navigator, 'serviceWorker', { configurable:true, value:container });
        window.__swCase = { reg, container, next, messages };
        const mod = await import('/modules/sw-update.js');
        mod.initServiceWorkerUpdates();
        await Promise.resolve();
        await Promise.resolve();
        if (!scenario.startsWith('existing-')) {
          reg.dispatchEvent(new Event('updatefound'));
          reg.installing = null;
          next.state = 'installed';
          reg.waiting = scenario === 'not-waiting' ? null : next;
          if (scenario === 'first-early-controller') container.controller = next;
          next.dispatchEvent(new Event('statechange'));
        }
      }, scenario);
      const expectedBanner = ['existing-update','new-update','activate-controllerchange','activate-polling'].includes(scenario);
      assertEq(`SWL ${scenario}: Banner nur für echtes wartendes Update`,
        await page.locator('#update-banner').isVisible(), expectedBanner);
      assertEq(`SWL ${scenario}: aktiver Update-Check bleibt erhalten`,
        await page.evaluate(() => __swCase.reg.updates), 1);
      assertEq(`SWL ${scenario}: kein ungefragtes SKIP_WAITING`,
        await page.evaluate(() => __swCase.messages.length), 0);
      assertEq(`SWL ${scenario}: kein ungefragter Reload`, navigations, 0);

      if (scenario.startsWith('first-')) {
        await page.evaluate(() => {
          const { reg, container, next } = __swCase;
          reg.waiting = null; reg.active = next; next.state = 'activated';
          container.controller = next; container.dispatchEvent(new Event('controllerchange'));
        });
        assertEq(`SWL ${scenario}: Erstaktivierung zeigt keinen Banner`,
          await page.locator('#update-banner').isVisible(), false);
        assertEq(`SWL ${scenario}: Erstaktivierung lädt nicht neu`, navigations, 0);
      }
      if (scenario === 'existing-update' || scenario === 'new-update') {
        await page.click('#btn-update-later');
        assertEq(`SWL ${scenario}: Später blendet Banner aus`,
          await page.locator('#update-banner').isVisible(), false);
        assertEq(`SWL ${scenario}: Später aktiviert nicht`,
          await page.evaluate(() => __swCase.messages.length), 0);
      }
      if (scenario.startsWith('activate-')) {
        await page.click('#btn-update-now');
        assertEq(`SWL ${scenario}: Jetzt aktualisieren sendet genau SKIP_WAITING`,
          await page.evaluate(() => JSON.stringify(__swCase.messages)), '[{"type":"SKIP_WAITING"}]');
        const navigation = page.waitForEvent('framenavigated', { timeout:2000 });
        await page.evaluate(scenario => {
          const { reg, container, next } = __swCase;
          reg.waiting = null; reg.active = next; next.state = 'activated'; container.controller = next;
          if (scenario === 'activate-controllerchange') container.dispatchEvent(new Event('controllerchange'));
        }, scenario);
        await navigation;
        await page.waitForLoadState('domcontentloaded');
        assertEq(`SWL ${scenario}: genau ein Reload nach bewusster Aktivierung`, navigations, 1);
        assertEq(`SWL ${scenario}: neues Dokument geladen`,
          await page.evaluate(() => typeof window.__swCase), 'undefined');
      }
    } finally {
      await context.close();
    }
  }
}
