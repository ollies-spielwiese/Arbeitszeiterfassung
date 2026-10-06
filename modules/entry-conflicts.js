// Full-day absences are exclusive in BOTH directions. Multiple work blocks remain valid.
const absenceTypes = new Set(['vacation', 'sick', 'overtime_reduction', 'off_day']);
export function findEntryConflict(entries, candidate) {
  return entries.find(e => e.id !== candidate.id && e.employerId === candidate.employerId &&
    e.date === candidate.date && (absenceTypes.has(e.type) || absenceTypes.has(candidate.type)));
}
export const ENTRY_CONFLICT_MESSAGE = 'Für dieses Datum existiert bereits eine ganztägige Abwesenheit oder ein anderer Eintrag. Bitte zuerst löschen oder bearbeiten.';
