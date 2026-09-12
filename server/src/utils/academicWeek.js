const { WEEK_PATTERN } = require("../config/constants");
const { normalizeDateKey } = require("./dates");

function dateKeyToUtc(dateKey) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Academic weekCount is 1-based from the session start date (typically the first
 * week of April for that session), not the ISO calendar week.
 * Week 1 = Odd, Week 2 = Even, Week 3 = Odd, …
 */
function academicWeekInfo(sessionStart, dateKey) {
  const startKey = normalizeDateKey(sessionStart);
  const dayKey = normalizeDateKey(dateKey);
  const diffDays = Math.floor((dateKeyToUtc(dayKey) - dateKeyToUtc(startKey)) / 86400000);
  const weekCount = Math.max(1, Math.floor(diffDays / 7) + 1);
  const weekParity = weekCount % 2 === 1 ? WEEK_PATTERN.ODD : WEEK_PATTERN.EVEN;
  return { weekCount, weekParity };
}

function weekPatternsOverlap(a = WEEK_PATTERN.EVERY, b = WEEK_PATTERN.EVERY) {
  const pa = a || WEEK_PATTERN.EVERY;
  const pb = b || WEEK_PATTERN.EVERY;
  if (pa === WEEK_PATTERN.EVERY || pb === WEEK_PATTERN.EVERY) return true;
  return pa === pb;
}

function entryAppliesToWeek(entry, teacher, weekParity) {
  if (!teacher || teacher.alternateWeekSchedule !== true) return true;
  const pattern = entry.weekPattern || WEEK_PATTERN.EVERY;
  if (pattern === WEEK_PATTERN.EVERY) return true;
  return pattern === weekParity;
}

module.exports = { academicWeekInfo, weekPatternsOverlap, entryAppliesToWeek };
