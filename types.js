/* Arbeitszeiterfassung – Zentrale JSDoc-Typen
 *
 * Diese Datei ist reine Type-Dokumentation. Kein Laufzeit-Code.
 * Wird von app.js per /// <reference path="./types.js" /> referenziert
 * und ist die Grundlage für //@ts-check in VS Code / tsc --noEmit.
 *
 * Konvention: alle Typen mit `AZ` prefixed, um Kollisionen mit
 * eingebauten Lib-Typen (State, Entry, etc.) zu vermeiden.
 */

// @ts-check

/**
 * Ein einzelner Wochentag im Arbeitgeber-Schedule.
 * @typedef {Object} AZScheduleDay
 * @property {boolean} enabled Ist dieser Tag ein Arbeitstag?
 * @property {string} start Startzeit 'HH:MM'
 * @property {string} end Endzeit 'HH:MM'
 * @property {number} break Pause in Minuten
 */

/**
 * Wochenschedule (Mo–So).
 * @typedef {Object} AZSchedule
 * @property {AZScheduleDay} mon
 * @property {AZScheduleDay} tue
 * @property {AZScheduleDay} wed
 * @property {AZScheduleDay} thu
 * @property {AZScheduleDay} fri
 * @property {AZScheduleDay} sat
 * @property {AZScheduleDay} sun
 */

/**
 * Kontakt-Person eines Arbeitgebers.
 * @typedef {Object} AZContact
 * @property {string} name
 * @property {string} email
 */

/**
 * Arbeitgeber (im Freelance-Modus: Kunde).
 * @typedef {Object} AZEmployer
 * @property {string} id
 * @property {string} name
 * @property {string} color Hex-Farbe '#RRGGBB'
 * @property {string} [phone]
 * @property {AZContact[]} [contacts]
 * @property {'week'|'month'} hoursMode
 * @property {number} [weeklyHours]
 * @property {number} [monthlyHours]
 * @property {'legal'|'manual'|'flex'|'none'} breakMode
 * @property {number} [annualVacation] Urlaubstage pro Jahr
 * @property {AZSchedule} schedule
 * @property {string} [notes]
 * @property {number} [hourlyRate] Stundensatz (Freelance)
 * @property {string} [currency] 'EUR' | 'CHF' | 'USD'
 */

/**
 * Ein Home-Office-Segment.
 * @typedef {Object} AZSegment
 * @property {string} start 'HH:MM'
 * @property {string} end 'HH:MM'
 */

/**
 * Eintrag im Kalender. Feld-Belegung hängt vom type ab:
 *   - 'work'       : start, end, breakMinutes, ggf. overtimeReason
 *   - 'homeoffice' : segments (Array), keine breakMinutes, kein overtimeReason
 *   - 'vacation'   : nur date + type
 *   - 'sick'       : nur date + type
 * @typedef {Object} AZEntry
 * @property {string} id
 * @property {string} employerId
 * @property {string} date 'YYYY-MM-DD'
 * @property {'work'|'homeoffice'|'vacation'|'sick'} type
 * @property {string} [start] 'HH:MM' (work)
 * @property {string} [end] 'HH:MM' (work)
 * @property {number} [breakMinutes] (work)
 * @property {AZSegment[]} [segments] (homeoffice)
 * @property {string} [overtimeReason] (work, optional)
 * @property {string} [note]
 * @property {string} [createdAt] ISO-Timestamp
 */

/**
 * Notizvorlage.
 * @typedef {Object} AZTemplate
 * @property {string} id
 * @property {string} label
 * @property {string} text
 * @property {'both'|'employee'|'freelance'} [scope] Sichtbarkeit nach Modus
 */

/**
 * Archiviertes Monats-Snapshot.
 * @typedef {Object} AZArchive
 * @property {string} id
 * @property {string} employerId
 * @property {string} yearMonth 'YYYY-MM'
 * @property {string} generatedAt ISO-Timestamp
 * @property {Object} snapshot Snapshot der Berichts-Daten
 */

/**
 * Laufender Timer (falls aktiv).
 * @typedef {Object} AZRunningTimer
 * @property {string} employerId
 * @property {string} startISO
 * @property {'work'|'homeoffice'} [type]
 */

/**
 * App-Einstellungen.
 * @typedef {Object} AZSettings
 * @property {string} [ownEmail]
 * @property {string} state Bundesland-Code, z.B. 'HE'
 * @property {'employee'|'freelance'} [appMode]
 * @property {string} [currency] Global default 'EUR'
 * @property {string} [employeeName] Name des Angestellten (Report-Header)
 * @property {import('./modules/holidays.js').AZHolidayOverrides|undefined} [holidayOverrides] Feiertags-Overrides (add/disable/rename)
 */

