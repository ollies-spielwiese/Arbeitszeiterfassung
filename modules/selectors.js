// modules/selectors.js
// State-lesende Selectors + Summary-Feld-Builder.
// Phase 3.5 — extrahiert aus app.js.
// Phase 4.8 — computeEntryRows und computeFormFields ergänzt (Selector-Prinzip vollständig).
//
// Reine Funktionen mit Dependency-Injection:
//   - getEmployer(id, { state })
//   - getCurrentReport({ state, computeMonthReport, toast, getEmployerId, getYm })
//   - getCurrentOverview({ state, computeMonthOverview, toast, getYm })
//   - getSummaryFields(input, { isFreelance, minutesToHM, hoursDecimal, formatMoney })
//   - getOverviewSummaryFields(ov, { isFreelance, minutesToHM, hoursDecimal, formatMoney })
//   - computeEntryRows(list, ctx) — pre-computed Row-Objekte für Einträge-Liste
//   - computeFormFields(entry, opts, ctx) — Feld-Definitionen für Entry-Modal

/**
 * Findet einen Arbeitgeber per ID.
 * @param {string} id
 * @param {{state:{employers:Array<import('../types.js').AZEmployer>}}} ctx
 * @returns {import('../types.js').AZEmployer|undefined}
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
 * @param {import('../types.js').AZSummaryInput} input
 * @param {{isFreelance:()=>boolean, minutesToHM:(min:number)=>string,
 *          hoursDecimal:(min:number)=>string, formatMoney:(amt:number, cur:string)=>string}} ctx
 * @returns {import('../types.js').AZSummaryField[]}
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
 * @returns {import('../types.js').AZSummaryField[]}
 */
