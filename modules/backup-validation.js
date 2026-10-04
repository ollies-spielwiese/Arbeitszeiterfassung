// Untrusted JSON boundary. Validate before AND after migrations; never mutate input.
// Optional legacy fields may be absent. Present fields must have the right type.
import { SCHEMA_VERSION } from './migrations.js';

const fail = path => { throw new Error(`Ungültiges Backup-Feld: ${path}`); };
const object = (v, p) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p);
};
const text = (v, p) => { if (typeof v !== 'string') fail(p); };
const number = (v, p) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail(p); };
const bool = (v, p) => { if (typeof v !== 'boolean') fail(p); };
const id = (v, p) => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v)) fail(p);
};
const date = (v, p) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(p);
  const d = new Date(`${v}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v) fail(p);
};
const optionalDate = (v, p) => { if (v !== '' && v !== null) date(v, p); };
const time = (v, p) => {
  if (typeof v !== 'string' || (v !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))) fail(p);
};
const timestamp = (v, p) => {
  if (v !== null && (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(Date.parse(v)))) fail(p);
};
const currency = (v, p) => {
  if (typeof v !== 'string' || !/^[A-Z]{3}$/.test(v)) fail(p);
};
const choice = values => (v, p) => { if (!values.includes(v)) fail(p); };
const list = (v, p, check) => {
  if (!Array.isArray(v)) fail(p);
  v.forEach((item, i) => check(item, `${p}[${i}]`));
};
const fields = (v, p, rules) => {
  object(v, p);
  for (const [key, check] of Object.entries(rules)) {
    if (Object.hasOwn(v, key)) check(v[key], `${p}.${key}`);
  }
};
const texts = keys => Object.fromEntries(keys.split(' ').map(k => [k, text]));
const numbers = keys => Object.fromEntries(keys.split(' ').map(k => [k, number]));
const unique = (items, p) => {
  const seen = new Set();
  for (const item of items) {
    if (!item.id) continue; // Legacy HO entries can receive IDs during migration.
    if (seen.has(item.id)) fail(`${p}: doppelte ID`);
    seen.add(item.id);
  }
};
const segment = (v, p) => {
  object(v, p); time(v.start, `${p}.start`); time(v.end, `${p}.end`);
};
function employer(v, p) {
  object(v, p); id(v.id, `${p}.id`); text(v.name, `${p}.name`);
  fields(v, p, {
    ...texts('phone personnelNumber notes employmentScope workTimeModel'), currency,
    ...numbers('weeklyHours monthlyHours yearlyHours fullTimeReferenceHours annualVacation vacationCarryOver hourlyRate'),
    parttimePercent: (x, path) => { if (x !== null) number(x, path); },
    color: (x, path) => { if (typeof x !== 'string' || !/^#(?:[a-f\d]{3}|[a-f\d]{6}|[a-f\d]{8})$/i.test(x)) fail(path); },
    kind: choice(['employer', 'client']),
    hoursMode: choice(['week', 'month', 'year']),
    breakMode: choice(['legal', 'manual', 'flex', 'none']),
    hiredSince: optionalDate, employmentEndDate: optionalDate,
    contacts: (x, path) => list(x, path, (c, cp) => fields(c, cp, texts('name email'))),
    schedule: (x, path) => {
      object(x, path);
      for (const [key, day] of Object.entries(x)) {
        if (!['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(key)) fail(path);
        fields(day, `${path}.${key}`, { enabled: bool, start: time, end: time, break: number });
      }
    },
  });
}
const entryTypes = ['work', 'homeoffice', 'vacation', 'sick', 'overtime_reduction', 'off_day'];
function entry(v, p) {
  object(v, p);
  if (v.id !== undefined) id(v.id, `${p}.id`);
  else if (v.type !== 'homeoffice') fail(`${p}.id`);
  id(v.employerId, `${p}.employerId`); date(v.date, `${p}.date`);
  choice(entryTypes)(v.type, `${p}.type`);
  fields(v, p, {
    ...texts('note overtimeReason'), start: time, end: time, breakMinutes: number,
    createdAt: timestamp, segments: (x, path) => list(x, path, segment),
  });
}
function holidays(v, p) {
  list(v, p, (h, hp) => {
    object(h, hp); date(h.date, `${hp}.date`); text(h.name, `${hp}.name`);
    fields(h, hp, { stateCode: text });
  });
}
function overrides(v, p) {
  fields(v, p, {
    add: holidays,
    disable: (x, path) => list(x, path, date),
    rename: (x, path) => {
      object(x, path);
      for (const [key, value] of Object.entries(x)) { date(key, path); text(value, `${path}.${key}`); }
    },
  });
}
// Reject prototype-control keys, including in unknown extension fields.
function safeTree(v, p, depth = 0) {
  if (depth > 64) fail(`${p}: zu tief verschachtelt`);
  if (!v || typeof v !== 'object') return;
  for (const [key, value] of Object.entries(v)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail(`${p}.${key}`);
    safeTree(value, `${p}.${key}`, depth + 1);
  }
}

export function validateBackup(data) {
  object(data, 'Backup');
  safeTree(data, 'Backup');
  list(data.employers, 'employers', employer);
  unique(data.employers, 'employers');
  const employerIds = new Set(data.employers.map(e => e.id));
  fields(data, 'Backup', {
    schemaVersion: (v, p) => {
      if (!Number.isInteger(v) || v < 1 || v > SCHEMA_VERSION) fail(`${p} (nicht unterstützte Version)`);
    },
    entries: (v, p) => {
      list(v, p, entry); unique(v, p);
      for (const e of v) if (!employerIds.has(e.employerId)) fail(`${p}.employerId (unbekannt)`);
    },
    templates: (v, p) => {
      list(v, p, (t, tp) => {
        object(t, tp); id(t.id, `${tp}.id`); text(t.label, `${tp}.label`); text(t.text, `${tp}.text`);
        fields(t, tp, { scope: choice(['both', 'employee', 'freelance']) });
      });
      unique(v, p);
    },
    archives: (v, p) => {
      list(v, p, (a, ap) => {
        object(a, ap); id(a.id, `${ap}.id`); id(a.employerId, `${ap}.employerId`);
        if (typeof a.yearMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(a.yearMonth)) fail(`${ap}.yearMonth`);
        fields(a, ap, { generatedAt: timestamp });
        const s = a.snapshot; object(s, `${ap}.snapshot`);
        employer(s.employer, `${ap}.snapshot.employer`);
        if (s.employer.id !== a.employerId) fail(`${ap}.snapshot.employer.id`);
        list(s.entries, `${ap}.snapshot.entries`, entry);
        unique(s.entries, `${ap}.snapshot.entries`);
        if (s.entries.some(e => e.employerId !== a.employerId)) fail(`${ap}.snapshot.entries.employerId`);
        for (const k of ['workedMin', 'targetMin', 'balance']) number(s[k], `${ap}.snapshot.${k}`);
        fields(s, `${ap}.snapshot`, {
          ...numbers('vacationDays sickDays overtimeReductionDays creditedAbsenceMin homeofficeMin'),
          holidays,
        });
      });
      unique(v, p);
    },
    auditLog: (v, p) => list(v, p, (a, ap) => {
      fields(a, ap, {
        id, entryId: id, employerId: id, at: timestamp, date,
        action: choice(['create', 'update', 'delete']), entryType: choice(entryTypes), summary: text,
      });
    }),
    settings: (v, p) => fields(v, p, {
      ...texts('employeeName ownEmail state'), currency,
      appMode: choice(['employee', 'freelance']), holidayOverrides: overrides,
      sollWarningMonthEnabled: bool, sollWarningGleitzeitEnabled: bool,
      ...numbers('sollWarningMonthThresholdPct sollWarningGleitzeitThresholdPct'),
      lastBackupAt: timestamp, backupReminderSnoozeUntil: timestamp,
      backupReminderFirstSeenAt: timestamp, sollWarningSnoozeUntil: timestamp,
    }),
    activeEmployerId: (v, p) => {
      if (v === null || v === '') return;
      id(v, p); if (!employerIds.has(v)) fail(`${p} (unbekannt)`);
    },
    runningTimer: (v, p) => {
      if (v === null) return;
      object(v, p); id(v.employerId, `${p}.employerId`);
      if (!employerIds.has(v.employerId)) fail(`${p}.employerId (unbekannt)`);
      if (v.startISO === null || v.startISO === undefined) fail(`${p}.startISO`);
      timestamp(v.startISO, `${p}.startISO`);
      fields(v, p, { type: choice(['work', 'homeoffice']) });
    },
    pendingMigrationNotice: (v, p) => {
      if (v === null) return;
      fields(v, p, { type: text, toKind: choice(['employer', 'client']), names: (x, xp) => list(x, xp, text) });
    },
  });
}
