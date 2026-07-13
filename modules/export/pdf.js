// modules/export/pdf.js
// Pure PDF-Export-Funktion für einen Monatsreport (jsPDF + autoTable).
// Kein DOM-Zugriff, keine globalen Abhängigkeiten - alles über ctx.
//
// ctx = {
//   jsPDF, state,
//   formatDate, formatDateLong, formatMonthYear, minutesToHM,
//   computeWorkMinutes, computeHomeofficeMinutes,
//   getSummaryFields, renderSummaryPdfLines, isFreelance,
// }

function wrapText(doc, text, x, y, maxWidth) {
  const split = doc.splitTextToSize(text, maxWidth);
  doc.text(split, x, y);
  return y + split.length * 5;
}

export function generatePdfBlob(report, ctx) {
  const {
    jsPDF, state,
    formatDate, formatDateLong, formatMonthYear, minutesToHM,
    computeWorkMinutes, computeHomeofficeMinutes,
    getSummaryFields, renderSummaryPdfLines, isFreelance,
  } = ctx;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 15;
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(0, 82, 155); // blau
  doc.text('Arbeitszeitnachweis', marginX, y);
  doc.setTextColor(0);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(`${report.employer.name} – ${formatMonthYear(report.ym)}`, marginX, y);
  y += 6;

  const empName = (state.settings.employeeName || '').trim();
  if (empName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const label = 'Arbeitnehmer/in: ';
    doc.setFont('helvetica', 'bold');
    const labelWidth = doc.getTextWidth(label);
    doc.text(label, marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(empName, marginX + labelWidth + 1, y);
    y += 6;
  }

  // Angestellt seit (neu, nur wenn gesetzt und nicht freelance)
  if (!isFreelance() && report.employer.hiredSince) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const label = 'Angestellt seit: ';
    doc.setFont('helvetica', 'bold');
    const labelWidth = doc.getTextWidth(label);
    doc.text(label, marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(report.employer.hiredSince), marginX + labelWidth + 1, y);
    y += 6;
  }

  y += 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 82, 155); // blau
  doc.text('Zusammenfassung', marginX, y);
  doc.setTextColor(0);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const pdfSummaryFields = getSummaryFields({
    workedMin: report.workedMin,
    targetMin: report.targetMin,
    balance: report.balance,
    vacationDays: report.vacationEntries.length,
    sickDays: report.sickEntries.length,
    hourlyRate: Number(report.employer.hourlyRate) || 0,
    currency: report.employer.currency || 'EUR',
    vacationRemaining: report.vacationRemaining,
    monthLabel: formatMonthYear(report.ym),
  });
  const lines = renderSummaryPdfLines(pdfSummaryFields);
  // Saldo-Zeile ggf. rot einfärben
  for (let i = 0; i < lines.length; i++) {
    const field = pdfSummaryFields[i];
    const isNegBalance = field && field.kind === 'balance' && field.sign === 'neg';
    if (isNegBalance) doc.setTextColor(185, 28, 28);
    doc.text(lines[i], marginX, y);
    if (isNegBalance) doc.setTextColor(0);
    // Leerzeile nach Saldo (vor Jahresurlaub-Block)
    if (field && field.key === 'balance') y += 3;
    // Leerzeile nach Resturlaub Vorjahr (vor Urlaub/Krank-Zeile)
    if (field && field.key === 'carryOverVacation') y += 3;
    y += 5;
  }

  if (!isFreelance()) {
    if (report.vacationEntries.length) {
      y += 1;
      const t = 'Urlaub: ' + report.vacationEntries.map(e => formatDate(e.date)).join(', ');
      y = wrapText(doc, t, marginX, y, 180);
    }
    if (report.sickEntries.length) {
      const t = 'Krankheit: ' + report.sickEntries.map(e => formatDate(e.date)).join(', ');
      y = wrapText(doc, t, marginX, y, 180);
    }
    if (report.holidays && report.holidays.length) {
      const t = 'Feiertage: ' + report.holidays.map(h => `${formatDate(h.date)} ${h.name}`).join(', ');
      y = wrapText(doc, t, marginX, y, 180);
    }
  }

  y += 4;

  const homeofficeEntries = report.homeofficeEntries || [];
  if (report.workEntries.length || homeofficeEntries.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Einzelnachweis', marginX, y);
    y += 3;

    const combinedRows = [
      ...report.workEntries.map(e => ({ e, isHO: false })),
      ...homeofficeEntries.map(e => ({ e, isHO: true })),
    ].sort((a, b) => a.e.date.localeCompare(b.e.date));

    const body = combinedRows.map(({ e, isHO }) => {
      if (isHO) {
        return [
          formatDateLong(e.date),
          'Home-Office',
          '—',
          minutesToHM(computeHomeofficeMinutes(e)),
          '',
          e.note || '',
        ];
      }
      return [
        formatDateLong(e.date),
        `${e.start}-${e.end}`,
        String(e.breakMinutes || 0),
        minutesToHM(computeWorkMinutes(e)),
        e.overtimeReason || '',
        e.note || '',
      ];
    });
    doc.autoTable({
      startY: y + 2,
      head: [['Datum', 'Zeit', 'Pause (Min)', 'Std.', 'Grund Überstunden', 'Bemerkung']],
      body,
      styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak', halign: 'left' },
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold', halign: 'left' },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 22 },
        2: { cellWidth: 16 },
        3: { cellWidth: 16 },
        4: { cellWidth: 45 },
        5: { cellWidth: 45 },
      },
      margin: { left: marginX, right: marginX, bottom: 20 },
    });
    y = doc.lastAutoTable.finalY + 6;

    if (homeofficeEntries.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`davon Home-Office: ${homeofficeEntries.length} ${homeofficeEntries.length === 1 ? 'Tag' : 'Tage'} · ${minutesToHM(report.homeofficeMin || 0)}`, marginX, y);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      y += 6;
    }
  }

  if (report.overtimeEntries.length) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Überstunden – Begründung', marginX, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    for (const e of report.overtimeEntries) {
      const t = `${formatDate(e.date)}: ${e.overtimeReason}`;
      y = wrapText(doc, t, marginX, y, 180);
      if (y > 260) { doc.addPage(); y = 20; }
    }
  }

  // "Erstellt am" nach unten — unter den Einzelnachweis, vor die Unterschriftszeilen
  if (y > 255) { doc.addPage(); y = 20; }
  y += 2;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, marginX, y);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  y += 6;

  if (y > 265) { doc.addPage(); y = 20; }
  y += 12;
  const pageW = doc.internal.pageSize.getWidth();
  const sigLineW = 70;
  const leftX = marginX;
  const rightX = pageW - marginX - sigLineW;
  doc.setDrawColor(150);
  doc.line(leftX, y, leftX + sigLineW, y);
  doc.line(rightX, y, rightX + sigLineW, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(empName ? `${empName} – Unterschrift / Datum` : 'Unterschrift Arbeitnehmer / Datum', leftX, y);
  doc.text('Unterschrift Arbeitgeber / Datum', rightX, y);

  // Footer mit Seitennummerierung auf jeder Seite (nach vollständigem Aufbau)
  const totalPages = doc.internal.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    const parts = ['Arbeitszeitnachweis', report.employer.name];
    if (empName) parts.push(empName);
    parts.push(`Monat ${formatMonthYear(report.ym)}`);
    parts.push(`Seite ${p} von ${totalPages}`);
    doc.text(parts.join(' – '), pageW / 2, pageH - 8, { align: 'center' });
    doc.setTextColor(0);
  }

  return doc.output('blob');
}
