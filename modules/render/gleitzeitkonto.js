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
 * @param {GleitzeitkontoRow[]} rows Chronologisch aufsteigend (ältester Monat zuerst)
 * @param {any} emp
 * @param {{escapeHtml:(s:string)=>string, minutesToHM:(m:number)=>string, formatMonthYear:(ym:string)=>string, renderSummaryHTML:(fields:any[])=>string}} ctx
 * @returns {string}
 */
export function buildGleitzeitkontoHTML(rows, emp, ctx) {
  const { escapeHtml, minutesToHM, formatMonthYear, renderSummaryHTML } = ctx;

  if (!rows || !rows.length) {
    return `<div class="empty-state">Keine Daten für den gewählten Zeitraum.</div>`;
  }

  const last = rows[rows.length - 1];
  const first = rows[0];
  const totalWorked = rows.reduce((s, r) => s + r.workedMin, 0);
  const totalTarget = rows.reduce((s, r) => s + r.targetMin, 0);

  const summaryFields = [
    { kind: 'count', label: 'Zeitraum', value: `${formatMonthYear(first.ym)} – ${formatMonthYear(last.ym)}` },
    { kind: 'balance', label: 'Aktueller Gleitzeitsaldo', sign: last.cumulativeBalance >= 0 ? 'pos' : 'neg', valueHM: minutesToHM(last.cumulativeBalance) },
    { kind: 'time', label: 'Ist gesamt', valueHM: minutesToHM(totalWorked) },
    { kind: 'time', label: 'Soll gesamt', valueHM: minutesToHM(totalTarget) },
  ];

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

  return `
    <div class="report-header">
      <h3>Gleitzeitkonto – ${escapeHtml(emp.name)}</h3>
      <div class="subtitle">Kumulierter Saldoverlauf über ${rows.length} ${rows.length === 1 ? 'Monat' : 'Monate'}</div>
    </div>
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
