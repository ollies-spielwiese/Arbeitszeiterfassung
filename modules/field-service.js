// modules/field-service.js
// Außendienst-Nachweis (seit v3.13.0): Tätigkeit, Einsatzort und Kilometer je Arbeitsblock.
// Reine Funktionen ohne DOM-Zugriff. Gilt nur für Präsenz-Einträge (type 'work') der in
// settings.fieldService.employerIds freigeschalteten Arbeitgeber. Standard: aus.
//
// Datenmodell:
//   settings.fieldService = { enabled, employerIds[], activities[{id,label,builtin,hidden,isTrip}],
//     kmEnabled, kmRate, defaultVehicle:'private'|'company', kmPrompt:'switch'|'end', showTodayList }
//   entry (type 'work') optional: activity, activityLabel (Name zum Zeitpunkt der Erfassung),
//     location, km, vehicle
//   runningTimer optional: activity, location

export const FS_BUILTIN_ACTIVITIES = Object.freeze([
  Object.freeze({ id: 'office', label: 'Büro', builtin: true, isTrip: false }),
  Object.freeze({ id: 'client', label: 'Kundentermin', builtin: true, isTrip: false }),
  Object.freeze({ id: 'trip', label: 'Fahrt', builtin: true, isTrip: true }),
]);

export const FS_DEFAULT_KM_RATE = 0.30;
export const FS_LABEL_MAX = 40;
export const FS_LOCATION_MAX = 120;
export const FS_VEHICLE_LABELS = Object.freeze({ private: 'Privat-PKW', company: 'Dienstwagen' });

const BUILTIN_IDS = new Set(FS_BUILTIN_ACTIVITIES.map(a => a.id));

function cleanLabel(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, FS_LABEL_MAX);
}

/**
 * Normalisiert settings.fieldService (fehlende Felder → Standardwerte, Standard-Tätigkeiten immer vorhanden).
 * @param {any} settings
 */
export function getFieldServiceSettings(settings) {
  const raw = (settings && settings.fieldService && typeof settings.fieldService === 'object') ? settings.fieldService : {};
  const list = Array.isArray(raw.activities) ? raw.activities : [];
  const builtins = FS_BUILTIN_ACTIVITIES.map((b) => {
    const stored = list.find(a => a && a.id === b.id);
    return { id: b.id, label: b.label, builtin: true, hidden: !!(stored && stored.hidden), isTrip: b.isTrip };
  });
  const seen = new Set();
  const customs = [];
  for (const a of list) {
    if (!a || typeof a.id !== 'string' || !a.id || BUILTIN_IDS.has(a.id) || seen.has(a.id)) continue;
    const label = cleanLabel(a.label);
    if (!label) continue;
    seen.add(a.id);
    customs.push({ id: a.id, label, builtin: false, hidden: !!a.hidden, isTrip: !!a.isTrip });
  }
  const rate = Number(raw.kmRate);
  return {
    enabled: raw.enabled === true,
    employerIds: Array.isArray(raw.employerIds) ? raw.employerIds.filter(x => typeof x === 'string' && x) : [],
    activities: [...builtins, ...customs],
    kmEnabled: raw.kmEnabled !== false,
    kmRate: Number.isFinite(rate) && rate >= 0 && rate <= 10 ? Math.round(rate * 100) / 100 : FS_DEFAULT_KM_RATE,
    defaultVehicle: raw.defaultVehicle === 'company' ? 'company' : 'private',
    kmPrompt: raw.kmPrompt === 'end' ? 'end' : 'switch',
    showTodayList: raw.showTodayList !== false,
  };
}

/** Ist der Außendienst-Nachweis für diesen Arbeitgeber aktiv? */
export function isFieldServiceActive(settings, employerId) {
  const fs = getFieldServiceSettings(settings);
  return fs.enabled && !!employerId && fs.employerIds.includes(employerId);
}

/** Auswählbare (nicht ausgeblendete) Tätigkeiten. */
export function visibleActivities(fs) {
  return fs.activities.filter(a => !a.hidden);
}

