const { AppError } = require("../utils/AppError");

/**
 * Automatic timetable generation is intentionally not implemented yet.
 * Manual entry via timetableService remains the only way to fill a timetable.
 *
 * Later this module should consume constraints such as:
 * - teacher availability, subjects, workload, consecutive-period limits, preferences
 * - class / section groups and required periods per subject
 * - class workload
 * - room, lab, and sports availability
 * - breaks and school-specific rules
 *
 * Output must still be ordinary TimetableEntry documents so the substitution
 * engine can keep using the active timetable as its source of truth.
 */
const GENERATOR_CONSTRAINTS = Object.freeze([
  "teacherAvailability",
  "teacherSubjects",
  "teacherWorkload",
  "teacherPreferences",
  "consecutivePeriodRestrictions",
  "classGroups",
  "periodsRequired",
  "classWorkload",
  "roomAvailability",
  "labs",
  "sports",
  "breaks",
  "schoolSpecificRules"
]);

function describeConstraints() {
  return {
    implemented: false,
    constraints: GENERATOR_CONSTRAINTS
  };
}

async function generateTimetable() {
  throw AppError.badRequest(
    "Automatic timetable generation is not available yet. Create or edit entries on the timetable grid."
  );
}

module.exports = { generateTimetable, describeConstraints, GENERATOR_CONSTRAINTS };
