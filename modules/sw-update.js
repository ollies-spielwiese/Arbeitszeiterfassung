// modules/sw-update.js
// Service-Worker-Registrierung + Update-Prompt.
// Kein State-, Formatter- oder Compute-Import. Nur Browser-APIs + DOM-Wiring.
//
// Update-Strategie (unveraendert aus app.js):
// 1. SW registrieren. Wenn beim Load bereits ein waiting-Worker vorhanden ist,
//    Banner zeigen.
// 2. "Spaeter" versteckt nur den Banner — keinen Reload. Beim naechsten
//    App-Start greift entweder erneut der waiting-Check oder das What's-New-
//    Modal (Version-Vergleich ueber APP_VERSION vs. lastSeenVersion).
// 3. Der reg.update()-Aufruf auf visibilitychange loest KEIN automatisches Reload
//    mehr aus — der controllerchange-Reload wird nur getriggert, wenn der User
//    explizit "Jetzt aktualisieren" gedrueckt hat. Damit gibt es keinen
//    unerwarteten Neustart mit Blackscreen, wenn die App aus dem Hintergrund
//    zurueckkommt.
// 4. Wenn beim Zurueckkommen aus dem Hintergrund ein neuer waiting-SW
//    installiert wird, zeigen wir den Banner — nicht mehr, nicht weniger.

let __swWaitingRegistration = null;
let __swUserRequestedActivation = false;

function showUpdateBanner() {
  const el = document.getElementById('update-banner');
  if (el) el.classList.remove('hidden');
}

function hideUpdateBanner() {
  const el = document.getElementById('update-banner');
  if (el) el.classList.add('hidden');
}

function activateWaitingServiceWorker() {
  __swUserRequestedActivation = true;
  const reg = __swWaitingRegistration;
  if (!reg || !reg.waiting) {
    // Kein waiting mehr — kann passieren, wenn iOS den SW zwischenzeitlich selbst aktiviert hat.
    // In diesem Fall: einfach neu laden, damit die neueste Version aus dem SW-Cache greift.
    hideUpdateBanner();
    window.location.reload();
    return;
  }
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}

function registerServiceWorkerWithUpdatePrompt() {
  if (!('serviceWorker' in navigator)) {
    console.info('[SW] Service Worker nicht unterstützt in diesem Browser');
    return;
  }
  const t0 = performance.now();
  navigator.serviceWorker.register('sw.js').then(reg => {
    const dt = Math.round(performance.now() - t0);
    console.info('[SW] registriert (' + dt + 'ms), scope=' + reg.scope);
    // Ready-Signal: wartet bis SW aktiv ist (auch bei erster Installation)
    navigator.serviceWorker.ready.then(readyReg => {
      const dt2 = Math.round(performance.now() - t0);
      console.info('[SW] bereit (' + dt2 + 'ms), state=' + (readyReg.active ? readyReg.active.state : 'unknown'));
      // Custom Event für diag.html / andere Interessenten
      window.dispatchEvent(new CustomEvent('sw-ready', { detail: { registration: readyReg, elapsedMs: dt2 } }));
    });
    // A waiting worker is already available at load time
    if (reg.waiting && navigator.serviceWorker.controller) {
      __swWaitingRegistration = reg;
      showUpdateBanner();
    }
    // A new worker starts installing (kann auch nach visibilitychange->reg.update() passieren)
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          __swWaitingRegistration = reg;
          showUpdateBanner();
        }
      });
    });
    // Poll for updates on visibility change (helps on iOS PWA)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        reg.update().catch(() => {});
      }
    });
  }).catch(err => {
    console.error('[SW] Registrierung fehlgeschlagen:', err);
    window.dispatchEvent(new CustomEvent('sw-error', { detail: { error: err.message } }));
  });

  // Reload NUR wenn der User explizit "Jetzt aktualisieren" gedrueckt hat.
  // Ohne diese Bedingung entstehen unerwartete Reloads beim App-Wechsel auf iOS.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    if (!__swUserRequestedActivation) return;
    reloading = true;
    window.location.reload();
  });
}

/**
 * Kompletter Setup: SW-Registration + Banner-Buttons.
 * Sollte im DOMContentLoaded-Handler aufgerufen werden.
 */
export function initServiceWorkerUpdates() {
  registerServiceWorkerWithUpdatePrompt();

  const btnLater = document.getElementById('btn-update-later');
  const btnNow = document.getElementById('btn-update-now');
  if (btnLater) btnLater.addEventListener('click', hideUpdateBanner);
  if (btnNow) btnNow.addEventListener('click', activateWaitingServiceWorker);
}

// Einzeln exportierte Helper — nicht zwingend gebraucht, aber nuetzlich fuer Tests/Debug.
export {
  registerServiceWorkerWithUpdatePrompt,
  showUpdateBanner,
  hideUpdateBanner,
  activateWaitingServiceWorker,
};
