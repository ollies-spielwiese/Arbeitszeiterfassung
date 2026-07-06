// modules/render/entries.js
// Reiner HTML-Builder für die Einträge-Liste (Präsenz, Home-Office, Urlaub, Krank).
// Phase 4.8 — Compute wandert komplett nach selectors.computeEntryRows.
// Renderer erwartet vor-berechnete Row-Objekte und macht nur noch DOM/HTML.
//
// ctx = {
//   escapeHtml,
//   formatDateLong,
//   minutesToHM,
// }

const BADGE_LABELS = {
  overtime: 'Überstunden',
  homeoffice: 'Home-Office',
  vacation: 'Urlaub',
  sick: 'Krank',
};

function renderRight(row, ctx) {
  const { minutesToHM } = ctx;
  if (row.rightKind === 'hours') {
    const overtimeClass = row.isOvertime ? ' overtime' : '';
    return `<span class="entry-hours${overtimeClass}">${minutesToHM(row.rightValueMin)}</span>`;
  }
  if (row.rightKind === 'absence-vacation') {
    return `<span class="entry-hours absence">Urlaub</span>`;
  }
  if (row.rightKind === 'absence-sick') {
    return `<span class="entry-hours absence">Krank</span>`;
  }
  return '';
}

function renderBadge(row) {
  if (!row.badgeType) return '';
  const label = BADGE_LABELS[row.badgeType] || '';
  return `<span class="entry-badge ${row.badgeType}">${label}</span>`;
}

/**
 * @param {Array<any>} rows — von computeEntryRows erzeugt
 * @param {{escapeHtml:(s:string)=>string, formatDateLong:(iso:string)=>string,
 *          minutesToHM:(min:number)=>string}} ctx
 */
export function buildEntriesHTML(rows, ctx) {
  const { escapeHtml, formatDateLong } = ctx;
  return rows.map((row) => {
    const right = renderRight(row, ctx);
    const badge = renderBadge(row);
    const details = row.detailsParts.map(escapeHtml).join(' • ');
    const note = row.note ? `<div class="entry-note">${escapeHtml(row.note)}</div>` : '';
    return `
      <div class="entry-card" style="border-left-color: ${row.color}" data-id="${row.id}" data-testid="entry-${row.id}">
        <div class="entry-header">
          <div class="entry-date">${formatDateLong(row.date)}${badge}</div>
          ${right}
        </div>
        <div class="entry-details">${details}</div>
        ${note}
      </div>
    `;
  }).join('');
}
