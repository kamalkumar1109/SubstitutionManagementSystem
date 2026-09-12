const { AcademicSession, School } = require("../models");
const { SESSION_STATUS, AUDIT_ACTIONS } = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { writeAudit } = require("./auditService");

async function archivePreviousCurrent(schoolId, exceptId) {
  await AcademicSession.updateMany(
    { schoolId, isCurrent: true, _id: { $ne: exceptId } },
    { $set: { isCurrent: false, status: SESSION_STATUS.ARCHIVED } }
  );
}

async function createSession({
  schoolId,
  actorId,
  name,
  startDate,
  endDate,
  setCurrent,
  createTimetable = true,
  periodCount,
  periodStart,
  weekDays,
  firstHalfStart,
  firstHalfEnd,
  secondHalfStart,
  secondHalfEnd,
  staybackEnabled,
  staybackDay,
  staybackFirstHalfStart,
  staybackFirstHalfEnd,
  staybackSecondHalfStart,
  staybackSecondHalfEnd,
  classIds,
  roundDuties
}) {
  const session = await AcademicSession.create({
    schoolId,
    name,
    startDate,
    endDate,
    status: setCurrent ? SESSION_STATUS.CURRENT : SESSION_STATUS.UPCOMING,
    isCurrent: Boolean(setCurrent)
  });

  if (setCurrent) {
    await archivePreviousCurrent(schoolId, session._id);
    await School.findByIdAndUpdate(schoolId, { currentAcademicSession: session._id });
  }

  let timetable = null;
  if (createTimetable !== false) {
    const { TIMETABLE_STATUS } = require("../config/constants");
    const timetableService = require("./timetableService");
    timetable = await timetableService.createTimetable({
      schoolId,
      actorId,
      payload: {
        academicSessionId: session._id,
        name: `${name} timetable`,
        periodCount,
        periodStart,
        weekDays,
        firstHalfStart,
        firstHalfEnd,
        secondHalfStart,
        secondHalfEnd,
        staybackEnabled,
        staybackDay,
        staybackFirstHalfStart,
        staybackFirstHalfEnd,
        staybackSecondHalfStart,
        staybackSecondHalfEnd,
        classIds,
        roundDuties,
        status: TIMETABLE_STATUS.DRAFT
      }
    });
  }

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.SESSION_CREATED,
    entityType: "AcademicSession",
    entityId: session._id,
    metadata: { name, timetableId: timetable?._id || null }
  });

  return { session, timetable };
}

async function listSessions(schoolId) {
  return AcademicSession.find({ schoolId }).sort({ startDate: -1 });
}

async function setCurrentSession({ schoolId, sessionId, actorId }) {
  const session = await AcademicSession.findOne({ _id: sessionId, schoolId });
  if (!session) throw AppError.notFound("Academic session not found");

  await archivePreviousCurrent(schoolId, session._id);
  session.isCurrent = true;
  session.status = SESSION_STATUS.CURRENT;
  await session.save();
  await School.findByIdAndUpdate(schoolId, { currentAcademicSession: session._id });

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.SESSION_SET_CURRENT,
    entityType: "AcademicSession",
    entityId: session._id,
    metadata: { setCurrent: true }
  });

  return session;
}

module.exports = { createSession, listSessions, setCurrentSession };
