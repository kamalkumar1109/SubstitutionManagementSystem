const { DAYS_OF_WEEK } = require("../config/constants");

function normalizeDateKey(value) {
  if (!value) throw new Error("date is required");
  if (typeof value === "string") {
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return value;
    const dmy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayOfWeekFromDateKey(dateKey, timeZone = "UTC") {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone
  }).format(utcDate);
  const map = {
    Sun: "SUNDAY",
    Mon: "MONDAY",
    Tue: "TUESDAY",
    Wed: "WEDNESDAY",
    Thu: "THURSDAY",
    Fri: "FRIDAY",
    Sat: "SATURDAY"
  };
  const day = map[weekday];
  if (!DAYS_OF_WEEK.includes(day)) {
    throw new Error(`Unable to resolve day of week for ${dateKey}`);
  }
  return day;
}

function todayDateKey(timeZone = "Asia/Kolkata") {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  return formatted;
}

function idsEqual(a, b) {
  return String(a) === String(b);
}

function toIdSet(ids) {
  return new Set((ids || []).map((id) => String(id)));
}

module.exports = { normalizeDateKey, dayOfWeekFromDateKey, todayDateKey, idsEqual, toIdSet };
