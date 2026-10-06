import { computeHomeofficeMinutes } from './compute.js';

// Never recalculate archived totals using today's employer or holiday settings.
export function restoreArchiveReport(archive) {
  const s = archive.snapshot, entries = s.entries;
  const homeofficeEntries = entries.filter(e => e.type === 'homeoffice');
  return {
    employer: s.employer, ym: archive.yearMonth, entries,
    workEntries: entries.filter(e => e.type === 'work'),
    homeofficeEntries,
    homeofficeMin: homeofficeEntries.reduce((sum, e) => sum + computeHomeofficeMinutes(e), 0),
    vacationEntries: entries.filter(e => e.type === 'vacation'),
    sickEntries: entries.filter(e => e.type === 'sick'),
    overtimeReductionEntries: entries.filter(e => e.type === 'overtime_reduction'),
    offDayEntries: entries.filter(e => e.type === 'off_day'),
    overtimeEntries: entries.filter(e => e.type === 'work' && e.overtimeReason),
    workedMin: s.workedMin, targetMin: s.targetMin, balance: s.balance,
    creditedAbsenceMin: s.creditedAbsenceMin ?? Math.max(0, s.balance + s.targetMin - s.workedMin),
    holidays: s.holidays || [],
    vacationRemaining: s.vacationRemaining, // Unknown in old snapshots: do not invent it.
  };
}
