// modules/export/gleitzeitkonto-pdf.js
// Pure PDF-Export für das Gleitzeitkonto (kumulierter Saldoverlauf im Kalenderjahr), seit v3.9.76.
// Spiegelt die Bildschirmansicht (modules/render/gleitzeitkonto.js → buildGleitzeitkontoHTML)
// in einem eigenständigen, einfacheren PDF wider: Titel, Zeitraum-Untertitel, ggf. Hinweisbanner
// (Angestellt seit/Beschäftigt bis), die Zusammenfassungs-Kennzahlen und die Saldo-Tabelle mit
// identischen Spalten und Farbkodierung. KEIN Kopf mit Name/Pers.-Nr./Erstellt-am und KEINE
// Gutschrift-Erklärung-Fußnote (siehe Abstimmung: "Eigenes, einfacheres Format", angepasst am
// 2026-09-13: "Das PDF soll doch so aussehen, wie die Ansicht selbst").
// Kein DOM-Zugriff, keine globalen Abhängigkeiten - alles über ctx.
//
// ctx = {
//   jsPDF,
//   minutesToHM, formatMonthYear,
// }

function wrapText(doc, text, x, y, maxWidth, lineHeight = 5) {
  const split = doc.splitTextToSize(text, maxWidth);
  doc.text(split, x, y);
  return y + split.length * lineHeight;
}

const POS_COLOR = [22, 163, 74]; // var(--success), wie .summary-item .value.pos
const NEG_COLOR = [220, 38, 38]; // var(--danger), wie .summary-item .value.neg
const TABLE_POS_COLOR = [5, 150, 105]; // wie .report-table td.pos
const TABLE_NEG_COLOR = [220, 38, 38]; // wie .report-table td.neg

export function generateGleitzeitkontoPdfBlob(rows, emp, meta, ctx) {
  const { jsPDF, minutesToHM, formatMonthYear } = ctx;
  const { year, effectiveStartYm, effectiveEndYm, hiredAfterYear, endedBeforeYear } = meta || {};

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const marginX = 15;
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Gleitzeitkonto – ${emp.name}${year ? ` (${year})` : ''}`, marginX, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100);
  const subtitle = rows.length
    ? (year
      ? `Kumulierter Saldoverlauf, Kalenderjahr ${year}`
      : `Kumulierter Saldoverlauf über ${rows.length} ${rows.length === 1 ? 'Monat' : 'Monate'}`)
    : 'Keine Daten für den gewählten Zeitraum.';
  doc.text(subtitle, marginX, y);
  doc.setTextColor(0);
  y += 7;

  if (!rows.length) {
    if (hiredAfterYear) {
      doc.setFontSize(10);
      y = wrapText(doc, `Du warst im Jahr ${year} bei diesem Arbeitgeber noch nicht angestellt${effectiveStartYm ? ` (angestellt seit ${formatMonthYear(effectiveStartYm)})` : ''}.`, marginX, y, 180);
    } else if (endedBeforeYear) {
      doc.setFontSize(10);
      y = wrapText(doc, `Die Beschäftigung bei diesem Arbeitgeber war im Jahr ${year} bereits beendet${effectiveEndYm ? ` (beschäftigt bis ${formatMonthYear(effectiveEndYm)})` : ''}.`, marginX, y, 180);
    }
    return doc.output('blob');
  }

  // Hinweisbanner bei Jahresgrenzen-Kürzung durch Anstellungsdatum, wie im Bildschirm-Hinweisbanner.
  const first = rows[0];
  const last = rows[rows.length - 1];
  const yearStartYm = year ? `${year}-01` : null;
  const yearEndYm = year ? `${year}-12` : null;
  const truncatedByHire = !!(effectiveStartYm && yearStartYm && effectiveStartYm > yearStartYm);
  const truncatedByEnd = !!(effectiveEndYm && yearEndYm && effectiveEndYm < yearEndYm);
  const hireHintParts = [];
  if (truncatedByHire) hireHintParts.push(`Der Verlauf beginnt erst ab ${formatMonthYear(effectiveStartYm)}, da du davor noch nicht bei diesem Arbeitgeber angestellt warst.`);
  if (truncatedByEnd) hireHintParts.push(`Der Verlauf endet mit ${formatMonthYear(effectiveEndYm)}, da die Beschäftigung zu diesem Zeitpunkt endete.`);
  if (hireHintParts.length) {
    doc.setFontSize(9);
    doc.setTextColor(90);
    y = wrapText(doc, `Hinweis: ${hireHintParts.join(' ')} Der kumulierte Saldo läuft über Jahresgrenzen hinweg durch.`, marginX, y, 180, 4.5);
    doc.setTextColor(0);
    y += 3;
  }

  // Zusammenfassung, identisch zu den vier Kacheln der Bildschirmansicht (renderSummaryHTML).
  const totalWorked = rows.reduce((s, r) => s + r.workedMin, 0);
  const totalTarget = rows.reduce((s, r) => s + r.targetMin, 0);
  doc.setFontSize(10);
  const summaryLines = [
    { label: 'Zeitraum', value: `${formatMonthYear(first.ym)} – ${formatMonthYear(last.ym)}` },
    { label: 'Aktueller Gleitzeitsaldo', value: minutesToHM(last.cumulativeBalance), color: last.cumulativeBalance > 0 ? POS_COLOR : (last.cumulativeBalance < 0 ? NEG_COLOR : null) },
    { label: 'Ist gesamt', value: minutesToHM(totalWorked) },
    { label: 'Soll gesamt', value: minutesToHM(totalTarget) },
  ];
  summaryLines.forEach((line) => {
    doc.setFont('helvetica', 'bold');
    const label = `${line.label}: `;
    const labelWidth = doc.getTextWidth(label);
    doc.text(label, marginX, y);
    doc.setFont('helvetica', 'normal');
    if (line.color) doc.setTextColor(...line.color);
    doc.text(line.value, marginX + labelWidth + 1, y);
    if (line.color) doc.setTextColor(0);
    y += 5.5;
  });
  y += 3;

  const head = [['Monat', 'Ist', 'Soll', 'Saldo (Monat)', 'Saldo (kumuliert)']];
  const body = rows.map((r) => [
    formatMonthYear(r.ym),
    minutesToHM(r.workedMin),
    minutesToHM(r.targetMin),
    minutesToHM(r.balance),
    minutesToHM(r.cumulativeBalance),
  ]);

  doc.autoTable({
    startY: y,
    head,
    body,
    styles: { fontSize: 10, cellPadding: 2.5, overflow: 'linebreak', halign: 'left' },
    headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold', halign: 'left' },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 30 },
      2: { cellWidth: 30 },
      3: { cellWidth: 35 },
      4: { cellWidth: 35, fontStyle: 'bold' },
    },
    margin: { left: marginX, right: marginX },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      if (data.column.index !== 3 && data.column.index !== 4) return;
      const row = rows[data.row.index];
      if (!row) return;
      const v = data.column.index === 3 ? row.balance : row.cumulativeBalance;
      if (v > 0) data.cell.styles.textColor = TABLE_POS_COLOR;
      else if (v < 0) data.cell.styles.textColor = TABLE_NEG_COLOR;
    },
  });

  return doc.output('blob');
}
