// @ts-check
/**
 * modules/ui/year-select.js (seit v3.15.3, Roadmap 3 Stufe 2)
 *
 * Jahresauswahl der Reiter Urlaubsplanung und Gleitzeitkonto. Zur Auswahl stehen
 * alle Jahre mit Einträgen oder mit einer Beschäftigung (Beginn, Ende), dazu das
 * laufende und das kommende Jahr, absteigend sortiert.
 */

/**
 * Reine Funktion, ohne Browser testbar.
 * @param {{employers?:Array<any>, entries?:Array<any>}} state
 * @param {number} [nowYear] laufendes Jahr (Standard: Systemuhr)
 * @returns {number[]} Jahre absteigend, begrenzt auf 1900–2100
 */
export function computeSelectableYears(state, nowYear = new Date().getFullYear()) {
  const years = new Set([nowYear, nowYear + 1]);
  ((state && state.employers) || []).forEach((e) => {
    if (e.hiredSince) years.add(parseInt(String(e.hiredSince).slice(0, 4), 10));
    if (e.employmentEndDate) years.add(parseInt(String(e.employmentEndDate).slice(0, 4), 10));
  });
  ((state && state.entries) || []).forEach((e) => {
    if (e.date) years.add(parseInt(String(e.date).slice(0, 4), 10));
  });
  return [...years]
    .filter((y) => Number.isFinite(y) && y >= 1900 && y <= 2100)
    .sort((a, b) => b - a);
}

/**
 * Befüllt ein Jahr-<select> und wählt `selectedYear` aus. Fehlt das Jahr in den
 * Daten, wird es ergänzt.
 * @param {HTMLSelectElement} selectEl
 * @param {number} selectedYear
 * @param {{employers?:Array<any>, entries?:Array<any>}} state
 * @param {number} [nowYear]
 */
export function populateYearSelect(selectEl, selectedYear, state, nowYear) {
  const years = computeSelectableYears(state, nowYear);
  if (!years.includes(selectedYear)) {
    years.push(selectedYear);
    years.sort((a, b) => b - a);
  }
  selectEl.innerHTML = years.map((y) => `<option value="${y}"${y === selectedYear ? ' selected' : ''}>${y}</option>`).join('');
}
