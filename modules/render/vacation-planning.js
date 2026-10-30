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
  // Abgeltung bei Austritt (seit v3.9.99): ausbezahlte Urlaubstage als eigene Kachel vor
  // „Noch nicht erfasst“ — sie mindern den Resturlaub, zählen aber nicht als genommen.
  if (vr.payoutDays > 0) {
    summaryFields.splice(3, 0, { kind: 'count', label: 'Ausbezahlt bei Austritt', value: `${String(vr.payoutDays).replace('.', ',')} ${vr.payoutDays === 1 ? 'Tag' : 'Tage'}` });
  }
  const fmt = (/** @type {string} */ d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  const endDate = (typeof emp.employmentEndDate === 'string' && emp.employmentEndDate.length >= 10) ? emp.employmentEndDate : '';
  const hints = [];
  if (vr.payoutExceeds) {
    hints.push(`Die ausbezahlten Urlaubstage (${String(vr.payoutDays).replace('.', ',')}) übersteigen den offenen Resturlaub (${Math.max(0, vr.annual + vr.carryOver - vr.taken)}). Bitte die Angaben beim Arbeitgeber mit der Lohnabrechnung abgleichen.`);
  }
  if (vp.afterEndDates && vp.afterEndDates.length) {
    const n = vp.afterEndDates.length;
    hints.push(`${n} ${n === 1 ? 'Urlaubseintrag liegt' : 'Urlaubseinträge liegen'} nach dem Beschäftigungsende (${escapeHtml(fmt(endDate))}) und ${n === 1 ? 'wird' : 'werden'} nicht gezählt: ${vp.afterEndDates.map(d => escapeHtml(fmt(d))).join(', ')}. Bitte im Reiter „Einträge“ löschen oder einem anderen Arbeitgeber zuordnen.`);
  }
  if (vr.afterEmployment && endDate) {
    hints.push(`Die Beschäftigung endete am ${escapeHtml(fmt(endDate))}. Für ${escapeHtml(vp.year)} besteht bei diesem Arbeitgeber kein Urlaubsanspruch mehr.`);
  }
  const hintsHTML = hints.map(h => `<div class="hint-banner" data-testid="vacation-planning-hint">Hinweis: ${h}</div>`).join('');
  // Urlaubsbescheinigung (§ 6 Abs. 2 BUrlG, seit v3.9.99) im Jahr des Beschäftigungsendes.
  const certHTML = (endDate && endDate.slice(0, 4) === String(vp.year) && emp.kind !== 'client')
    ? `<div class="report-actions vacation-cert-actions"><button id="btn-export-vacation-certificate" class="btn-primary" data-testid="button-export-vacation-certificate">📕 Urlaubsbescheinigung (PDF)</button></div>`
    : '';

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
    ${hintsHTML}
    <div class="summary-grid">${renderSummaryHTML(summaryFields)}</div>
    ${certHTML}
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
  return `${String(n).replace('.', ',')} ${n === 1 ? 'Tag' : 'Tage'}`;
}

function monateLabel(n) {
  return `${n} ${n === 1 ? 'Monat' : 'Monaten'}`;
}

/**
 * Block "Bildungsurlaub <Jahr bzw. Zeitraum>" der Urlaubsplanung (seit v3.9.97, Bundeslaender
 * seit v3.11.0). Rein, ohne DOM-Zugriff.
 * @param {ReturnType<typeof import('../compute.js').computeEducationLeaveYear>} el
 * @param {{escapeHtml:(s:string)=>string, renderSummaryHTML:(fields:any[])=>string}} ctx
 */
export function buildEducationLeaveBlockHTML(el, ctx) {
  const { escapeHtml, renderSummaryHTML } = ctx;
  const label = el.periodLabel || el.year;
  const fields = [
    { kind: 'count', label: `Anspruch ${label}`, value: tageLabel(el.entitlement) },
    { kind: 'count', label: 'Bereits genommen', value: tageLabel(el.taken) },
    { kind: 'count', label: 'Eingegeben (Zukunft)', value: tageLabel(el.upcoming) },
    { kind: 'count', label: 'Noch verfügbar', value: tageLabel(el.remaining) },
  ];
  const notes = [];
  let subtitle;
  if (el.override) {
    subtitle = 'Abweichender Anspruch laut Arbeitgeber, eigenes Kontingent – zählt nicht zum Urlaubsanspruch';
    notes.push(`Anspruch: ${tageLabel(el.entitlement)} ${el.biennial ? `im Zeitraum ${escapeHtml(label)}` : 'pro Kalenderjahr'} (abweichender Anspruch beim Arbeitgeber).`);
  } else if (el.noLaw) {
    subtitle = 'Kein Bildungsurlaubsgesetz in diesem Bundesland';
    const ab = el.firstYear && el.firstYear > Number(el.year) ? ` Ein Gesetz gilt erst ab ${el.firstYear}.` : '';
    notes.push(`Für dieses Bundesland gibt es im Jahr ${escapeHtml(el.year)} kein Bildungsurlaubsgesetz.${ab} Einen Anspruch aus Tarif- oder Arbeitsvertrag kannst du beim Arbeitgeber unter „Abweichender Bildungsurlaub-Anspruch“ eintragen.`);
  } else {
    subtitle = `${escapeHtml(el.lawLong)}, eigenes Kontingent – zählt nicht zum Urlaubsanspruch`;
    const per = el.biennial ? `in 2 Kalenderjahren (Zeitraum ${escapeHtml(label)})` : (el.halfYear ? 'in 2 Kalenderjahren' : 'pro Kalenderjahr');
    const half = el.halfYear ? ' Eintritt im geraden Jahr: in diesem Jahr die Hälfte.' : '';
    notes.push(el.workdaysPerWeek === 5
      ? `Anspruch: ${tageLabel(el.ruleDays)} ${per} bei 5-Tage-Woche (bei anderer Verteilung anteilig).${half}`
      : `Anspruch: ${tageLabel(el.entitlement)} ${per} (anteilig bei ${el.workdaysPerWeek}-Tage-Woche).${half}`);
    const wait = monateLabel(el.waitMonths);
    if (el.notEligible) {
      notes.push(`Wartezeit: Der Anspruch entsteht erst nach ${wait} Beschäftigung (ab ${escapeHtml(fmtDE(el.eligibleFrom || ''))}) und besteht in diesem Zeitraum daher nicht.`);
    } else if (el.eligibleFrom && el.eligibleFrom >= `${el.periodStart}-01-01`) {
      notes.push(`Wartezeit: Anspruch erst ab ${escapeHtml(fmtDE(el.eligibleFrom))} (${el.waitMonths} ${el.waitMonths === 1 ? 'Monat' : 'Monate'} nach Beschäftigungsbeginn).`);
    } else {
      notes.push(`Erst nach ${wait} Beschäftigung (Wartezeit).`);
    }
    if (el.ruleNote) notes.push(escapeHtml(el.ruleNote));
  }
  const warn = el.exceeded
    ? `<p class="hint education-leave-warning" role="status">Achtung: ${tageLabel(el.total)} erfasst, Anspruch ${tageLabel(el.entitlement)}. Bitte die Einträge prüfen.</p>`
    : '';
  return `
    <div class="education-leave-block" data-testid="education-leave-block">
      <div class="report-header">
        <h3>Bildungsurlaub ${escapeHtml(label)}</h3>
        <div class="subtitle">${subtitle}</div>
      </div>
      <div class="summary-grid">${renderSummaryHTML(fields)}</div>
      ${warn}
      <p class="hint">${notes.join(' ')}</p>
    </div>
  `;
}
