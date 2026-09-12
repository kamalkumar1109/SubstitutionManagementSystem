const { School } = require("../models");
const { AppError } = require("../utils/AppError");
const { todayDateKey, dayOfWeekFromDateKey, normalizeDateKey } = require("../utils/dates");

async function resolveSchoolToday(schoolId) {
  const school = await School.findById(schoolId);
  if (!school) throw AppError.notFound("School not found");
  const timezone = school.timezone || "Asia/Kolkata";
  const dateKey = todayDateKey(timezone);
  const dayOfWeek = dayOfWeekFromDateKey(dateKey, timezone);
  return { school, timezone, dateKey, dayOfWeek };
}

function rejectNonToday(requested, dateKey, message) {
  if (requested == null || requested === "") return;
  let normalized;
  try {
    normalized = normalizeDateKey(requested);
  } catch {
    throw AppError.badRequest("Invalid date");
  }
  if (normalized !== dateKey) {
    throw AppError.badRequest(message || "This action is only available for today");
  }
}

module.exports = { resolveSchoolToday, rejectNonToday };
