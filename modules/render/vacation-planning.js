// modules/render/vacation-planning.js
// Pure Builder für die Jahresübersicht der Urlaubsplanung (ein Arbeitgeber).
// Nimmt computeYearlyVacationPlanning-Ergebnis + computeVacationRemaining-Ergebnis
// + Kontext und liefert ein reines HTML-Fragment. Kein DOM-Zugriff, keine Seiteneffekte.
//
// ctx = {
//   escapeHtml,
//   renderSummaryHTML,
//   monthLabels,   // z.B. MONTH_LABELS_LONG aus modules/compute.js
// }

export function buildVacationPlanningHTML(vp, vr, emp, ctx) {
  const { escapeHtml, renderSummaryHTML, monthLabels } = ctx;
  const planned = vr.annual + vr.carryOver;

  const summaryFields = [
    { kind: 'count', label: `Jahresanspruch${vr.prorated ? ' (anteilig)' : ''}`, value: `${planned} Tage` },
    { kind: 'count', label: 'Bereits genommen', value: `${vp.totalTaken} Tage` },
    { kind: 'count', label: 'Eingegeben (Zukunft)', value: `${vp.totalUpcoming} Tage` },
    { kind: 'count', label: 'Noch nicht erfasst', value: `${vr.remaining} Tage` },
  ];

  const bodyRows = vp.months.map((m) => `
    <tr${(m.taken + m.upcoming) === 0 ? ' class="muted-row"' : ''}>
      <td data-label="Monat">${escapeHtml(monthLabels[m.month - 1])}</td>
      <td class="num" data-label="Genommen">${m.taken}</td>
      <td class="num" data-label="Eingegeben">${m.upcoming}</td>
      <td class="num" data-label="Summe">${m.taken + m.upcoming}</td>
    </tr>
  `).join('');

  const totalsRow = `
    <tr class="totals-row">
      <td data-label="Monat"><strong>Gesamt</strong></td>
      <td class="num" data-label="Genommen"><strong>${vp.totalTaken}</strong></td>
      <td class="num" data-label="Eingegeben"><strong>${vp.totalUpcoming}</strong></td>
      <td class="num" data-label="Summe"><strong>${vp.totalYear}</strong></td>
    </tr>
  `;

  return `
    <div class="report-header">
      <h3>Urlaubsplanung – ${escapeHtml(emp.name)}</h3>
      <div class="subtitle">Jahr ${escapeHtml(vp.year)}</div>
    </div>
    <div class="summary-grid">${renderSummaryHTML(summaryFields)}</div>
    <div class="report-table-wrap">
      <table class="report-table vacation-planning-table">
        <thead>
          <tr>
            <th>Monat</th>
            <th class="num">Genommen</th>
            <th class="num">Eingegeben</th>
            <th class="num">Summe</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
          ${totalsRow}
        </tbody>
      </table>
    </div>
  `;
}
