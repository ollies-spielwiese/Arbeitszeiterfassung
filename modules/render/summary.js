// modules/render/summary.js
// Rendering-Adapter für Summary-Felder in vier Zielformate.
// Phase 3.6a — extrahiert aus app.js.
//
// Alle Funktionen sind pure ES-Exports und nehmen einen kleinen ctx.
//   - renderSummaryHTML(fields)                  — kein ctx
//   - renderSummaryPdfLines(fields, ctx)         — ctx: { formatMoney }
//   - renderSummaryWordParagraphs(fields, docxCtx, ctx) — docxCtx: { Paragraph, TextRun }, ctx: { formatMoney }
//   - renderSummaryPlaintext(fields)             — kein ctx

/**
 * HTML-Zeilen für die on-screen .summary-grid.
 * @param {Array<any>} fields
 * @returns {string}
 */
export function renderSummaryHTML(fields) {
  return fields.map((f) => {
    if (f.kind === 'balance') {
      return `<div class="summary-item"><div class="label">${f.label}</div><div class="value ${f.sign}">${f.valueHM}</div></div>`;
    }
    if (f.kind === 'time') {
      return `<div class="summary-item"><div class="label">${f.label}</div><div class="value">${f.valueHM}</div></div>`;
    }
    return `<div class="summary-item"><div class="label">${f.label}</div><div class="value">${f.value}</div></div>`;
  }).join('\n');
}

/**
 * Flache Textzeilen für jsPDF doc.text().
 * @param {Array<any>} fields
 * @param {{formatMoney:(amt:number, cur:string)=>string}} ctx
 * @returns {string[]}
 */
export function renderSummaryPdfLines(fields, ctx) {
  const { formatMoney } = ctx;
  return fields.map((f) => {
    if (f.kind === 'time') {
      const label = f.label === 'Ist' ? 'Ist-Stunden' : (f.label === 'Soll' ? 'Soll-Stunden' : f.label);
      return `${label}: ${f.valueHM} (${f.valueDec})`;
    }
    if (f.kind === 'balance') return `${f.label}: ${f.valueHM} (${f.valueDec})`;
    if (f.kind === 'money') {
      if (f.rawAmount) {
        return `Netto-Summe: ${f.value}  (${f.rawAmount.hoursDec} h × ${formatMoney(f.rawAmount.rate, f.rawAmount.currency)}/h)`;
      }
      return `${f.label}: ${f.value}`;
    }
    if (f.kind === 'count') {
      if (f.key === 'absences' && f.rawCounts) {
        const monthPart = f.monthLabel ? ` ${f.monthLabel}` : '';
        return `Urlaubstage Monat${monthPart}: ${f.rawCounts.vacation}   Krankheitstage: ${f.rawCounts.sick}`;
      }
      return `${f.label}: ${f.value}`;
    }
    return `${f.label}: ${f.value || ''}`;
  });
}

/**
 * docx-Paragraph-Objekte. Konstruktoren via docxCtx (kein CDN-Import im Modul).
 * @param {Array<any>} fields
 * @param {{Paragraph:any, TextRun:any}} docxCtx
 * @param {{formatMoney:(amt:number, cur:string)=>string}} ctx
 * @returns {Array<any>}
 */
export function renderSummaryWordParagraphs(fields, docxCtx, ctx) {
  const { Paragraph, TextRun } = docxCtx;
  const { formatMoney } = ctx;
  return fields.map((f) => {
    if (f.kind === 'time') {
      const label = f.label === 'Ist' ? 'Ist-Stunden' : (f.label === 'Soll' ? 'Soll-Stunden' : f.label);
      return new Paragraph({ children: [
        new TextRun({ text: `${label}: `, bold: true }),
        new TextRun({ text: `${f.valueHM} (${f.valueDec})` }),
      ]});
    }
    if (f.kind === 'balance') {
      return new Paragraph({ children: [
        new TextRun({ text: `${f.label}: `, bold: true }),
        new TextRun({ text: `${f.valueHM} (${f.valueDec})`, bold: true, color: f.sign === 'pos' ? '15803D' : 'B91C1C' }),
      ]});
    }
    if (f.kind === 'money') {
      const children = [
        new TextRun({ text: 'Netto-Summe: ', bold: true }),
        new TextRun({ text: f.value, bold: true }),
      ];
      if (f.rawAmount) {
        children.push(new TextRun({ text: `  (${f.rawAmount.hoursDec} h × ${formatMoney(f.rawAmount.rate, f.rawAmount.currency)}/h)`, color: '64748B' }));
      }
      return new Paragraph({ children });
    }
    if (f.kind === 'count') {
      if (f.key === 'absences' && f.rawCounts) {
        const monthPart = f.monthLabel ? ` ${f.monthLabel}` : '';
        return new Paragraph({ children: [
          new TextRun({ text: `Urlaubstage Monat${monthPart}: `, bold: true }),
          new TextRun({ text: `${f.rawCounts.vacation}` }),
          new TextRun({ text: '   Krankheitstage: ', bold: true }),
          new TextRun({ text: `${f.rawCounts.sick}` }),
        ]});
      }
      return new Paragraph({ children: [
        new TextRun({ text: `${f.label}: `, bold: true }),
        new TextRun({ text: f.value }),
      ]});
    }
    return new Paragraph({ children: [new TextRun({ text: `${f.label}: ${f.value || ''}` })] });
  });
}

/**
 * Bullet-Point-Textzeilen für E-Mail-Body.
 * @param {Array<any>} fields
 * @returns {string[]}
 */
export function renderSummaryPlaintext(fields) {
  return fields.map((f) => {
    if (f.kind === 'time') return `• ${f.label}: ${f.valueHM} (${f.valueDec})`;
    if (f.kind === 'balance') return `• ${f.label}: ${f.valueHM}`;
    if (f.kind === 'money') return `• ${f.label}: ${f.value}`;
    if (f.kind === 'count') {
      if (f.key === 'absences') return `• Urlaub / Krank: ${f.value} Tage`;
      return `• ${f.label}: ${f.value}`;
    }
    return `• ${f.label}: ${f.value || ''}`;
  });
}