/**
 * Root-State der App. Wird als JSON in localStorage persistiert.
 * @typedef {Object} AZState
 * @property {number} [schemaVersion] Für Migrations-Layer (Phase 1.2)
 * @property {AZEmployer[]} employers
 * @property {AZEntry[]} entries
 * @property {AZArchive[]} archives
 * @property {AZTemplate[]} templates
 * @property {AZSettings} settings
 * @property {string} [activeEmployerId]
 * @property {AZRunningTimer|null} runningTimer
 */

/* --- Summary Selector Types ------------------------------------------- */

/**
 * Input für getSummaryFields(). Roh-Daten aus computeMonthReport /
 * computeMonthOverview / Wochen-Zusammenfassung.
 * @typedef {Object} AZSummaryInput
 * @property {number} workedMin
 * @property {number} [targetMin]
 * @property {number} [balance]
 * @property {number} [vacationDays]
 * @property {number} [sickDays]
 * @property {number} [holidayCount]
 * @property {number} [hourlyRate]
 * @property {string} [currency]
 * @property {boolean} [includeAbsences] default true
 * @property {boolean} [includeHolidays] default false
 * @property {'freelance'|'employee'} [mode]
 * @property {string} [workedLabel]
 * @property {string} [targetLabel]
 * @property {string} [balanceLabel]
 * @property {string} [netLabel]
 */

/**
 * Ein Feld der Summary-Ausgabe.
 * key ist konventionell 'worked'|'target'|'balance'|'net'|'absences'|'holidays',
 * bleibt aber typisch string weil Selectors Literals zurueckgeben, die tsc
 * ohne expliziten Cast zu string widet.
 * @typedef {Object} AZSummaryField
 * @property {string} key
 * @property {string} label
 * @property {string} kind Konventionell 'time'|'balance'|'money'|'count'.
 * @property {string} [valueHM] 'HH:MM' bei time/balance
 * @property {string} [valueDec] '42,50 h' bei time/balance
 * @property {string} [value] Fertiger String bei money/count
 * @property {string} [sign] Konventionell 'pos'|'neg' bei balance
 * @property {number} [rawMinutes] Roh-Minuten bei time/balance
 * @property {{amount:number,currency:string}} [rawAmount] Bei money
 */

/* --- Report Types ----------------------------------------------------- */

/**
 * Ergebnis von computeMonthReport().
 * @typedef {Object} AZMonthReport
 * @property {AZEmployer} employer
 * @property {string} ym 'YYYY-MM'
 * @property {AZEntry[]} entries Alle Einträge im Monat
 * @property {AZEntry[]} workEntries
 * @property {AZEntry[]} homeofficeEntries
 * @property {AZEntry[]} vacationEntries
 * @property {AZEntry[]} sickEntries
 * @property {AZEntry[]} overtimeEntries
 * @property {number} workedMin Ist-Minuten inkl. Home-Office
 * @property {number} homeofficeMin Reine Home-Office-Minuten
 * @property {number} targetMin
 * @property {number} creditedAbsenceMin Angerechnete Urlaub/Krank-Minuten
 * @property {number} balance workedMin + creditedAbsenceMin - targetMin
 * @property {number} dailyTargetMin
 * @property {AZHoliday[]} holidays
 * @property {number} workdays
 */

/**
 * Zeile der Monats-Übersicht (alle Arbeitgeber).
 * @typedef {Object} AZOverviewRow
 * @property {AZEmployer} employer
 * @property {number} workedMin
 * @property {number} targetMin
 * @property {number} balance
 * @property {number} vacationDays
 * @property {number} sickDays
 * @property {number} workEntriesCount
 */

/**
 * Summen aller Zeilen.
 * @typedef {Object} AZOverviewTotals
 * @property {number} workedMin
 * @property {number} targetMin
 * @property {number} balance
 * @property {number} vacationDays
 * @property {number} sickDays
 * @property {number} workEntriesCount
 */

/**
 * Ergebnis von computeMonthOverview().
 * @typedef {Object} AZMonthOverview
 * @property {string} ym
 * @property {AZOverviewRow[]} rows
 * @property {AZOverviewTotals} totals
 */

/* --- Feiertage -------------------------------------------------------- */

/**
 * Feiertag. Das Feld heisst historisch `date` (nicht `iso`).
 * @typedef {Object} AZHoliday
 * @property {string} date 'YYYY-MM-DD'
 * @property {string} name
 */

/* Diese Datei enthält nur JSDoc-Typen. Kein Runtime-Code.
 * Sie wird NICHT von index.html geladen, sondern nur von app.js
 * per triple-slash-reference eingebunden. */

// Damit types.js als ES-Modul gilt (Voraussetzung für `import('../types.js').X`
// in JSDoc-Annotations mit tsc --noEmit).
export {};
