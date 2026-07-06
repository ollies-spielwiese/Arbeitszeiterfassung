// modules/render/tracker.js
// Pure Builder für Tracker-bezogene HTML-Fragmente:
//   - buildTodaySummaryHTML: Monatszusammenfassung unter dem Tracker
//   - buildHomeofficeSegmentsHTML: Segment-Zeilen im Home-Office-Modal
//
// Kein DOM-Zugriff, keine Seiteneffekte.
//
// ctx (buildTodaySummaryHTML) = {
//   formatMonthYear,
//   renderSummaryHTML,
// }

export function buildTodaySummaryHTML(data, ctx) {
  const { formatMonthYear, renderSummaryHTML } = ctx;
  const { ym, summaryFields } = data;
  return `
    <h3>Diesen Monat (${formatMonthYear(ym)})</h3>
    <div class="summary-grid">
      ${renderSummaryHTML(summaryFields)}
    </div>
  `;
}

export function buildHomeofficeSegmentsHTML(segs) {
  const rows = (segs && segs.length ? segs : [{ start: '', end: '' }]);
  return rows.map((s, idx) => `
    <div class="ho-segment-row" data-idx="${idx}">
      <span class="ho-segment-label">${idx + 1}.</span>
      <input type="time" data-seg-start value="${s.start || ''}" aria-label="Beginn Block ${idx + 1}" data-testid="input-ho-start-${idx}" />
      <span class="ho-segment-sep">–</span>
      <input type="time" data-seg-end value="${s.end || ''}" aria-label="Ende Block ${idx + 1}" data-testid="input-ho-end-${idx}" />
      <button type="button" class="btn-icon" data-remove-segment="${idx}" aria-label="Block entfernen" data-testid="button-remove-ho-segment-${idx}">✕</button>
    </div>
  `).join('');
}
