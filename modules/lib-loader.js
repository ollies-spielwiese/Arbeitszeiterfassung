/**
 * lib-loader.js — Lazy-Loader für schwere CDN-Libraries.
 *
 * Lädt jsPDF, jspdf-autotable und docx erst wenn sie tatsächlich gebraucht werden.
 * Vermeidet ~850 KB Netzwerk-Traffic beim App-Start.
 *
 * Alle Loader sind idempotent — mehrfache Aufrufe teilen sich das gleiche Promise.
 */

const URLS = {
  jspdf:    'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
  autotable:'https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
  docx:     'https://unpkg.com/docx@8.5.0/build/index.umd.js',
};

/** @type {Map<string, Promise<void>>} */
const _pending = new Map();

/**
 * Lädt ein Script per <script>-Tag und cached das Promise.
 * @param {string} key Kürzel aus URLS
 * @returns {Promise<void>}
 */
function loadScript(key) {
  if (_pending.has(key)) return _pending.get(key);
  const url = URLS[key];
  if (!url) return Promise.reject(new Error('Unbekannte Library: ' + key));

  const p = new Promise((resolve, reject) => {
    // Falls schon geladen (z.B. via Service-Worker-Precache) → sofort resolven
    if (document.querySelector(`script[data-lib="${key}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.dataset.lib = key;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Fehler beim Laden von ' + key));
    document.head.appendChild(s);
  });
  _pending.set(key, p);
  return p;
}

/**
 * Lädt jsPDF + autotable (autotable braucht jsPDF).
 * @returns {Promise<void>}
 */
export async function ensurePdfLibs() {
  await loadScript('jspdf');
  await loadScript('autotable');
}

/**
 * Lädt docx-Library.
 * @returns {Promise<void>}
 */
export async function ensureDocxLib() {
  await loadScript('docx');
}
