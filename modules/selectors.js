// modules/selectors.js
// State-lesende Selectors + Summary-Feld-Builder.
// Phase 3.5 — extrahiert aus app.js.
//
// Reine Funktionen mit Dependency-Injection:
//   - getEmployer(id, { state })
//   - getCurrentReport({ state, computeMonthReport, toast, getEmployerId, getYm })
//   - getCurrentOverview({ state, computeMonthOverview, toast, getYm })
//   - getSummaryFields(input, { isFreelance, minutesToHM, hoursDecimal, formatMoney })
//   - getOverviewSummaryFields(ov, { isFreelance, minutesToHM, hoursDecimal, formatMoney })

/**
 * Findet einen Arbeitgeber per ID.
 * @param {string} id
 * @param {{state:{employers:Array<{id:string}>}}} ctx
 */
export function getEmployer(id, ctx) {
  const state = ctx && ctx.state;
  if (!state || !Array.isArray(state.employers)) return undefined;
  return state.employers.find((e) => e.id === id);
}

/**
 * Ermittelt den aktuellen Report anhand von Report-Filter (Arbeitgeber + Monat).
 * Rückgabe null wenn Filter unvollständig — Toast wird gesetzt.
 * @param {{state:object, computeMonthReport:(empId:string,ym:string)=>any,
 *          toast:(msg:string)=>void, getEmployerId:()=>string|null, getYm:()=>string|null}} ctx
 */
export function getCurrentReport(ctx) {
  const empId = ctx.getEmployerId();
  const ym = ctx.getYm();
  if (!empId || !ym) {
    ctx.toast('Bitte Arbeitgeber und Monat wählen');
    return null;
  }
  return ctx.computeMonthReport(empId, ym);
}

/**
 * Ermittelt die aktuelle Übersicht anhand von Overview-Filter (Monat).
 * Rückgabe null wenn Voraussetzungen fehlen — Toast wird gesetzt.
 * @param {{state:{employers:Array<any>}, computeMonthOverview:(ym:string)=>any,
 *          toast:(msg:string)=>void, getYm:()=>string|null}} ctx
 */
export function getCurrentOverview(ctx) {
  const ym = ctx.getYm();
  if (!ym) {
    ctx.toast('Bitte Monat wählen');
    return null;
  }
  if (!ctx.state.employers.length) {
    ctx.toast('Bitte zuerst einen Arbeitgeber anlegen');
    return null;
  }
  const ov = ctx.computeMonthOverview(ym);
  if (!ov.rows.length) {
    ctx.toast('Keine Daten für diesen Monat');
    return null;
  }
  return ov;
}

/**
 * Baut die Feld-Liste für das Report-/Tracker-Summary-Grid.
 * Pure Funktion — alle Formatter/Modus-Helper via ctx.
 * @param {object} input
 * @param {{isFreelance:()=>boolean, minutesToHM:(min:number)=>string,
 *          hoursDecimal:(min:number)=>string, formatMoney:(amt:number, cur:string)=>string}} ctx
 */
