// modules/whatsnew.js
// "What's New" Modal-Logik: zeigt Changelog-Eintraege seit der zuletzt gesehenen Version.
// Reine Funktion mit ctx-DI - kein Modul-State.
//
// ctx = {
//   appVersion,            // z.B. '3.9.10'
//   lastSeenVersionKey,    // localStorage-Key
//   changelog,             // Array<{ version: string, items: string[] }>
//   escapeHtml,            // Util
// }
//
// Optionen:
//   modalId       Default 'modal-whatsnew'
//   containerId   Default 'whatsnew-content'

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function maybeShowWhatsNew(ctx, opts = {}) {
  const { appVersion, lastSeenVersionKey, changelog, escapeHtml } = ctx;
  const modalId = opts.modalId || 'modal-whatsnew';
  const containerId = opts.containerId || 'whatsnew-content';

  let lastSeen = null;
  try { lastSeen = localStorage.getItem(lastSeenVersionKey); } catch (e) { /* ignore */ }
  if (lastSeen === appVersion) return;

  const container = document.getElementById(containerId);
  const modal = document.getElementById(modalId);
  if (!container || !modal) return;

  // Show entries up to and including the new version, since last seen
  const entries = lastSeen
    ? changelog.filter(c => compareVersions(c.version, lastSeen) > 0)
    : changelog.slice(0, 1); // First install: only current version

  if (!entries.length) {
    try { localStorage.setItem(lastSeenVersionKey, appVersion); } catch (e) {}
    return;
  }

  container.innerHTML = entries.map(e => `
    <div class="whatsnew-block">
      <div class="whatsnew-version">Version ${escapeHtml(e.version)}</div>
      <ul class="whatsnew-list">
        ${e.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
      </ul>
    </div>
  `).join('');
  modal.classList.remove('hidden');

  const markSeen = () => {
    try { localStorage.setItem(lastSeenVersionKey, appVersion); } catch (e) {}
  };
  // Mark seen on any close action
  modal.querySelectorAll('[data-close-modal]').forEach(btn =>
    btn.addEventListener('click', markSeen, { once: true })
  );
}
