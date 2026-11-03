// @ts-check
/**
 * modules/ui/storage-status-ui.js (seit v3.14.0)
 *
 * Karte „Speicherstatus“ in den Einstellungen und Anfrage nach dauerhaftem
 * Speicher (navigator.storage.persist). Die Entscheidungen stecken in
 * modules/storage-status.js; hier nur DOM und Browser-APIs.
 *
 * ctx: { getState, saveState, toast, escapeHtml, nav?, win? }
 *   nav/win sind für Tests austauschbar (Standard: navigator/window).
 */
import {
  storageStatusInfo, shouldRequestPersist, isAppleWebKit, lastBackupText, sizeText,
  normalizeChangesSinceBackup,
} from '../storage-status.js';

let _requestedThisSession = false;
let _renderSeq = 0;

/** Nur für Tests: Sitzungsmerker zurücksetzen. */
export function _resetStorageStatusSession() { _requestedThisSession = false; }

/** @param {any} ctx */
function env(ctx) {
  const nav = ctx.nav || (typeof navigator !== 'undefined' ? navigator : /** @type {any} */ ({}));
  const win = ctx.win || (typeof window !== 'undefined' ? window : /** @type {any} */ ({}));
  const storage = nav && nav.storage;
  const apiAvailable = !!(storage && typeof storage.persisted === 'function' && typeof storage.persist === 'function');
  let standalone = false;
  try {
    standalone = !!((win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true);
  } catch (_) { standalone = false; }
  return { nav, storage, apiAvailable, standalone, appleWebKit: isAppleWebKit(nav.userAgent, nav.maxTouchPoints || 0) };
}

/** @param {any} storage @returns {Promise<boolean|null>} */
async function readPersisted(storage) {
  try { return !!(await storage.persisted()); } catch (_) { return null; }
}

/** Größe der gespeicherten Daten in Bytes (JSON, UTF-8). @param {any} state */
export function dataSizeBytes(state) {
  try {
    const json = JSON.stringify(state);
    return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(json).length : json.length;
  } catch (_) { return NaN; }
}

/**
 * Fordert den dauerhaften Speicher an, wenn es nach den Regeln fällig ist.
 * Nach dem ersten gespeicherten Eintrag einmal, als installierte App bei jedem Start.
 * @param {any} ctx
 * @returns {Promise<boolean|null>} Ergebnis der Anfrage oder null, wenn nicht angefragt
 */
export async function maybeRequestPersist(ctx) {
  const e = env(ctx);
  if (!e.apiAvailable || _requestedThisSession) return null;
  const state = ctx.getState();
  const settings = (state && state.settings) || {};
  const persisted = await readPersisted(e.storage);
  const hasEntries = Array.isArray(state && state.entries) && state.entries.length > 0;
  if (!shouldRequestPersist({ apiAvailable: e.apiAvailable, persisted, hasEntries,
    persistRequestedAt: settings.persistRequestedAt, standalone: e.standalone, requestedThisSession: _requestedThisSession })) {
    return null;
  }
  _requestedThisSession = true;
  let granted = false;
  try { granted = !!(await e.storage.persist()); } catch (_) { granted = false; }
  if (state && state.settings) {
    state.settings.persistRequestedAt = new Date().toISOString();
    ctx.saveState();
  }
  return granted;
}

/**
 * Zeichnet die Karte „Speicherstatus“.
 * @param {any} ctx
 */
export async function renderStorageStatus(ctx) {
  const box = document.getElementById('storage-status-content');
  const btn = document.getElementById('btn-storage-persist');
  if (!box) return;
  const seq = ++_renderSeq;
  const e = env(ctx);
  const persisted = e.apiAvailable ? await readPersisted(e.storage) : null;
  if (seq !== _renderSeq) return; // neuere Darstellung läuft bereits
  const state = ctx.getState() || {};
  const settings = state.settings || {};
  const info = storageStatusInfo({ apiAvailable: e.apiAvailable, persisted, appleWebKit: e.appleWebKit, standalone: e.standalone });
  const esc = ctx.escapeHtml || ((/** @type {string} */ s) => s);
  const row = (/** @type {string} */ label, /** @type {string} */ value, /** @type {string} */ testid) =>
    `<div class="st-row"><span>${esc(label)}</span><span data-testid="${testid}">${value}</span></div>`;
  box.dataset.state = info.key;
  box.innerHTML =
    row('Dauerhafter Speicher', `<span class="st-badge ${info.badgeClass}">${esc(info.badge)}</span>`, 'storage-status-persist')
    + `<p class="hint st-explain" data-testid="storage-status-text">${esc(info.text)}</p>`
    + row('Letztes Backup', esc(lastBackupText(settings.lastBackupAt, Date.now())), 'storage-status-last-backup')
    + row('Änderungen seit dem letzten Backup', String(normalizeChangesSinceBackup(settings)), 'storage-status-changes')
    + row('Belegter Speicher', esc(sizeText(dataSizeBytes(state))), 'storage-status-size');
  if (btn) btn.classList.toggle('hidden', !info.showRequestButton);
}

/**
 * Schaltfläche „Dauerhaften Speicher anfordern“.
 * @param {any} ctx
 */
export function wireStorageStatusUI(ctx) {
  const btn = document.getElementById('btn-storage-persist');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const e = env(ctx);
    if (!e.apiAvailable) { ctx.toast('Dieser Browser unterstützt die Anfrage nicht'); return; }
    let granted = false;
    try { granted = !!(await e.storage.persist()); } catch (_) { granted = false; }
    _requestedThisSession = true;
    const state = ctx.getState();
    if (state && state.settings) { state.settings.persistRequestedAt = new Date().toISOString(); ctx.saveState(); }
    ctx.toast(granted ? 'Dauerhafter Speicher ist aktiv' : 'Der Browser hat den dauerhaften Speicher nicht gewährt');
    await renderStorageStatus(ctx);
  });
}
