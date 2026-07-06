// modules/render/overview.js
// Pure Builder für die Monatsübersicht-HTML (alle Arbeitgeber/Kunden).
// Nimmt das computeMonthOverview-Ergebnis + Kontext und liefert ein reines HTML-Fragment.
// Kein DOM-Zugriff, keine Seiteneffekte.
//
// ctx = {
//   escapeHtml,
//   formatMonthYear,
//   minutesToHM,
//   formatMoney,
//   isFreelance,
//   getOverviewSummaryFields,
//   renderSummaryHTML,
// }

export function buildOverviewHTML(ov, ym, ctx) {
  const {
    escapeHtml,
    formatMonthYear,
    minutesToHM,
    formatMoney,
    isFreelance,
    getOverviewSummaryFields,
    renderSummaryHTML,
  } = ctx;

  // Employee-Layout, wenn mindestens ein Employer im Report Vertragsstunden hat.
  // Global-Fallback nur wenn keine Rows/Employers vorhanden.
  const empHasTarget = (emp) => {
    if (!emp) return false;
    return (Number(emp.weeklyHours) || 0) > 0 || (Number(emp.monthlyTargetHours) || 0) > 0 || (Number(emp.monthlyHours) || 0) > 0;
  };
  const anyEmpHasTarget = Array.isArray(ov.rows) && ov.rows.some(r => empHasTarget(r && r.employer));
  const freelanceMode = anyEmpHasTarget ? false : isFreelance();
  const empLabel = freelanceMode ? 'Kunde' : 'Arbeitgeber';

  const ovRowNetTotal = (row) => {
    const rate = Number(row.employer.hourlyRate) || 0;
    if (rate <= 0) return null;
    return { amount: (row.workedMin / 60) * rate, currency: row.employer.currency || 'EUR' };
  };

  // Summary-Grid nutzt zentralen Selector; Tabellen-Aggregat wird lokal berechnet
  const overviewSummaryFields = getOverviewSummaryFields(ov);
  const netField = overviewSummaryFields.find(f => f.key === 'net');
  const ovTotalsNetStr = netField ? netField.value : '—';

  const bodyRows = ov.rows.map(row => {
    if (freelanceMode) {
      const nt = ovRowNetTotal(row);
      return `
    <tr>
      <td data-label="${empLabel}">${escapeHtml(row.employer.name)}</td>
      <td class="num" data-label="Tage">${row.workEntriesCount}</td>
      <td class="num" data-label="Ist">${minutesToHM(row.workedMin)}</td>
      <td class="num" data-label="Rechnungsbetrag">${nt ? formatMoney(nt.amount, nt.currency) : '—'}</td>
    </tr>
  `;
    }
    // Employee-Layout: Zeile pro Employer. Freelance-Zeilen (kein Soll) zeigen "—" statt Soll/Saldo/Urlaub/Krank.
    const rowHasTarget = empHasTarget(row.employer);
    return `
    <tr>
      <td data-label="${empLabel}">${escapeHtml(row.employer.name)}</td>
      <td class="num" data-label="Tage">${row.workEntriesCount}</td>
      <td class="num" data-label="Ist">${minutesToHM(row.workedMin)}</td>
      <td class="num" data-label="Soll">${rowHasTarget ? minutesToHM(row.targetMin) : '—'}</td>
      <td class="num ${rowHasTarget ? (row.balance >= 0 ? 'pos' : 'neg') : ''}" data-label="Saldo">${rowHasTarget ? (row.balance >= 0 ? '+' : '') + minutesToHM(row.balance) : '—'}</td>
      <td class="num" data-label="Urlaub">${rowHasTarget ? row.vacationDays : '—'}</td>
      <td class="num" data-label="Krank">${rowHasTarget ? row.sickDays : '—'}</td>
    </tr>
  `;
  }).join('');

  const totalsRow = freelanceMode ? `
    <tr class="totals-row">
      <td data-label="${empLabel}"><strong>Gesamt</strong></td>
      <td class="num" data-label="Tage"><strong>${ov.totals.workEntriesCount}</strong></td>
      <td class="num" data-label="Ist"><strong>${minutesToHM(ov.totals.workedMin)}</strong></td>
      <td class="num" data-label="Rechnungsbetrag"><strong>${ovTotalsNetStr}</strong></td>
    </tr>
  ` : `
    <tr class="totals-row">
      <td data-label="${empLabel}"><strong>Gesamt</strong></td>
      <td class="num" data-label="Tage"><strong>${ov.totals.workEntriesCount}</strong></td>
      <td class="num" data-label="Ist"><strong>${minutesToHM(ov.totals.workedMin)}</strong></td>
      <td class="num" data-label="Soll"><strong>${minutesToHM(ov.totals.targetMin)}</strong></td>
      <td class="num ${ov.totals.balance >= 0 ? 'pos' : 'neg'}" data-label="Saldo"><strong>${ov.totals.balance >= 0 ? '+' : ''}${minutesToHM(ov.totals.balance)}</strong></td>
      <td class="num" data-label="Urlaub"><strong>${ov.totals.vacationDays}</strong></td>
      <td class="num" data-label="Krank"><strong>${ov.totals.sickDays}</strong></td>
    </tr>
  `;

  const summaryGrid = `<div class="summary-grid">${renderSummaryHTML(overviewSummaryFields)}</div>`;

  const tableHead = freelanceMode ? `
          <tr>
            <th>${empLabel}</th>
            <th class="num">Tage</th>
            <th class="num">Ist</th>
            <th class="num">Rechnungsbetrag</th>
          </tr>
  ` : `
          <tr>
            <th>${empLabel}</th>
            <th class="num">Tage</th>
            <th class="num">Ist</th>
            <th class="num">Soll</th>
            <th class="num">Saldo</th>
            <th class="num">Urlaub</th>
            <th class="num">Krank</th>
          </tr>
  `;

  const overviewTitle = freelanceMode ? 'Monatsübersicht – alle Kunden' : 'Monatsübersicht – alle Arbeitgeber';

  return `
    <div class="report-header">
      <h3>${overviewTitle}</h3>
      <div class="subtitle">${formatMonthYear(ym)}</div>
    </div>
    ${summaryGrid}
    <div class="report-table-wrap">
      <table class="report-table overview-table">
        <thead>
          ${tableHead}
        </thead>
        <tbody>
          ${bodyRows}
          ${totalsRow}
        </tbody>
      </table>
    </div>
  `;
}
