// modules/soll-warning.js
// Sollstunden-Warnung (seit v3.9.78) — Bausteine "Monats-Saldo" und "Gleitzeitkonto-Saldo".
// Reine Berechnungsfunktionen ohne DOM-Zugriff, analog zu modules/compute.js.
//
// Vergleicht |Saldo| / Referenz-Soll gegen eine vom Nutzer eingestellte Prozentschwelle
// (state.settings.sollWarningMonthEnabled/ThresholdPct, sollWarningGleitzeitEnabled/ThresholdPct)
// und liefert strukturierte Warnobjekte, aus denen Banner-Text und Kachel-Hervorhebung
// erzeugt werden (siehe modules/render/soll-warning-banner.js, modules/selectors.js
// getSummaryFields, modules/render/gleitzeitkonto.js buildGleitzeitkontoHTML).

/**
 * Mindest-Referenz-Soll (Minuten), unterhalb dessen keine Bewertung erfolgt. Verhindert eine
 * durch Division durch einen sehr kleinen Nenner verzerrte (scheinbar riesige) Prozentangabe,
 * z. B. im ersten Teilmonat eines neuen Arbeitsverhältnisses.
 */
export const MIN_TARGET_MIN_FOR_EVALUATION = 60;

/**
 * @typedef {Object} SollWarning
 * @property {'month'|'gleitzeitkonto'} basis
 * @property {'over'|'under'} direction
 * @property {number} balance Saldo in Minuten (Vorzeichen: + = über Soll, - = unter Soll)
 * @property {number} targetMin Referenz-Soll in Minuten
 * @property {number} pct Betrags-Prozentsatz (gerundet) = |balance| / targetMin * 100
 * @property {number} thresholdPct Eingestellte Schwelle in Prozent
 */

/**
 * Prüft einen einzelnen Saldo/Soll-Wert gegen eine Schwelle.
 * @param {number} balance Saldo in Minuten
 * @param {number} targetMin Referenz-Soll in Minuten
 * @param {number} thresholdPct Schwelle in Prozent (1–100)
 * @param {'month'|'gleitzeitkonto'} basis
 * @returns {SollWarning|null} null, wenn Schwelle nicht erreicht/deaktiviert oder Datenbasis zu klein
 */
export function evaluateSollWarning(balance, targetMin, thresholdPct, basis) {
  const threshold = Number(thresholdPct) || 0;
  const target = Number(targetMin) || 0;
  if (threshold <= 0) return null;
  if (target < MIN_TARGET_MIN_FOR_EVALUATION) return null;
  const bal = Number(balance) || 0;
  const pct = (Math.abs(bal) / target) * 100;
  if (pct < threshold) return null;
  return {
    basis,
    direction: bal >= 0 ? 'over' : 'under',
    balance: bal,
    targetMin: target,
    pct: Math.round(pct),
    thresholdPct: threshold,
  };
}

/**
 * Baut den kurzen Erklärungstext für Tooltip/Banner aus einem Warnobjekt.
 * @param {SollWarning} w
 * @returns {string}
 */
export function formatSollWarningTooltipText(w) {
  const directionLabel = w.direction === 'over' ? 'über' : 'unter';
  const basisLabel = w.basis === 'month' ? 'deinem Monats-Soll' : 'deinem bisherigen Jahres-Soll';
  return `⚠ ${w.pct} % ${directionLabel} ${basisLabel} (Schwelle: ${w.thresholdPct} %).`;
}

/**
 * Kombiniert evaluateSollWarning + formatSollWarningTooltipText für die Kachel-Hervorhebung
 * (Monat-Tab, Gleitzeitkonto-Tab). Liefert null, wenn keine Warnung vorliegt.
 * @param {number} balance
 * @param {number} targetMin
 * @param {number} thresholdPct
 * @param {'month'|'gleitzeitkonto'} basis
 * @returns {(SollWarning & {tooltipText:string})|null}
 */
export function buildBalanceWarningInfo(balance, targetMin, thresholdPct, basis) {
  const w = evaluateSollWarning(balance, targetMin, thresholdPct, basis);
  if (!w) return null;
  return { ...w, tooltipText: formatSollWarningTooltipText(w) };
}

/**
 * Ermittelt alle aktiven Sollstunden-Warnungen über alle sichtbaren (nicht-ehemaligen)
 * Arbeitgeber — Grundlage für den Warn-Banner. Wertet je Arbeitgeber Monats- und/oder
 * Gleitzeitkonto-Baustein aus (sofern jeweils aktiviert). Im Freiberufler-Modus immer leer
 * (kein Soll/Saldo-Konzept dort).
 * @param {{state:object, computeMonthReport:(empId:string, ym:string)=>any,
 *          computeGleitzeitkontoRows:(emp:any, year:number)=>{rows:Array<any>},
 *          isFormerEmployer?:(emp:any, today:string)=>boolean}} ctx
 * @param {{ym:string, year:number, today:string}} period aktueller Monat/Jahr/Tag
 * @returns {Array<SollWarning & {employer:any, ym:string}>}
 */
export function computeActiveSollWarnings(ctx, period) {
  const { state, computeMonthReport, computeGleitzeitkontoRows, isFormerEmployer } = ctx;
  const settings = (state && state.settings) || {};
  if (settings.appMode === 'freelance') return [];
  const monthOn = !!settings.sollWarningMonthEnabled;
  const gleitzeitOn = !!settings.sollWarningGleitzeitEnabled;
  if (!monthOn && !gleitzeitOn) return [];

  const results = [];
  (state.employers || []).forEach((emp) => {
    if (typeof isFormerEmployer === 'function' && isFormerEmployer(emp, period.today)) return;
    // Kunde/Auftraggeber ohne vertragliche Sollstunden -> keine Bewertung möglich.
    const hasTarget = (Number(emp.weeklyHours) || 0) > 0 || (Number(emp.monthlyHours) || 0) > 0;
    if (!hasTarget) return;

    if (monthOn) {
      const r = computeMonthReport(emp.id, period.ym);
      if (r) {
        const w = evaluateSollWarning(r.balance, r.targetMin, settings.sollWarningMonthThresholdPct, 'month');
        if (w) results.push({ ...w, employer: emp, ym: period.ym });
      }
    }
    if (gleitzeitOn) {
      const gk = computeGleitzeitkontoRows(emp, period.year);
      const rows = gk && gk.rows;
      if (rows && rows.length) {
        const last = rows[rows.length - 1];
        const w = evaluateSollWarning(last.cumulativeBalance, last.cumulativeTargetMin, settings.sollWarningGleitzeitThresholdPct, 'gleitzeitkonto');
        if (w) results.push({ ...w, employer: emp, ym: last.ym });
      }
    }
  });
  return results;
}
