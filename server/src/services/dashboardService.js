const {
  School,
  Teacher,
  DailyTeacherStatus,
  Substitution
} = require("../models");
const { DAILY_TEACHER_STATUS } = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { todayDateKey, dayOfWeekFromDateKey } = require("../utils/dates");

function publicSchool(school) {
  if (!school) return null;
  return {
    id: school._id,
    name: school.name,
    schoolCode: school.schoolCode,
    timezone: school.timezone,
    active: school.active,
    subscription: school.subscription || {}
  };
}

async function getSchoolDashboard(schoolId) {
  const school = await School.findById(schoolId).populate("currentAcademicSession");
  if (!school) throw AppError.notFound("School not found");

  const timezone = school.timezone || "Asia/Kolkata";
  const dateKey = todayDateKey(timezone);
  const dayOfWeek = dayOfWeekFromDateKey(dateKey, timezone);

  const teachers = await Teacher.find({ schoolId, active: true }).select("_id");
  const statusRows = await DailyTeacherStatus.find({ schoolId, dateKey }).select("teacherId status");
  const byTeacher = new Map(statusRows.map((row) => [String(row.teacherId), row.status]));

  let present = 0;
  let absent = 0;
  let onDuty = 0;
  for (const teacher of teachers) {
    const status = byTeacher.get(String(teacher._id)) || DAILY_TEACHER_STATUS.PRESENT;
    if (status === DAILY_TEACHER_STATUS.ABSENT) absent += 1;
    else if (status === DAILY_TEACHER_STATUS.ON_DUTY) onDuty += 1;
    else present += 1;
  }

  const session = school.currentAcademicSession;
  const substitutionFilter = { schoolId, dateKey };
  if (session?._id) substitutionFilter.academicSessionId = session._id;
  const substitutionsToday = await Substitution.countDocuments(substitutionFilter);

  return {
    school: publicSchool(school),
    academicSession: session
      ? {
          id: session._id,
          name: session.name,
          status: session.status,
          isCurrent: session.isCurrent,
          startDate: session.startDate,
          endDate: session.endDate
        }
      : null,
    dateKey,
    dayOfWeek,
    summary: {
      totalTeachers: teachers.length,
      present,
      absent,
      onDuty,
      substitutionsToday
    }
  };
}

async function getPlatformOverview() {
  return require("./adminPlatformService").getPlatformOverview();
}

module.exports = { getSchoolDashboard, getPlatformOverview };