export function getOverviewSummaryFields(ov, ctx) {
  const { isFreelance, minutesToHM, hoursDecimal, formatMoney } = ctx;
  // Neue Regel: Employee-Layout zeigen, wenn mindestens ein Employer im Report Vertragsstunden hat.
  // Fällt zurück auf globales isFreelance() nur wenn keine Rows/Employers vorhanden.
  const anyEmpHasTarget = Array.isArray(ov.rows) && ov.rows.some(r => {
    const emp = r && r.employer;
    if (!emp) return false;
    return (Number(emp.weeklyHours) || 0) > 0 || (Number(emp.monthlyTargetHours) || 0) > 0 || (Number(emp.monthlyHours) || 0) > 0;
  });
  const freelance = anyEmpHasTarget ? false : isFreelance();
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

/**
 * Baut vor-berechnete Row-Objekte für die Einträge-Liste.
 * Rein: kein DOM, kein escape (das ist Aufgabe des Renderers).
 * @param {Array<any>} list — bereits gefilterte und sortierte Entries
 * @param {{getEmployer:(id:string)=>any, computeWorkMinutes:(e:any)=>number,
 *          computeHomeofficeMinutes:(e:any)=>number,
 *          computeMonthTargetMinutes:(emp:any, ym:string)=>number,
 *          countWorkdaysInMonth:(ym:string, emp:any)=>number}} ctx
 * @returns {Array<{id:string, entry:any, employer:any, color:string, type:string,
 *                  rightKind:string, rightValueMin:number, isOvertime:boolean,
 *                  detailsParts:Array<string>, badgeType:string|null,
 *                  note:string|null}>}
 */
export function computeEntryRows(list, ctx) {
  const {
    getEmployer,
    computeWorkMinutes,
    computeHomeofficeMinutes,
    computeMonthTargetMinutes,
    countWorkdaysInMonth,
  } = ctx;

  return list.map((e) => {
    const emp = getEmployer(e.employerId);
    const color = (emp && emp.color) || '#3b82f6';

    /** @type {{type:string, rightKind:string, rightValueMin:number, isOvertime:boolean,
     *          detailsParts:Array<string>, badgeType:string|null}} */
    let row;

    if (e.type === 'work') {
      const mins = computeWorkMinutes(e);
      const monthlyTarget = emp ? computeMonthTargetMinutes(emp, e.date.slice(0, 7)) : 0;
      const workdays = emp ? countWorkdaysInMonth(e.date.slice(0, 7), emp) : 0;
      const dailyTarget = (emp && workdays > 0) ? monthlyTarget / workdays : 0;
      const isOvertime = mins > dailyTarget && dailyTarget > 0;
      const details = [];
      details.push(`${e.start}\u2013${e.end}`);
      if (e.breakMinutes) details.push(`Pause ${e.breakMinutes} Min`);
      if (emp) details.push(emp.name);
      row = {
        type: 'work',
        rightKind: 'hours',
        rightValueMin: mins,
        isOvertime,
        detailsParts: details,
        badgeType: e.overtimeReason ? 'overtime' : null,
      };
    } else if (e.type === 'homeoffice') {
      const mins = computeHomeofficeMinutes(e);
      const segCount = Array.isArray(e.segments)
        ? e.segments.filter((s) => s && s.start && s.end).length
        : 0;
      const details = [];
      details.push(`Home-Office`);
      details.push(`${segCount} ${segCount === 1 ? 'Block' : 'Blöcke'}`);
      if (emp) details.push(emp.name);
      row = {
        type: 'homeoffice',
        rightKind: 'hours',
        rightValueMin: mins,
        isOvertime: false,
        detailsParts: details,
        badgeType: 'homeoffice',
      };
    } else if (e.type === 'vacation') {
      row = {
        type: 'vacation',
        rightKind: 'absence-vacation',
        rightValueMin: 0,
        isOvertime: false,
        detailsParts: emp ? [emp.name] : [],
        badgeType: 'vacation',
      };
    } else {
      row = {
        type: 'sick',
        rightKind: 'absence-sick',
        rightValueMin: 0,
        isOvertime: false,
        detailsParts: emp ? [emp.name] : [],
        badgeType: 'sick',
      };
    }

    const noteParts = [];
    if (e.overtimeReason) noteParts.push(`Grund: ${e.overtimeReason}`);
    if (e.note) noteParts.push(e.note);

    return {
      id: e.id,
      entry: e,
      employer: emp,
      color,
      date: e.date,
      ...row,
      note: noteParts.length ? noteParts.join(' • ') : null,
    };
  });
}

/**
 * Baut Feld-Definitionen für das Entry-Modal.
 * Rein: kein DOM, keine Seiteneffekte. Rückgabe beschreibt, welche Felder
 * mit welchen Defaults gezeigt werden.
 * @param {any} entry — bestehender Eintrag oder null bei Neu-Anlage
 * @param {{presetType?:string, justEnded?:boolean}} opts
 * @param {{state:{employers:Array<any>, activeEmployerId?:string}, todayISO:()=>string,
 *          getEmployer:(id:string)=>any, DAY_KEYS:Array<string>,
 *          DAY_LABELS_LONG:Array<string>, dayOfWeekISO:(iso:string)=>number}} ctx
 * @returns {{isNew:boolean, title:string, values:any, showDeleteButton:boolean,
 *            showWorkFields:boolean, employerOptions:Array<{id:string, name:string}>,
 *            scheduleSuggestion:{visible:boolean, label:string, start:string,
 *                                end:string, breakMinutes:number}|null}}
 */
export function computeFormFields(entry, opts, ctx) {
  opts = opts || {};
  const { state, todayISO, getEmployer, DAY_KEYS, DAY_LABELS_LONG, dayOfWeekISO } = ctx;
  const isNew = !entry;

  const title = opts.justEnded
    ? 'Zeit prüfen und speichern'
    : (isNew ? 'Zeit erfassen' : 'Zeit bearbeiten');

  // Bei HO-Einträgen erstes Segment als Start/Ende vorschlagen (für Konvertierung HO→work).
  let seedStart = entry?.start || '';
  let seedEnd   = entry?.end   || '';
  if (entry && entry.type === 'homeoffice' && Array.isArray(entry.segments) && entry.segments.length > 0) {
    const first = entry.segments[0];
    if (first && !seedStart) seedStart = first.start || '';
    if (first && !seedEnd)   seedEnd   = first.end   || '';
  }

  const values = entry ? {
    id: entry.id,
    employerId: entry.employerId || state.activeEmployerId,
    date: entry.date,
    type: entry.type,
    start: seedStart,
    end: seedEnd,
    breakMinutes: entry.breakMinutes || 0,
    overtimeReason: entry.overtimeReason || '',
    note: entry.note || '',
  } : {
    id: '',
    employerId: state.activeEmployerId,
    date: todayISO(),
    type: opts.presetType || 'work',
    start: '',
    end: '',
    breakMinutes: 0,
    overtimeReason: '',
    note: '',
  };

  const showWorkFields = (values.type === 'work' || values.type === 'homeoffice');

  const employerOptions = state.employers.map((e) => ({ id: e.id, name: e.name }));

  // Schedule-Suggestion: nur bei work, mit Employer und Datum, wenn Wochenschema hinterlegt
  let scheduleSuggestion = null;
  if (showWorkFields && values.employerId && values.date) {
    const emp = getEmployer(values.employerId);
    if (emp && emp.schedule) {
      const key = DAY_KEYS[dayOfWeekISO(values.date)];
      const day = emp.schedule[key];
      if (day && day.enabled && day.start && day.end) {
        scheduleSuggestion = {
          visible: true,
          label: `${DAY_LABELS_LONG[DAY_KEYS.indexOf(key)]} ${day.start}\u2013${day.end}${day.break ? ` (${day.break} Min Pause)` : ''}`,
          start: day.start,
          end: day.end,
          breakMinutes: day.break || 0,
        };
      }
    }
  }

  return {
    isNew,
    title,
    values,
    showDeleteButton: !isNew,
    showWorkFields,
    employerOptions,
    scheduleSuggestion,
  };
}
