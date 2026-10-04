// @ts-check

/**
 * Reine Format-Utilities. Keine Abhängigkeiten auf state, DOM, Storage.
 */

/**
 * HTML-Escape für User-Content in innerHTML-Kontexten.
 * @param {any} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Only color literals, never CSS declarations or URLs, may enter style attributes. */
export function safeColor(value) {
  return typeof value === 'string' && /^#(?:[a-f\d]{3}|[a-f\d]{6}|[a-f\d]{8})$/i.test(value)
    ? value : '#3b82f6';
}

/**
 * Formatiert einen Betrag als Währungsstring (de-DE-Locale).
 * Pure Version — currency muss explizit übergeben werden.
 * Der app.js-Wrapper zieht den Default aus state.settings.currency.
 *
 * @param {number} amount
 * @param {string} currency ISO-Code, z.B. 'EUR'
 * @returns {string}
 */
export function formatMoney(amount, currency) {
  const cur = currency || 'EUR';
  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
    }).format(amount || 0);
  } catch (e) {
    return (Math.round((amount || 0) * 100) / 100).toFixed(2) + ' ' + cur;
  }
}
