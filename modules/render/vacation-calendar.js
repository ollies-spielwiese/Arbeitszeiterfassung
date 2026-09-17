// modules/render/vacation-calendar.js
// Pure Builder für das Monats-Kalendergitter der Urlaubsplanung (seit v3.9.86).
// Nimmt computeVacationCalendarMonth-Ergebnis + Monatslabel + Navigations-Flags und
// liefert ein reines HTML-Fragment. Kein DOM-Zugriff, keine Seiteneffekte.
//
// ctx = {
//   escapeHtml,
//   monthLabel,     // z.B. "Januar 2027" (bereits fertig formatiert)
// }

/**
 * @param {{ym:string, days:Array<{date:string, day:number, dow:number, isWeekend:boolean, vacation:('taken'|'upcoming'|null), holidayName:(string|null)}>}} calendarMonth
 * @param {{escapeHtml:(s:string)=>string, monthLabel:string}} ctx
 * @returns {string}
 */
export function buildVacationCalendarHTML(calendarMonth, ctx) {
  const { escapeHtml, monthLabel } = ctx;
  const { days } = calendarMonth;

  // Fuehrende Luecken bis zum ersten Wochentag (dow: 0=Mo..6=So).
  const leadingBlanks = days.length ? days[0].dow : 0;
  const blankCells = Array.from({ length: leadingBlanks }, () => '<div class="vac-cal-cell vac-cal-blank"></div>').join('');

  const dayCells = days.map((d) => {
    const classes = ['vac-cal-cell'];
    let titleAttr = '';
    if (d.holidayName) {
      classes.push('vac-cal-holiday');
      titleAttr = ` title="${escapeHtml(d.holidayName)}"`;
    } else if (d.vacation === 'taken') {
      classes.push('vac-cal-taken');
      titleAttr = ' title="Urlaub (genommen)"';
    } else if (d.vacation === 'upcoming') {
      classes.push('vac-cal-upcoming');
      titleAttr = ' title="Urlaub (eingegeben)"';
    } else if (d.isWeekend) {
      classes.push('vac-cal-weekend');
    }
    return `<div class="${classes.join(' ')}"${titleAttr}>${d.day}</div>`;
  }).join('');

  return `
    <div class="vacation-calendar">
      <div class="vac-cal-nav">
        <button type="button" id="btn-vacation-calendar-prev" class="vac-cal-nav-btn" aria-label="Vorheriger Monat">‹</button>
        <span class="vac-cal-month-label">${escapeHtml(monthLabel)}</span>
        <button type="button" id="btn-vacation-calendar-next" class="vac-cal-nav-btn" aria-label="Nächster Monat">›</button>
      </div>
      <div class="vac-cal-weekdays">
        <div>Mo</div><div>Di</div><div>Mi</div><div>Do</div><div>Fr</div><div>Sa</div><div>So</div>
      </div>
      <div class="vac-cal-grid">
        ${blankCells}${dayCells}
      </div>
      <div class="vac-cal-legend">
        <span><span class="vac-cal-swatch vac-cal-taken"></span>Genommen</span>
        <span><span class="vac-cal-swatch vac-cal-upcoming"></span>Eingegeben</span>
        <span><span class="vac-cal-swatch vac-cal-holiday"></span>Feiertag</span>
        <span><span class="vac-cal-swatch vac-cal-weekend"></span>Wochenende</span>
      </div>
    </div>
  `;
}
