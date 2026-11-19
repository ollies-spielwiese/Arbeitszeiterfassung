// Diagnose-Seite (seit v3.15.9 als eigene Datei, CSP ohne Inline-Skripte).
function metric(label, value) {
  return '<tr><th>' + label + '</th><td><code>' + value + '</code></td></tr>';
}

// Standalone-Modus (PWA-Fenster)?
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                  || window.navigator.standalone === true;
const modeLine = document.getElementById('mode-line');
const modeDetail = document.getElementById('mode-detail');
if (isStandalone) {
  modeLine.textContent = '✓ PWA-Modus (Standalone)';
  modeLine.classList.add('ok');
  modeDetail.textContent = 'App läuft im installierten Home-Screen-Fenster. Splash sollte hier greifen.';
} else {
  modeLine.textContent = '⚠ Browser-Modus';
  modeLine.classList.add('warn');
  modeDetail.innerHTML = 'Diese Seite läuft im Browser-Tab, nicht als installierte PWA. '
    + 'Splash-Screens werden nur bei App-Start via Home-Screen-Icon angezeigt.';
}

// Geräte-Metriken
const m = document.getElementById('metrics');
m.innerHTML =
  metric('window.innerWidth', window.innerWidth) +
  metric('window.innerHeight', window.innerHeight) +
  metric('screen.width', screen.width) +
  metric('screen.height', screen.height) +
  metric('screen.availWidth', screen.availWidth) +
  metric('screen.availHeight', screen.availHeight) +
  metric('devicePixelRatio', window.devicePixelRatio) +
  metric('orientation', screen.orientation ? screen.orientation.type : (window.orientation !== undefined ? window.orientation + '°' : 'unknown')) +
  metric('user-agent', navigator.userAgent) +
  metric('standalone (Apple)', window.navigator.standalone) +
  metric('display-mode standalone', window.matchMedia('(display-mode: standalone)').matches) +
  metric('display-mode fullscreen', window.matchMedia('(display-mode: fullscreen)').matches);

// Alle Startup-Images aus dem <head> parsen und live prüfen
const startupTbody = document.querySelector('#startup tbody');
const links = document.querySelectorAll('link[rel="apple-touch-startup-image"]');
if (links.length === 0) {
  startupTbody.innerHTML = '<tr><td colspan="3" class="warn">Keine apple-touch-startup-image-Links gefunden. Diese Seite muss die gleichen Meta-Tags wie index.html enthalten.</td></tr>';
}
// Wir kopieren aus index.html — diag.html hat sie NICHT. Daher fetchen wir index.html.
fetch('index.html', { cache: 'no-store' })
  .then(r => r.text())
  .then(html => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const startups = doc.querySelectorAll('link[rel="apple-touch-startup-image"]');
    if (startups.length === 0) {
      startupTbody.innerHTML = '<tr><td colspan="3" class="warn">index.html enthält keine apple-touch-startup-image-Links.</td></tr>';
      return;
    }
    let html2 = '';
    let matched = 0;
    startups.forEach(link => {
      const href = link.getAttribute('href');
      const media = link.getAttribute('media') || '';
      const matches = media ? window.matchMedia(media).matches : true;
      if (matches) matched++;
      html2 += '<tr>'
        + '<td>' + href + '</td>'
        + '<td><code class="code-small">' + media + '</code></td>'
        + '<td class="' + (matches ? 'match' : 'miss') + '">' + (matches ? '✓ MATCH' : '—') + '</td>'
        + '</tr>';
    });
    startupTbody.innerHTML = html2;

    const summary = document.createElement('p');
        summary.className = 'summary';
    summary.innerHTML = matched > 0
      ? '<span class="match">' + matched + ' von ' + startups.length + ' Startup-Images matchen dein Gerät.</span>'
      : '<span class="warn">Kein Startup-Image matched — iOS wird die background_color aus dem Manifest zeigen.</span>';
    document.querySelector('#startup').after(summary);
  })
  .catch(err => {
    startupTbody.innerHTML = '<tr><td colspan="3" class="warn">Fehler beim Laden von index.html: ' + err.message + '</td></tr>';
  });

// Manifest anzeigen
fetch('manifest.json', { cache: 'no-store' })
  .then(r => r.json())
  .then(mf => {
    const out = document.getElementById('manifest-out');
    out.innerHTML =
      '<div>name: <code>' + mf.name + '</code></div>' +
      '<div>id: <code>' + (mf.id || '(keine)') + '</code></div>' +
      '<div>start_url: <code>' + mf.start_url + '</code></div>' +
      '<div>display: <code>' + mf.display + '</code></div>' +
      '<div>theme_color: <code>' + mf.theme_color + '</code></div>' +
      '<div>background_color: <code>' + mf.background_color + '</code></div>' +
      '<div>icons: <code>' + (mf.icons || []).length + '</code></div>' +
      '<div>shortcuts: <code>' + (mf.shortcuts || []).length + '</code> ' +
      '<span class="warn">(iOS zeigt Manifest-Shortcuts nicht — nur Android/Desktop)</span></div>';
  })
  .catch(err => {
    document.getElementById('manifest-out').innerHTML = '<span class="warn">Manifest-Fehler: ' + err.message + '</span>';
  });

// Service Worker Status
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    const out = document.getElementById('sw-out');
    if (regs.length === 0) {
      out.innerHTML = '<span class="warn">Kein Service Worker registriert.</span>';
    } else {
      out.innerHTML = regs.map(r =>
        '<div>Scope: <code>' + r.scope + '</code></div>' +
        '<div>State: <code>' + (r.active ? r.active.state : 'kein active') + '</code></div>'
      ).join('');
    }
    // Cache-Namen
    if ('caches' in window) {
      caches.keys().then(keys => {
        out.innerHTML += '<div class="mt-small">Caches: <code>' + keys.join(', ') + '</code></div>';
      });
    }
  });
}

document.getElementById('btn-reload').addEventListener('click', () => location.reload());
