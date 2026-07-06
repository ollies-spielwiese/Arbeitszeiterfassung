// modules/export/word.js
// Pure Word-Export-Funktion.
// Erzeugt einen .docx-Blob aus einem Monatsreport.
// Kein DOM-Zugriff, keine globalen Abhängigkeiten - alles über ctx.
//
// ctx = {
//   docx, state,
//   formatDate, formatDateLong, formatMonthYear, minutesToHM,
//   computeWorkMinutes, computeHomeofficeMinutes,
//   getSummaryFields, renderSummaryWordParagraphs,
// }

export async function generateWordBlob(report, ctx) {
  const {
    docx, state,
    formatDate, formatDateLong, formatMonthYear, minutesToHM,
    computeWorkMinutes, computeHomeofficeMinutes,
    getSummaryFields, renderSummaryWordParagraphs,
  } = ctx;

  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, BorderStyle } = docx;

  const border = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' };
  const cellBorders = { top: border, bottom: border, left: border, right: border };

  // Fixed column widths in DXA (1440 dxa = 1 inch). Page width A4 minus margins ≈ 9000 dxa.
  // Widths: Datum 1700, Zeit 1400, Pause 900, Std. 900, Grund 2100, Bemerkung 2000 = 9000 total
  const colWidths = [1700, 1400, 900, 900, 2100, 2000];
  const headerCellW = (text, w) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: cellBorders,
    shading: { fill: 'F1F5F9' },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })] })],
  });
  const cellW = (text, w, align = AlignmentType.LEFT) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: cellBorders,
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text: String(text || ''), size: 20 })] })],
  });

  const combinedRows = [
    ...report.workEntries.map(e => ({ e, isHO: false })),
    ...(report.homeofficeEntries || []).map(e => ({ e, isHO: true })),
  ].sort((a, b) => a.e.date.localeCompare(b.e.date));

  const workRowsFixed = combinedRows.map(({ e, isHO }) => {
    if (isHO) {
      const mins = computeHomeofficeMinutes(e);
      return new TableRow({
        children: [
          cellW(formatDateLong(e.date), colWidths[0]),
          cellW('Home-Office', colWidths[1]),
          cellW('—', colWidths[2], AlignmentType.RIGHT),
          cellW(minutesToHM(mins), colWidths[3], AlignmentType.RIGHT),
          cellW('', colWidths[4]),
          cellW(e.note || '', colWidths[5]),
        ],
      });
    }
    const mins = computeWorkMinutes(e);
    return new TableRow({
      children: [
        cellW(formatDateLong(e.date), colWidths[0]),
        cellW(`${e.start}–${e.end}`, colWidths[1]),
        cellW(e.breakMinutes || 0, colWidths[2], AlignmentType.RIGHT),
        cellW(minutesToHM(mins), colWidths[3], AlignmentType.RIGHT),
        cellW(e.overtimeReason || '', colWidths[4]),
        cellW(e.note || '', colWidths[5]),
      ],
    });
  });

  const workTable = combinedRows.length ? new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: colWidths,
    layout: 'fixed',
    rows: [
      new TableRow({ tableHeader: true, children: [
        headerCellW('Datum', colWidths[0]),
        headerCellW('Zeit', colWidths[1]),
        headerCellW('Pause (Min)', colWidths[2]),
        headerCellW('Std.', colWidths[3]),
        headerCellW('Grund Überstunden', colWidths[4]),
        headerCellW('Bemerkung', colWidths[5]),
      ]}),
      ...workRowsFixed,
    ],
  }) : null;

  const absenceLines = [];
  if (report.vacationEntries.length) {
    absenceLines.push(new Paragraph({ children: [
      new TextRun({ text: 'Urlaub: ', bold: true }),
      new TextRun({ text: report.vacationEntries.map(e => formatDate(e.date)).join(', ') }),
    ]}));
  }
  if (report.sickEntries.length) {
    absenceLines.push(new Paragraph({ children: [
      new TextRun({ text: 'Krankheit: ', bold: true }),
      new TextRun({ text: report.sickEntries.map(e => formatDate(e.date)).join(', ') }),
    ]}));
  }
  if (report.holidays && report.holidays.length) {
    absenceLines.push(new Paragraph({ children: [
      new TextRun({ text: 'Feiertage: ', bold: true }),
      new TextRun({ text: report.holidays.map(h => `${formatDate(h.date)} ${h.name}`).join(', ') }),
    ]}));
  }

  const overtimeSection = report.overtimeEntries.length ? [
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Überstunden – Begründung', bold: true })] }),
    ...report.overtimeEntries.map(e => new Paragraph({ children: [
      new TextRun({ text: `${formatDate(e.date)}: `, bold: true }),
      new TextRun({ text: e.overtimeReason }),
    ]})),
  ] : [];

  const empName = (state.settings.employeeName || '').trim();
  const headerLines = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Arbeitszeitnachweis', bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: `${report.employer.name} – ${formatMonthYear(report.ym)}`, size: 24 })] }),
  ];
  if (empName) {
    headerLines.push(new Paragraph({ children: [
      new TextRun({ text: 'Arbeitnehmer/in: ', bold: true }),
      new TextRun({ text: empName }),
    ] }));
  }
  headerLines.push(new Paragraph({ children: [new TextRun({ text: `Erstellt am ${new Date().toLocaleDateString('de-DE')}`, italics: true, color: '64748B' })] }));
  headerLines.push(new Paragraph({ text: '' }));

  const wordSummaryFields = getSummaryFields({
    workedMin: report.workedMin,
    targetMin: report.targetMin,
    balance: report.balance,
    vacationDays: report.vacationEntries.length,
    sickDays: report.sickEntries.length,
    hourlyRate: Number(report.employer.hourlyRate) || 0,
    currency: report.employer.currency || 'EUR',
  });
  const wordSummaryParagraphs = renderSummaryWordParagraphs(wordSummaryFields, { Paragraph, TextRun });

  const children = [
    ...headerLines,

    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Zusammenfassung', bold: true })] }),
    ...wordSummaryParagraphs,
    ...absenceLines,
    new Paragraph({ text: '' }),

    ...(workTable ? [
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Einzelnachweis', bold: true })] }),
      workTable,
      ...((report.homeofficeEntries && report.homeofficeEntries.length) ? [new Paragraph({ children: [
        new TextRun({ text: `davon Home-Office: ${report.homeofficeEntries.length} ${report.homeofficeEntries.length === 1 ? 'Tag' : 'Tage'} · ${minutesToHM(report.homeofficeMin || 0)}`, italics: true, color: '64748B', size: 18 }),
      ]})] : []),
      new Paragraph({ text: '' }),
    ] : []),

    ...overtimeSection,

    new Paragraph({ text: '' }),
    new Paragraph({ text: '' }),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      columnWidths: [4200, 600, 4200],
      layout: 'fixed',
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [
        new TableRow({ children: [
          new TableCell({ width: { size: 4200, type: WidthType.DXA }, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }, children: [ new Paragraph({ children: [new TextRun({ text: empName ? `${empName} – Unterschrift / Datum` : 'Unterschrift Arbeitnehmer / Datum', size: 18, color: '64748B' })] }) ] }),
          new TableCell({ width: { size: 600, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }, children: [new Paragraph({ text: '' })] }),
          new TableCell({ width: { size: 4200, type: WidthType.DXA }, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }, children: [ new Paragraph({ children: [new TextRun({ text: 'Unterschrift Arbeitgeber / Datum', size: 18, color: '64748B' })] }) ] }),
        ]}),
      ],
    }),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });

  return await Packer.toBlob(doc);
}
