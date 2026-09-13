// modules/export/overview-pdf.js
// Pure PDF-Export für die Monatsübersicht (alle Arbeitgeber/Kunden).
// Kein DOM-Zugriff, keine globalen Abhängigkeiten - alles über ctx.
//
// ctx = {
//   jsPDF, state,
//   formatMonthYear, minutesToHM, formatMoney, isFreelance,
//   formatEmploymentModelSummary,   // seit v3.9.73
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
    formatEmploymentModelSummary,
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
      row.employer.personnelNumber || '',
      String(row.workEntriesCount),
      minutesToHM(row.workedMin),
      rowNet(row),
    ]);
    totalsRow = [
      'Gesamt',
      '',
      String(ov.totals.workEntriesCount),
      minutesToHM(ov.totals.workedMin),
      totalsNetStr,
    ];
    head = [[ovEmpLabel, 'Pers.-Nr.', 'Tage', 'Ist', 'Rechnungsbetrag']];
    columnStyles = {
      0: { cellWidth: 55 },
      1: { cellWidth: 20 },
      2: { cellWidth: 16 },
      3: { cellWidth: 25 },
      4: { cellWidth: 55 },
    };
    legend = 'Ist = geleistete Arbeitszeit. Rechnungsbetrag = Ist × Stundensatz. Freelance-Modus: kein Soll/Saldo.';
  } else {
    body = ov.rows.map(row => [
      row.employer.name,
      row.employer.personnelNumber || '',
      String(row.workEntriesCount),
      minutesToHM(row.workedMin),
      minutesToHM(row.targetMin),
      `${row.balance >= 0 ? '+' : ''}${minutesToHM(row.balance)}`,
      String(row.vacationDays),
      String(row.sickDays),
      String(row.overtimeReductionDays || 0),
    ]);
    totalsRow = [
      'Gesamt',
      '',
      String(ov.totals.workEntriesCount),
      minutesToHM(ov.totals.workedMin),
      minutesToHM(ov.totals.targetMin),
      `${ov.totals.balance >= 0 ? '+' : ''}${minutesToHM(ov.totals.balance)}`,
      String(ov.totals.vacationDays),
      String(ov.totals.sickDays),
      String(ov.totals.overtimeReductionDays || 0),
    ];
    head = [[ovEmpLabel, 'Pers.-Nr.', 'Tage', 'Ist', 'Soll', 'Saldo', 'Urlaub', 'Krank', 'Abbau']];
    columnStyles = {
      0: { cellWidth: 34 },
      1: { cellWidth: 20 },
      2: { cellWidth: 12 },
      3: { cellWidth: 18 },
      4: { cellWidth: 18 },
      5: { cellWidth: 18 },
      6: { cellWidth: 14 },
      7: { cellWidth: 14 },
      8: { cellWidth: 14 },
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

  // Arbeitszeitmodelle je Arbeitgeber (nur im Angestellt-Modus relevant, seit v3.9.73).
  // Als kompakte Fußzeile statt zusätzlicher Tabellenspalte, da die Übersichtstabelle bereits
  // 9 Spalten hat und eine Textspalte mit variabler Länge zu Umbrüchen/Überlauf führen würde.
  if (!ovFreelance && typeof formatEmploymentModelSummary === 'function') {
    const modelLines = ov.rows
      .map((row) => {
        const summary = formatEmploymentModelSummary(row.employer);
        return summary ? `${row.employer.name}: ${summary}` : '';
      })
      .filter(Boolean);
    if (modelLines.length) {
      y += 4;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(90);
      doc.text('Arbeitszeitmodelle:', marginX, y);
      doc.setFont('helvetica', 'normal');
      y += 4.5;
      modelLines.forEach((line) => {
        y = wrapText(doc, `\u2022 ${line}`, marginX, y, 180) + 0.5;
      });
      doc.setTextColor(0);
    }
  }

  return doc.output('blob');
}
