// modules/render/gleitzeitkonto.js
// Pure Builder für die Gleitzeitkonto-Ansicht (kumulierter Überstundenverlauf über mehrere
// Monate, seit v3.9.47). Kein DOM-Zugriff, keine Seiteneffekte — reiner HTML-Builder,
// analog zu modules/render/vacation-planning.js.
//
// ctx = {
//   escapeHtml,
//   minutesToHM,       // Minuten -> 'HH:MM' bzw. '-HH:MM'
//   formatMonthYear,   // 'YYYY-MM' -> 'Juli 2026'
//   renderSummaryHTML, // aus modules/render/summary.js
// }

/**
 * @typedef {Object} GleitzeitkontoRow
 * @property {string} ym 'YYYY-MM'
 * @property {number} workedMin Ist-Minuten des Monats
 * @property {number} targetMin Soll-Minuten des Monats
 * @property {number} balance Saldo des Monats (Ist − Soll, inkl. angerechneter Abwesenheiten)
 * @property {number} cumulativeBalance Laufender Saldo bis inkl. diesem Monat
 */

/**
 * @param {GleitzeitkontoRow[]} rows Chronologisch aufsteigend (ältester Monat zuerst), bereits
 *   auf das gewählte Kalenderjahr begrenzt (siehe computeGleitzeitkontoRows in modules/compute.js)
 * @param {any} emp
 * @param {{escapeHtml:(s:string)=>string, minutesToHM:(m:number)=>string, formatMonthYear:(ym:string)=>string, renderSummaryHTML:(fields:any[])=>string}} ctx
 * @param {{year?: number, effectiveStartYm?: string, effectiveEndYm?: string, hiredAfterYear?: boolean, endedBeforeYear?: boolean}} [meta] seit v3.9.48
 *   (Endgrenze "Beschäftigt bis" seit v3.9.55): Metadaten aus computeGleitzeitkontoRows, um
 *   Hinweise zu "Angestellt seit"/"Beschäftigt bis"/fehlenden Daten anzuzeigen (siehe
 *   RELEASE.md → "Gleitzeitkonto: Kalenderjahr statt rollierendem Zeitraum").
 * @returns {string}
 */
export function buildGleitzeitkontoHTML(rows, emp, ctx, meta) {
  const { escapeHtml, minutesToHM, formatMonthYear, renderSummaryHTML } = ctx;
  const { year, effectiveStartYm, effectiveEndYm, hiredAfterYear, endedBeforeYear } = meta || {};

  if (!rows || !rows.length) {
    if (hiredAfterYear) {
      return `<div class="empty-state">Du warst im Jahr ${escapeHtml(String(year))} bei diesem Arbeitgeber noch nicht angestellt${effectiveStartYm ? ` (angestellt seit ${escapeHtml(formatMonthYear(effectiveStartYm))})` : ''}.</div>`;
    }
    if (endedBeforeYear) {
      return `<div class="empty-state">Die Beschäftigung bei diesem Arbeitgeber war im Jahr ${escapeHtml(String(year))} bereits beendet${effectiveEndYm ? ` (beschäftigt bis ${escapeHtml(formatMonthYear(effectiveEndYm))})` : ''}.</div>`;
    }
    return `<div class="empty-state">Keine Daten für den gewählten Zeitraum.</div>`;
  }

  const last = rows[rows.length - 1];
  const first = rows[0];
  const totalWorked = rows.reduce((s, r) => s + r.workedMin, 0);
  const totalTarget = rows.reduce((s, r) => s + r.targetMin, 0);
  const yearStartYm = year ? `${year}-01` : null;
  const yearEndYm = year ? `${year}-12` : null;
  const truncatedByHire = !!(effectiveStartYm && yearStartYm && effectiveStartYm > yearStartYm);
  const truncatedByEnd = !!(effectiveEndYm && yearEndYm && effectiveEndYm < yearEndYm);

  const summaryFields = [
    { kind: 'count', label: 'Zeitraum', value: `${formatMonthYear(first.ym)} – ${formatMonthYear(last.ym)}` },
    { kind: 'balance', label: 'Aktueller Gleitzeitsaldo', sign: last.cumulativeBalance >= 0 ? 'pos' : 'neg', valueHM: minutesToHM(last.cumulativeBalance) },
    { kind: 'time', label: 'Ist gesamt', valueHM: minutesToHM(totalWorked) },
    { kind: 'time', label: 'Soll gesamt', valueHM: minutesToHM(totalTarget) },
  ];
  const hireHintParts = [];
  if (truncatedByHire) hireHintParts.push(`Der Verlauf beginnt erst ab ${escapeHtml(formatMonthYear(effectiveStartYm))}, da du davor noch nicht bei diesem Arbeitgeber angestellt warst.`);
  if (truncatedByEnd) hireHintParts.push(`Der Verlauf endet mit ${escapeHtml(formatMonthYear(effectiveEndYm))}, da die Beschäftigung zu diesem Zeitpunkt endete.`);
  const hireHintHTML = hireHintParts.length
    ? `<div class="hint-banner">Hinweis: ${hireHintParts.join(' ')} Der kumulierte Saldo läuft über Jahresgrenzen hinweg durch.</div>`
    : '';

  const bodyRows = rows.map((r) => {
    const balanceClass = r.balance < 0 ? 'neg' : (r.balance > 0 ? 'pos' : '');
    const cumulativeClass = r.cumulativeBalance < 0 ? 'neg' : (r.cumulativeBalance > 0 ? 'pos' : '');
    return `
    <tr>
      <td data-label="Monat">${escapeHtml(formatMonthYear(r.ym))}</td>
      <td class="num" data-label="Ist">${minutesToHM(r.workedMin)}</td>
      <td class="num" data-label="Soll">${minutesToHM(r.targetMin)}</td>
      <td class="num ${balanceClass}" data-label="Saldo (Monat)">${minutesToHM(r.balance)}</td>
      <td class="num ${cumulativeClass}" data-label="Saldo (kumuliert)"><strong>${minutesToHM(r.cumulativeBalance)}</strong></td>
    </tr>
  `;
  }).join('');

  const subtitle = year
    ? `Kumulierter Saldoverlauf, Kalenderjahr ${escapeHtml(String(year))}`
    : `Kumulierter Saldoverlauf über ${rows.length} ${rows.length === 1 ? 'Monat' : 'Monate'}`;

  return `
    <div class="report-header">
      <h3>Gleitzeitkonto – ${escapeHtml(emp.name)}${year ? ` (${escapeHtml(String(year))})` : ''}</h3>
      <div class="subtitle">${subtitle}</div>
    </div>
    ${hireHintHTML}
    <div class="summary-grid">${renderSummaryHTML(summaryFields)}</div>
    <div class="report-table-wrap">
      <table class="report-table gleitzeitkonto-table">
        <thead>
          <tr>
            <th>Monat</th>
            <th class="num">Ist</th>
            <th class="num">Soll</th>
            <th class="num">Saldo (Monat)</th>
            <th class="num">Saldo (kumuliert)</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
  `;
}
