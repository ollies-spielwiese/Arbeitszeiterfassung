// modules/render/week.js
// Pure Builder für die Wochenansicht.
// Der aufrufende Code (app.js) berechnet dayRows-Modelle und weekFields und
// reicht sie hier durch; das Modul erzeugt daraus reines HTML.
//
// ctx = {
//   escapeHtml,
//   formatDate,
//   minutesToHM,
//   renderSummaryHTML,
//   DAY_LABELS_LONG,
// }
//
// data = {
//   emp: { name },
//   isoWeek: 'YYYY-Www',
//   dates: [dateISO, ..., 7 Einträge],
//   dayModels: [{ workMin, hoursDisplay, detail, isToday, holiday }] (7 Einträge),
//   weekFields: SummaryFields[],
// }

export function buildWeekHTML(data, ctx) {
  const { escapeHtml, formatDate, renderSummaryHTML, DAY_LABELS_LONG } = ctx;
  const { emp, isoWeek, dates, dayModels, weekFields } = data;

  const dayRows = dayModels.map((dm, idx) => `
      <div class="week-day-card ${dm.isToday ? 'today' : ''}">
        <div>
          <div class="day-name">${DAY_LABELS_LONG[idx]}, ${formatDate(dates[idx])}${dm.holiday ? `<span class="holiday-badge">${escapeHtml(dm.holiday.name)}</span>` : ''}</div>
          <div class="day-detail">${dm.detail || '—'}</div>
        </div>
        <div class="day-hours">${dm.hoursDisplay}</div>
      </div>
    `).join('');

  return `
    <div class="report-header">
      <h3>${escapeHtml(emp.name)}</h3>
      <div class="subtitle">${isoWeek} • ${formatDate(dates[0])} – ${formatDate(dates[6])}</div>
    </div>
    <div class="summary-grid">
      ${renderSummaryHTML(weekFields)}
    </div>
    ${dayRows}
  `;
}
