const { DailyTeacherStatus, Teacher, AcademicSession } = require("../models");
const { DAILY_TEACHER_STATUS, AUDIT_ACTIONS } = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { writeAudit } = require("./auditService");
const { resolveSchoolToday, rejectNonToday } = require("./schoolToday");

async function resolveSessionId(schoolId, academicSessionId, school) {
  if (academicSessionId) {
    const session = await AcademicSession.findOne({ _id: academicSessionId, schoolId });
    if (!session) throw AppError.notFound("Academic session not found");
    return session._id;
  }
  if (!school?.currentAcademicSession) {
    throw AppError.badRequest("academicSessionId is required (no current session)");
  }
  return school.currentAcademicSession;
}

function publicTeacher(teacher) {
  return {
    _id: teacher._id,
    name: teacher.name,
    employeeCode: teacher.employeeCode || "",
    designation: teacher.designation || ""
  };
}

async function setDailyStatus({ schoolId, academicSessionId, actorId, teacherId, date, status, note }) {
  if (!Object.values(DAILY_TEACHER_STATUS).includes(status)) {
    throw AppError.badRequest("Invalid daily status");
  }
  const { school, dateKey } = await resolveSchoolToday(schoolId);
  rejectNonToday(date, dateKey, "Daily status can only be saved for today");

  const teacher = await Teacher.findOne({ _id: teacherId, schoolId, active: true });
  if (!teacher) throw AppError.notFound("Teacher not found");

  const sessionId = await resolveSessionId(schoolId, academicSessionId, school);
  const doc = await DailyTeacherStatus.findOneAndUpdate(
    { schoolId, teacherId, dateKey },
    {
      schoolId,
      academicSessionId: sessionId,
      teacherId,
      dateKey,
      status,
      note: note || ""
    },
    { upsert: true, runValidators: true, returnDocument: "after" }
  );

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.DAILY_STATUS_CHANGED,
    entityType: "DailyTeacherStatus",
    entityId: doc._id,
    metadata: { teacherId: String(teacherId), dateKey, status }
  });

  return {
    teacher: publicTeacher(teacher),
    dateKey,
    status: doc.status,
    note: doc.note,
    fromOverride: true
  };
}

async function listDailyStatus({ schoolId, academicSessionId, date }) {
  const { school, dateKey, dayOfWeek, timezone } = await resolveSchoolToday(schoolId);
  rejectNonToday(date, dateKey, "Daily status can only be listed for today");
  const sessionId = await resolveSessionId(schoolId, academicSessionId, school);
  const teachers = await Teacher.find({
    schoolId,
    active: true
  }).sort({ name: 1 });
  const rows = await DailyTeacherStatus.find({ schoolId, academicSessionId: sessionId, dateKey });
  const byTeacher = new Map(rows.map((r) => [String(r.teacherId), r]));

  return {
    dateKey,
    dayOfWeek,
    timezone,
    rows: teachers.map((t) => {
      const override = byTeacher.get(String(t._id));
      return {
        teacher: publicTeacher(t),
        dateKey,
        status: override ? override.status : DAILY_TEACHER_STATUS.PRESENT,
        note: override ? override.note : "",
        fromOverride: Boolean(override)
      };
    })
  };
}

module.exports = { setDailyStatus, listDailyStatus };
