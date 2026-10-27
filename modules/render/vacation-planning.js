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
  const { escapeHtml, renderSummaryHTML, monthLabels, calendarHTML, educationLeave } = ctx;
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
    ${educationLeave ? buildEducationLeaveBlockHTML(educationLeave, { escapeHtml, renderSummaryHTML }) : ''}
    ${calendarHTML || ''}
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

function fmtDE(iso) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

function tageLabel(n) {
  return `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
}

/**
 * Block "Bildungsurlaub <Jahr>" der Urlaubsplanung (seit v3.9.97). Rein, ohne DOM-Zugriff.
 * @param {ReturnType<typeof import('../compute.js').computeEducationLeaveYear>} el
 * @param {{escapeHtml:(s:string)=>string, renderSummaryHTML:(fields:any[])=>string}} ctx
 */
export function buildEducationLeaveBlockHTML(el, ctx) {
  const { escapeHtml, renderSummaryHTML } = ctx;
  const fields = [
    { kind: 'count', label: `Anspruch ${el.year}`, value: tageLabel(el.entitlement) },
    { kind: 'count', label: 'Bereits genommen', value: tageLabel(el.taken) },
    { kind: 'count', label: 'Eingegeben (Zukunft)', value: tageLabel(el.upcoming) },
    { kind: 'count', label: 'Noch verfügbar', value: tageLabel(el.remaining) },
  ];
  const basis = el.workdaysPerWeek === 5
    ? 'Anspruch: 5 Arbeitstage pro Kalenderjahr bei 5-Tage-Woche (bei anderer Verteilung anteilig).'
    : `Anspruch: ${el.workdaysPerWeek} Arbeitstage pro Kalenderjahr (anteilig bei ${el.workdaysPerWeek}-Tage-Woche).`;
  const notes = [basis];
  if (el.notEligible) {
    notes.push(`Wartezeit: Der Anspruch entsteht erst nach 6 Monaten Beschäftigung (ab ${escapeHtml(fmtDE(el.eligibleFrom || ''))}) und besteht in diesem Jahr daher nicht.`);
  } else if (el.eligibleFrom && el.eligibleFrom.startsWith(el.year)) {
    notes.push(`Wartezeit: Anspruch erst ab ${escapeHtml(fmtDE(el.eligibleFrom))} (6 Monate nach Beschäftigungsbeginn).`);
  } else {
    notes.push('Erst nach 6 Monaten Beschäftigung (Wartezeit).');
  }
  const warn = el.exceeded
    ? `<p class="hint education-leave-warning" role="status">Achtung: ${tageLabel(el.total)} erfasst, Anspruch ${tageLabel(el.entitlement)}. Bitte die Einträge prüfen.</p>`
    : '';
  return `
    <div class="education-leave-block" data-testid="education-leave-block">
      <div class="report-header">
        <h3>Bildungsurlaub ${escapeHtml(el.year)}</h3>
        <div class="subtitle">Hessisches Bildungsurlaubsgesetz (HBUG), eigenes Kontingent – zählt nicht zum Urlaubsanspruch</div>
      </div>
      <div class="summary-grid">${renderSummaryHTML(fields)}</div>
      ${warn}
      <p class="hint">${notes.join(' ')}</p>
    </div>
  `;
}