export function findActivity(fs, id) {
  return (id && fs.activities.find(a => a.id === id)) || null;
}

/** Anzeigename einer Tätigkeit im Eintrag (Snapshot bleibt nach Löschen erhalten). */
export function activityLabelOf(entry, fs) {
  if (!entry || !entry.activity) return '';
  const a = fs ? findActivity(fs, entry.activity) : null;
  return (a && a.label) || cleanLabel(entry.activityLabel) || '';
}

/** Ist der Eintrag eine Fahrt (Kilometer relevant)? */
export function isTripEntry(entry, fs) {
  if (!entry) return false;
  const a = fs ? findActivity(fs, entry.activity) : null;
  if (a) return !!a.isTrip;
  return Number(entry.km) > 0;
}

export function entryKm(entry) {
  const n = Number(entry && entry.km);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
}

export function entryVehicle(entry, fs) {
  if (entry && (entry.vehicle === 'private' || entry.vehicle === 'company')) return entry.vehicle;
  return fs ? fs.defaultVehicle : 'private';
}

/** Hat der Eintrag Außendienst-Angaben? */
export function hasFieldServiceData(entry) {
  return !!(entry && (entry.activity || (entry.location && String(entry.location).trim()) || entryKm(entry) > 0));
}

/** Text-Präfix für die Bemerkungsspalte: „Kundentermin · Kassel · 120 km“. */
export function fieldServicePrefix(entry, fs) {
  if (!entry) return '';
  const parts = [];
  const label = activityLabelOf(entry, fs);
  if (label) parts.push(label);
  const loc = String(entry.location || '').trim();
  if (loc) parts.push(loc);
  const km = entryKm(entry);
  if (km > 0) parts.push(`${formatKm(km)} km${entryVehicle(entry, fs) === 'company' ? ' (Dienstwagen)' : ''}`);
  return parts.join(' · ');
}

/** Bemerkungstext inkl. Außendienst-Präfix. */
export function noteWithFieldService(entry, fs) {
  const prefix = fieldServicePrefix(entry, fs);
  const note = String((entry && entry.note) || '').trim();
  if (!prefix) return note;
  return note ? `${prefix} – ${note}` : prefix;
}