export function getSummaryFields(input, ctx) {
  const { isFreelance, minutesToHM, hoursDecimal, formatMoney } = ctx;
  const mode = input.mode || (isFreelance() ? 'freelance' : 'employee');
  const freelance = (mode === 'freelance');
  const includeAbsences = input.includeAbsences !== false; // default true
  const includeHolidays = input.includeHolidays === true;  // default false

  const fields = [];

  // 1. Ist-Stunden (immer)
  fields.push({
    key: 'worked',
    label: input.workedLabel || 'Ist',
    kind: 'time',
    valueHM: minutesToHM(input.workedMin || 0),
    valueDec: `${hoursDecimal(input.workedMin || 0)} h`,
    rawMinutes: input.workedMin || 0,
  });

  // 2. Soll + Saldo (nur employee)
  if (!freelance) {
    fields.push({
      key: 'target',
      label: input.targetLabel || 'Soll',
      kind: 'time',
      valueHM: minutesToHM(input.targetMin || 0),
      valueDec: `${hoursDecimal(input.targetMin || 0)} h`,
      rawMinutes: input.targetMin || 0,
    });
    const bal = input.balance || 0;
    fields.push({
      key: 'balance',
      label: input.balanceLabel || 'Saldo',
      kind: 'balance',
      valueHM: `${bal >= 0 ? '+' : ''}${minutesToHM(bal)}`,
      valueDec: `${hoursDecimal(bal)} h`,
      sign: bal >= 0 ? 'pos' : 'neg',
      rawMinutes: bal,
    });
  }

  // 3. Rechnungsbetrag (immer wenn Stundensatz > 0)
  const rate = Number(input.hourlyRate) || 0;
  if (rate > 0) {
    const currency = input.currency || 'EUR';
    const amount = ((input.workedMin || 0) / 60) * rate;
    fields.push({
      key: 'net',
      label: input.netLabel || 'Rechnungsbetrag',
      kind: 'money',
      value: formatMoney(amount, currency),
      rawAmount: { amount, currency, rate, hoursDec: hoursDecimal(input.workedMin || 0) },
    });
  }

  // 4. Urlaub/Krank (nur employee, nur wenn includeAbsences)
  if (!freelance && includeAbsences) {
    fields.push({
      key: 'absences',
      label: 'Urlaub / Krank',
      kind: 'count',
      value: `${input.vacationDays || 0} / ${input.sickDays || 0}`,
      rawCounts: { vacation: input.vacationDays || 0, sick: input.sickDays || 0 },
    });
  }

  // 5. Feiertage (wenn explizit angefordert, z.B. Woche)
  if (includeHolidays) {
    fields.push({
      key: 'holidays',
      label: 'Feiertage',
      kind: 'count',
      value: String(input.holidayCount || 0),
    });
  }

  return fields;
}

/**
 * Aggregierte Variante für Übersicht (mehrere Kunden/Arbeitgeber).
 * Nimmt totals-Objekt + Row-Array und liefert Felder für Übersicht-Summary-Grid.
 * @param {{rows:Array<any>, totals:{workedMin:number, targetMin:number, balance:number, vacationDays:number, sickDays:number}}} ov
 * @param {{isFreelance:()=>boolean, minutesToHM:(min:number)=>string,
 *          hoursDecimal:(min:number)=>string, formatMoney:(amt:number, cur:string)=>string}} ctx
 */
export function getOverviewSummaryFields(ov, ctx) {
  const { isFreelance, minutesToHM, hoursDecimal, formatMoney } = ctx;
  const freelance = isFreelance();
  // Netto-Summe pro Währung aggregieren
  const netByCurrency = ov.rows.reduce((acc, row) => {
    const rate = Number(row.employer.hourlyRate) || 0;
    if (rate <= 0) return acc;
    const cur = row.employer.currency || 'EUR';
    acc[cur] = (acc[cur] || 0) + (row.workedMin / 60) * rate;
    return acc;
  }, {});
  const hasNet = Object.keys(netByCurrency).length > 0;
  const netStr = hasNet
    ? Object.entries(netByCurrency).map(([cur, amt]) => formatMoney(amt, cur)).join(' · ')
    : '—';

  const fields = [];
  fields.push({
    key: 'worked',
    label: 'Ist gesamt',
    kind: 'time',
    valueHM: minutesToHM(ov.totals.workedMin),
    valueDec: `${hoursDecimal(ov.totals.workedMin)} h`,
    rawMinutes: ov.totals.workedMin,
  });
  if (!freelance) {
    fields.push({
      key: 'target',
      label: 'Soll gesamt',
      kind: 'time',
      valueHM: minutesToHM(ov.totals.targetMin),
      valueDec: `${hoursDecimal(ov.totals.targetMin)} h`,
      rawMinutes: ov.totals.targetMin,
    });
    const bal = ov.totals.balance;
    fields.push({
      key: 'balance',
      label: 'Saldo gesamt',
      kind: 'balance',
      valueHM: `${bal >= 0 ? '+' : ''}${minutesToHM(bal)}`,
      valueDec: `${hoursDecimal(bal)} h`,
      sign: bal >= 0 ? 'pos' : 'neg',
      rawMinutes: bal,
    });
  }
  // Rechnungsbetrag: im Freelance immer zeigen (auch wenn 0 → '—'), im Employee nur wenn > 0
  if (freelance || hasNet) {
    fields.push({
      key: 'net',
      label: 'Rechnungsbetrag gesamt',
      kind: 'money',
      value: netStr,
    });
  }
  if (!freelance) {
    fields.push({
      key: 'absences',
      label: 'Urlaub / Krank',
      kind: 'count',
      value: `${ov.totals.vacationDays} / ${ov.totals.sickDays}`,
    });
  }
  return fields;
}
