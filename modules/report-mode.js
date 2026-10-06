// Report presentation is employer-specific, never dependent on the global tab mode.
export function reportMode(employer) {
  return ['weeklyHours', 'monthlyHours', 'yearlyHours'].some(k => Number(employer[k]) > 0)
    ? 'employee' : 'freelance';
}
