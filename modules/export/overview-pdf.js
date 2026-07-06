// modules/export/overview-pdf.js
// Pure PDF-Export für die Monatsübersicht (alle Arbeitgeber/Kunden).
// Kein DOM-Zugriff, keine globalen Abhängigkeiten - alles über ctx.
//
// ctx = {
//   jsPDF, state,
//   formatMonthYear, minutesToHM, formatMoney, isFreelance,
// }

function wrapText(doc, text, x, y, maxWidth) {
  const split = doc.splitTextToSize(text, maxWidth);
  doc.text(split, x, y);
  return y + split.length * 5;
}

export function generateOverviewPdfBlob(ov, ctx) {
  const {
    jsPDF, state,
    formatMonthYear, minutesToHM, formatMoney, isFreelance,
  } = ctx;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 15;
  let y = 20;

  const ovFreelance = isFreelance();
  const ovEmpLabel = ovFreelance ? 'Kunde' : 'Arbeitgeber';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(ovFreelance ? 'Monatsübersicht – alle Kunden' : 'Monatsübersicht – alle Arbeitgeber', marginX, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(formatMonthYear(ov.ym), marginX, y);
  y += 6;

  const empName = (state.settings.employeeName || '').trim();
  if (empName) {
    doc.setFontSize(10);
    const label = 'Arbeitnehmer/in: ';
    doc.setFont('helvetica', 'bold');
    const labelWidth = doc.getTextWidth(label);
    doc.text(label, marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(empName, marginX + labelWidth + 1, y);
    y += 6;
  }

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, marginX, y);
  doc.setTextColor(0);
  y += 8;

  if (!ov.rows.length) {
    doc.setFontSize(11);
    doc.text('Keine Einträge für diesen Monat.', marginX, y);
    return doc.output('blob');
  }

  let body, totalsRow, head, columnStyles, legend;
  if (ovFreelance) {
    const rowNet = (row) => {
      const rate = Number(row.employer.hourlyRate) || 0;
      if (rate <= 0) return '—';
      return formatMoney((row.workedMin / 60) * rate, row.employer.currency || 'EUR');
    };
    const totalsNet = ov.rows.reduce((acc, row) => {
      const rate = Number(row.employer.hourlyRate) || 0;
      if (rate <= 0) return acc;
      const cur = row.employer.currency || 'EUR';
      acc[cur] = (acc[cur] || 0) + (row.workedMin / 60) * rate;
      return acc;
    }, {});
    const totalsNetStr = Object.keys(totalsNet).length
      ? Object.entries(totalsNet).map(([cur, amt]) => formatMoney(amt, cur)).join(' · ')
      : '—';
    body = ov.rows.map(row => [
      row.employer.name,
      String(row.workEntriesCount),
      minutesToHM(row.workedMin),
      rowNet(row),
    ]);
    totalsRow = [
      'Gesamt',
      String(ov.totals.workEntriesCount),
      minutesToHM(ov.totals.workedMin),
      totalsNetStr,
    ];
    head = [[ovEmpLabel, 'Tage', 'Ist', 'Rechnungsbetrag']];
    columnStyles = {
      0: { cellWidth: 70 },
      1: { cellWidth: 20 },
      2: { cellWidth: 30 },
      3: { cellWidth: 60 },
    };
    legend = 'Ist = geleistete Arbeitszeit. Rechnungsbetrag = Ist × Stundensatz. Freelance-Modus: kein Soll/Saldo.';
  } else {
    body = ov.rows.map(row => [
      row.employer.name,
      String(row.workEntriesCount),
      minutesToHM(row.workedMin),
      minutesToHM(row.targetMin),
      `${row.balance >= 0 ? '+' : ''}${minutesToHM(row.balance)}`,
      String(row.vacationDays),
      String(row.sickDays),
    ]);
    totalsRow = [
      'Gesamt',
      String(ov.totals.workEntriesCount),
      minutesToHM(ov.totals.workedMin),
      minutesToHM(ov.totals.targetMin),
      `${ov.totals.balance >= 0 ? '+' : ''}${minutesToHM(ov.totals.balance)}`,
      String(ov.totals.vacationDays),
      String(ov.totals.sickDays),
    ];
    head = [[ovEmpLabel, 'Tage', 'Ist', 'Soll', 'Saldo', 'Urlaub', 'Krank']];
    columnStyles = {
      0: { cellWidth: 60 },
      1: { cellWidth: 16 },
      2: { cellWidth: 22 },
      3: { cellWidth: 22 },
      4: { cellWidth: 22 },
      5: { cellWidth: 18 },
      6: { cellWidth: 18 },
    };
    legend = 'Ist = geleistete Arbeitszeit. Soll = vertragliche Sollstunden inkl. Werktags- und Feiertagsberechnung. Saldo = Ist + gutgeschriebene Abwesenheiten - Soll.';
  }

  doc.autoTable({
    startY: y,
    head,
    body,
    foot: [totalsRow],
    styles: { fontSize: 10, cellPadding: 2.5, overflow: 'linebreak', halign: 'left' },
    headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold', halign: 'left' },
    footStyles: { fillColor: [226, 232, 240], textColor: 30, fontStyle: 'bold', halign: 'left' },
    columnStyles,
    margin: { left: marginX, right: marginX },
  });

  y = doc.lastAutoTable.finalY + 10;

  doc.setFontSize(9);
  doc.setTextColor(90);
  y = wrapText(doc, legend, marginX, y, 180);
  doc.setTextColor(0);

  return doc.output('blob');
}
