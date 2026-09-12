export function periodNumbers({ periodCount = 8, periodStart = 1 } = {}) {
  const start = Number(periodStart) === 0 ? 0 : 1;
  const count = Math.max(1, Number(periodCount) || 8);
  return Array.from({ length: count }, (_, i) => start + i);
}

export const DAY_LABELS = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday"
};

export function gridDays({ weekDays } = {}) {
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  return days.slice(0, Number(weekDays) === 5 ? 5 : 6);
}
