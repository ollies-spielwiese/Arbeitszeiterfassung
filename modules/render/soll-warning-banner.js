// modules/render/soll-warning-banner.js
// Pure Builder für die Zeilen-Liste des Sollstunden-Warnung-Banners (Erfassen-Ansicht),
// seit v3.9.78. Kein DOM-Zugriff — analog zu modules/render/vacation-planning.js. Der
// umgebende Banner-Rahmen (Titel, Buttons) ist statisches Markup in index.html; dieser
// Builder liefert nur die <li>-Zeilen, die in die Liste eingesetzt werden.
//
// ctx = { escapeHtml, minutesToHM, formatMonthYear }

/**
 * @param {Array<import('../soll-warning.js').SollWarning & {employer:any, ym:string}>} warnings
 * @param {{escapeHtml:(s:string)=>string, minutesToHM:(m:number)=>string, formatMonthYear:(ym:string)=>string}} ctx
 * @returns {string} leerer String, wenn `warnings` leer ist
 */
export function buildSollWarningListHTML(warnings, ctx) {
  if (!warnings || !warnings.length) return '';
  const { escapeHtml, minutesToHM, formatMonthYear } = ctx;

  return warnings.map((w) => {
    const basisLabel = w.basis === 'month' ? `Monats-Saldo ${formatMonthYear(w.ym)}` : 'Gleitzeitkonto-Saldo';
    const directionLabel = w.direction === 'over' ? 'über' : 'unter';
    const balSign = w.balance >= 0 ? '+' : '';
    return `<li><strong>${escapeHtml(w.employer.name)}</strong> — ${basisLabel}: ${w.pct}\u00A0% ${directionLabel} Soll (${balSign}${minutesToHM(w.balance)}, Schwelle ${w.thresholdPct}\u00A0%)</li>`;
  }).join('');
}