export function formatKm(km) {
  const n = Math.round((Number(km) || 0) * 10) / 10;
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

export function formatEuro(amount) {
  return (Math.round((Number(amount) || 0) * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export function kmAmount(km, vehicle, rate) {
  if (vehicle === 'company') return 0;
  return Math.round((Number(km) || 0) * (Number(rate) || 0) * 100) / 100;
}

function sortBlocks(list) {
  return [...list].sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
}

/**
 * Fahrtenzeilen für die Kilometer-Aufstellung.
 * Von = Einsatzort des vorherigen Blocks am selben Tag, Nach = Einsatzort der Fahrt
 * (sonst des nächsten Blocks), Anlass = Bemerkung, sonst Tätigkeit des nächsten Blocks,
 * sonst „Rückfahrt“. Nur Fahrten mit Kilometern.
 * @param {any[]} workEntries Präsenz-Einträge eines Arbeitgebers
 * @param {any} fs normalisierte Einstellungen
 */
export function buildTripRows(workEntries, fs) {
  const sorted = sortBlocks((workEntries || []).filter(e => e && e.type === 'work'));
  const rows = [];
  sorted.forEach((e, i) => {
    if (!isTripEntry(e, fs)) return;
    const km = entryKm(e);
    if (!(km > 0)) return;
    const prev = (i > 0 && sorted[i - 1].date === e.date) ? sorted[i - 1] : null;
    const next = (i + 1 < sorted.length && sorted[i + 1].date === e.date) ? sorted[i + 1] : null;
    const from = prev ? String(prev.location || '').trim() : '';
    const to = String(e.location || '').trim() || (next ? String(next.location || '').trim() : '');
    const note = String(e.note || '').trim();
    const nextLabel = next && !isTripEntry(next, fs) ? activityLabelOf(next, fs) : '';
    const reason = note || nextLabel || 'Rückfahrt';
    const vehicle = entryVehicle(e, fs);
    rows.push({
      id: e.id, date: e.date, start: e.start || '', end: e.end || '',
      from, to, reason, km, vehicle, amount: kmAmount(km, vehicle, fs.kmRate),
    });
  });
  return rows;
}

/**
 * Monatsauswertung für einen Arbeitgeber.
 * @param {any[]} workEntries
 * @param {any} fs
 * @param {(e:any)=>number} workMinutes
 */
export function computeFieldServiceMonth(workEntries, fs, workMinutes) {
  const list = (workEntries || []).filter(e => e && e.type === 'work');
  const byLabel = new Map();
  let tripMin = 0;
  for (const e of list) {
    const label = activityLabelOf(e, fs);
    if (!label) continue;
    const m = workMinutes(e);
    const cur = byLabel.get(label) || { label, minutes: 0, count: 0 };
    cur.minutes += m; cur.count += 1;
    byLabel.set(label, cur);
    if (isTripEntry(e, fs)) tripMin += m;
  }
  const trips = buildTripRows(list, fs);
  const km = Math.round(trips.reduce((s, t) => s + t.km, 0) * 10) / 10;
  const kmPrivate = Math.round(trips.filter(t => t.vehicle === 'private').reduce((s, t) => s + t.km, 0) * 10) / 10;
  const kmCompany = Math.round((km - kmPrivate) * 10) / 10;
  const amount = Math.round(trips.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const tripDays = new Set(trips.map(t => t.date)).size;
  return {
    active: true,
    byActivity: [...byLabel.values()],
    tripMin, km, kmPrivate, kmCompany, amount, rate: fs.kmRate, trips, tripDays,
  };
}

/** Neue ID für eine eigene Tätigkeit. */
export function newActivityId(existing) {
  const ids = new Set((existing || []).map(a => a.id));
  let n = 1;
  while (ids.has(`custom-${n}`)) n++;
  return `custom-${n}`;
}

/**
 * Felder für einen Eintrag aus Auswahl zusammenstellen (nur gesetzte Werte).
 * @param {any} fs
 * @param {{activity?:string, activityLabel?:string, location?:string, km?:any, vehicle?:string}} input
 */
export function buildEntryFieldServiceData(fs, input) {
  const out = { activity: '', activityLabel: '', location: '', km: 0, vehicle: '' };
  const a = findActivity(fs, input && input.activity);
  if (a) { out.activity = a.id; out.activityLabel = a.label; }
  else if (input && input.activity && input.activityLabel) { out.activity = String(input.activity); out.activityLabel = cleanLabel(input.activityLabel); }
  out.location = String((input && input.location) || '').trim().slice(0, FS_LOCATION_MAX);
  const trip = a ? a.isTrip : false;
  if (trip && fs.kmEnabled) {
    const km = Number(String(input && input.km != null ? input.km : '').replace(',', '.'));
    out.km = Number.isFinite(km) && km > 0 ? Math.min(Math.round(km * 10) / 10, 5000) : 0;
    out.vehicle = (input && (input.vehicle === 'private' || input.vehicle === 'company')) ? input.vehicle : fs.defaultVehicle;
  }
  return out;
}

/** Einzeiliger Text „Tätigkeiten: Büro 12:00 · Fahrt 5:00 · Kilometer: 475 km (142,50 €)“. */
export function fieldServiceSummaryText(fsm, minutesToHM) {
  if (!fsm || (!fsm.byActivity.length && !(fsm.km > 0))) return '';
  const parts = fsm.byActivity.map(a => `${a.label} ${minutesToHM(a.minutes)}`);
  let km = '';
  if (fsm.km > 0) {
    km = ` · Kilometer: ${formatKm(fsm.km)} km`;
    if (fsm.amount > 0) km += ` (${formatEuro(fsm.amount)})`;
  }
  return `Tätigkeiten: ${parts.join(' · ') || '—'}${km}`;
}
