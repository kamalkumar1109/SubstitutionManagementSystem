const {
  Teacher,
  Class,
  Section,
  Subject,
  TimetableEntry,
  TimetableSwap,
  Timetable,
  Substitution,
  SubstitutionRun,
  AcademicSession
} = require("../models");
const {
  AUDIT_ACTIONS,
  EMPLOYMENT_STATUS,
  WEEK_PATTERN,
  SUBSTITUTION_STATUS,
  SUBSTITUTION_SOURCE,
  SUBSTITUTION_RUN_STATUS,
  ENGINE_VERSION
} = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { writeAudit } = require("./auditService");
const { normalizeDateKey, dayOfWeekFromDateKey } = require("../utils/dates");
const { academicWeekInfo, entryAppliesToWeek } = require("../utils/academicWeek");
const { periodNumbers, gridDaysOf, resolveHalfRanges } = require("./timetableValidationService");
const { findActiveTimetable, findActiveTimetables, presentEntry, getClassView } = require("./timetableService");
const { resolveSchoolToday } = require("./schoolToday");
const { refId, substitutionSlotKey } = require("./substitutionEngine");

function snapshotFromEntry(entry, teacherId) {
  if (!entry) {
    return {
      entryId: null,
      teacherId: teacherId || null,
      subjectId: null,
      classId: null,
      sectionId: null,
      room: "",
      weekPattern: "",
      combinedLabel: "",
      free: true
    };
  }
  return {
    entryId: entry._id || entry.entryId || null,
    teacherId: entry.teacherId?._id || entry.teacherId || teacherId || null,
    subjectId: entry.subjectId?._id || entry.subjectId || null,
    classId: entry.classId?._id || entry.classId || null,
    sectionId: entry.sectionId?._id || entry.sectionId || null,
    room: entry.room || "",
    weekPattern: entry.weekPattern || WEEK_PATTERN.EVERY,
    combinedLabel: entry.combinedLabel || "",
    free: false
  };
}

function assignmentLabel(snap, names) {
  if (!snap || snap.free) return "Free period";
  const klass = names.classes.get(String(snap.classId)) || "";
  const section = names.sections.get(String(snap.sectionId)) || "";
  const subject = names.subjects.get(String(snap.subjectId)) || "";
  return [klass, section, subject].filter(Boolean).join(" ") || "Assigned period";
}

function cloneEntries(entries) {
  return entries.map((row) => {
    const plain = row.toObject ? row.toObject() : { ...row };
    return { ...plain, _id: plain._id };
  });
}

function teacherIdOf(entry) {
  return refId(entry?.teacherId);
}

function applySwapsToEntries(entries, swaps) {
  const live = cloneEntries(entries);
  for (const swap of swaps) {
    const aId = String(swap.teacherAId);
    const bId = String(swap.teacherBId);
    const period = Number(swap.period);
    const aEntry = live.find((e) => teacherIdOf(e) === aId && Number(e.period) === period);
    const bEntry = live.find((e) => teacherIdOf(e) === bId && Number(e.period) === period);
    if (aEntry && bEntry) {
      const tmp = aEntry.teacherId;
      aEntry.teacherId = bEntry.teacherId;
      bEntry.teacherId = tmp;
    } else if (aEntry && !bEntry) {
      aEntry.teacherId = swap.teacherBId;
    } else if (!aEntry && bEntry) {
      bEntry.teacherId = swap.teacherAId;
    }
  }
  return live;
}

async function collectTimetableTeacherIds(schoolId, timetableId, dateKey) {
  const ids = new Set();
  const entryIds = await TimetableEntry.distinct("teacherId", {
    schoolId,
    timetableId,
    active: true
  });
  entryIds.forEach((id) => {
    if (id) ids.add(String(id));
  });
  const swapFilter = { schoolId, timetableId };
  if (dateKey) swapFilter.dateKey = dateKey;
  const swaps = await TimetableSwap.find(swapFilter).select(
    "teacherAId teacherBId replacementTeacherId originalTeacherId"
  );
  for (const swap of swaps) {
    [swap.teacherAId, swap.teacherBId, swap.replacementTeacherId, swap.originalTeacherId].forEach((id) => {
      if (id) ids.add(String(id));
    });
  }
  return [...ids];
}

async function loadEffectiveDay({ schoolId, dateKey, academicSessionId, timetableId }) {
  const { school } = await resolveSchoolToday(schoolId);
  let session;
  if (academicSessionId) {
    session = await AcademicSession.findOne({ _id: academicSessionId, schoolId });
    if (!session) throw AppError.notFound("Academic session not found");
  } else {
    if (!school?.currentAcademicSession) {
      throw AppError.badRequest("No current academic session for this school");
    }
    session = await AcademicSession.findOne({
      _id: school.currentAcademicSession,
      schoolId
    });
    if (!session) throw AppError.badRequest("Current academic session is invalid");
  }
  const dayOfWeek = dayOfWeekFromDateKey(dateKey, school.timezone || "Asia/Kolkata");
  const week = academicWeekInfo(session.startDate, dateKey);
  const timetable = await findActiveTimetable({
    schoolId,
    academicSessionId: session._id,
    dateKey,
    timetableId
  });
  if (!timetable) throw AppError.badRequest("No active timetable for this date");
  const teacherIds = await collectTimetableTeacherIds(schoolId, timetable._id, dateKey);
  const [teachers, entries, swaps, substitutions] = await Promise.all([
    teacherIds.length ? Teacher.find({ schoolId, _id: { $in: teacherIds } }) : Promise.resolve([]),
    TimetableEntry.find({
      schoolId,
      timetableId: timetable._id,
      academicSessionId: session._id,
      dayOfWeek,
      active: true
    })
      .populate("teacherId", "name employeeCode category alternateWeekSchedule")
      .populate("classId", "name classGroupId")
      .populate("sectionId", "name")
      .populate("subjectId", "name"),
    TimetableSwap.find({
      schoolId,
      dateKey,
      timetableId: timetable._id,
      status: { $ne: "CANCELLED" }
    }).sort({ createdAt: 1, _id: 1 }),
    Substitution.find({
      schoolId,
      academicSessionId: session._id,
      dateKey,
      timetableId: timetable._id,
      status: { $ne: SUBSTITUTION_STATUS.CANCELLED }
    })
  ]);
  const teachersById = new Map(teachers.map((t) => [String(t._id), t]));
  const weekEntries = entries.filter((entry) =>
    entryAppliesToWeek(entry, teachersById.get(teacherIdOf(entry)), week.weekParity)
  );
  const effective = applySwapsToEntries(weekEntries, swaps);
  return {
    school,
    session,
    timetable,
    dayOfWeek,
    week,
    teachers,
    teachersById,
    entries: weekEntries,
    effective,
    swaps,
    substitutions
  };
}

function teacherPeriodEntry(entries, teacherId, period) {
  return entries.find((e) => teacherIdOf(e) === String(teacherId) && Number(e.period) === Number(period)) || null;
}

function occupiedBySubstitute(substitutions, teacherId, period) {
  return substitutions.some(
    (row) =>
      row.substituteTeacherId &&
      String(row.substituteTeacherId) === String(teacherId) &&
      Number(row.period) === Number(period)
  );
}

async function nameMaps(schoolId) {
  const [classes, sections, subjects] = await Promise.all([
    Class.find({ schoolId }).select("name classGroupId"),
    Section.find({ schoolId }).select("name"),
    Subject.find({ schoolId }).select("name")
  ]);
  const { withClassGroupIds } = require("./catalogService");
  const classDocs = await withClassGroupIds(schoolId, classes);
  return {
    classes: new Map(classDocs.map((c) => [String(c._id), c.name])),
    classDocs: new Map(classDocs.map((c) => [String(c._id), c])),
    sections: new Map(sections.map((s) => [String(s._id), s.name])),
    subjects: new Map(subjects.map((s) => [String(s._id), s.name]))
  };
}

async function recordSwapSubstitutions({
  schoolId,
  actorId,
  ctx,
  swap,
  previousA,
  previousB,
  teacherA,
  teacherB
}) {
  const sides = [
    { original: previousA, originalTeacher: teacherA, coveringTeacher: teacherB },
    { original: previousB, originalTeacher: teacherB, coveringTeacher: teacherA }
  ].filter((side) => side.original && !side.original.free);

  if (!sides.length) return;

  const run = await SubstitutionRun.create({
    schoolId,
    academicSessionId: ctx.session._id,
    dateKey: swap.dateKey,
    generatedBy: actorId || null,
    generatedAt: new Date(),
    status: SUBSTITUTION_RUN_STATUS.COMPLETED,
    generationVersion: ENGINE_VERSION,
    weekCount: ctx.week.weekCount,
    summary: { source: SUBSTITUTION_SOURCE.SWAP, swapId: swap._id, created: sides.length }
  });

  for (const side of sides) {
    const slotKey = substitutionSlotKey({
      timetableId: ctx.timetable._id,
      period: swap.period,
      absentTeacherId: side.originalTeacher._id,
      classId: side.original.classId,
      sectionId: side.original.sectionId
    });
    const existing = await Substitution.findOne({
      schoolId,
      dateKey: swap.dateKey,
      slotKey,
      status: { $ne: SUBSTITUTION_STATUS.CANCELLED }
    });
    const payload = {
      schoolId,
      academicSessionId: ctx.session._id,
      substitutionRunId: existing?.substitutionRunId || run._id,
      timetableId: ctx.timetable._id,
      dateKey: swap.dateKey,
      period: swap.period,
      classId: side.original.classId || null,
      sectionId: side.original.sectionId || null,
      absentTeacherId: side.originalTeacher._id,
      substituteTeacherId: side.coveringTeacher._id,
      generatedSubstituteTeacherId: side.coveringTeacher._id,
      subjectId: side.original.subjectId || null,
      slotKey,
      source: SUBSTITUTION_SOURCE.SWAP,
      status: SUBSTITUTION_STATUS.ASSIGNED,
      reason: "SWAP"
    };
    if (existing) {
      Object.assign(existing, payload);
      existing.substitutionRunId = existing.substitutionRunId || run._id;
      await existing.save();
    } else {
      await Substitution.create(payload);
    }
  }
}

async function previewOrCommitSwap({ schoolId, actorId, payload, commit }) {
  const dateKey = normalizeDateKey(payload.date || payload.dateKey);
  const period = Number(payload.period);
  if (!Number.isInteger(period) || period < 0) throw AppError.badRequest("Period is required");

  const ctx = await loadEffectiveDay({
    schoolId,
    dateKey,
    timetableId: payload.timetableId
  });
  const allowedDays = gridDaysOf(ctx.timetable);
  if (!allowedDays.includes(ctx.dayOfWeek)) {
    throw AppError.badRequest("This date is not a school timetable day");
  }
  const allowed = periodNumbers(ctx.timetable);
  if (!allowed.includes(period)) {
    throw AppError.badRequest("The selected period does not exist on this timetable");
  }

  let teacherAId = payload.teacherAId || payload.originalTeacherId;
  let teacherBId = payload.teacherBId || payload.replacementTeacherId;

  if (payload.classId && payload.sectionId && (payload.replacementTeacherId || payload.teacherBId)) {
    const classEntry = ctx.effective.find(
      (e) =>
        Number(e.period) === period &&
        String(e.classId?._id || e.classId) === String(payload.classId) &&
        String(e.sectionId?._id || e.sectionId) === String(payload.sectionId)
    );
    if (!classEntry) throw AppError.badRequest("No lesson is assigned to this class and section in that period today");
    teacherAId = teacherIdOf(classEntry);
    teacherBId = payload.replacementTeacherId || payload.teacherBId;
  }

  if (!teacherAId || !teacherBId) {
    throw AppError.badRequest("Teacher A and Teacher B are required");
  }
  if (String(teacherAId) === String(teacherBId)) {
    throw AppError.badRequest("Choose two different teachers");
  }

  const teacherA = ctx.teachersById.get(String(teacherAId));
  const teacherB = ctx.teachersById.get(String(teacherBId));
  if (!teacherA || !teacherB) throw AppError.badRequest("Both teachers must belong to this school");
  if (teacherA.active === false || teacherA.employmentStatus !== EMPLOYMENT_STATUS.ACTIVE) {
    throw AppError.badRequest("Teacher A is not active");
  }
  if (teacherB.active === false || teacherB.employmentStatus !== EMPLOYMENT_STATUS.ACTIVE) {
    throw AppError.badRequest("Teacher B is not active");
  }

  const previousAEntry = teacherPeriodEntry(ctx.effective, teacherA._id, period);
  const previousBEntry = teacherPeriodEntry(ctx.effective, teacherB._id, period);
  if (!previousAEntry && !previousBEntry) {
    throw AppError.badRequest("Both teachers are free in this period, so there is nothing to swap");
  }

  if (occupiedBySubstitute(ctx.substitutions, teacherA._id, period)) {
    throw AppError.conflict("Teacher A already has a substitution assignment in this period");
  }
  if (occupiedBySubstitute(ctx.substitutions, teacherB._id, period)) {
    throw AppError.conflict("Teacher B already has a substitution assignment in this period");
  }

  const names = await nameMaps(schoolId);
  const previousA = snapshotFromEntry(previousAEntry, teacherA._id);
  const previousB = snapshotFromEntry(previousBEntry, teacherB._id);

  const newA = previousB.free
    ? snapshotFromEntry(null, teacherA._id)
    : { ...previousB, teacherId: teacherA._id, free: false };
  const newB = previousA.free
    ? snapshotFromEntry(null, teacherB._id)
    : { ...previousA, teacherId: teacherB._id, free: false };

  if (!newA.free && !newB.free && String(newA.classId) === String(newB.classId) && String(newA.sectionId) === String(newB.sectionId)) {
    throw AppError.conflict("This swap would put both teachers on the same class section");
  }

  const summary = {
    dateKey,
    period,
    weekCount: ctx.week.weekCount,
    weekParity: ctx.week.weekParity,
    teacherA: { id: teacherA._id, name: teacherA.name },
    teacherB: { id: teacherB._id, name: teacherB.name },
    teacherACurrent: assignmentLabel(previousA, names),
    teacherBCurrent: assignmentLabel(previousB, names),
    teacherAAfter: assignmentLabel(newA, names),
    teacherBAfter: assignmentLabel(newB, names),
    previousA,
    previousB,
    newA,
    newB
  };

  if (!commit) return { preview: summary };

  const swap = await TimetableSwap.create({
    schoolId,
    academicSessionId: ctx.session._id,
    timetableId: ctx.timetable._id,
    dateKey,
    period,
    weekCount: ctx.week.weekCount,
    teacherAId: teacherA._id,
    teacherBId: teacherB._id,
    originalTeacherId: teacherA._id,
    replacementTeacherId: teacherB._id,
    classId: previousA.classId || payload.classId || null,
    sectionId: previousA.sectionId || payload.sectionId || null,
    subjectId: previousA.subjectId || null,
    status: "ACTIVE",
    createdBy: actorId || null,
    previousA,
    previousB,
    newA,
    newB,
    changedBy: actorId || null,
    changedAt: new Date()
  });

  await recordSwapSubstitutions({
    schoolId,
    actorId,
    ctx,
    swap,
    previousA,
    previousB,
    teacherA,
    teacherB
  });

  try {
    const substitutionService = require("./substitutionService");
    await substitutionService.syncRoundDutyAssignments({
      schoolId,
      timetableId: ctx.timetable._id,
      dateKey,
      actorId
    });
  } catch {
    /* Round duty sync is best-effort after a swap. */
  }

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.TIMETABLE_SWAP,
    entityType: "TimetableSwap",
    entityId: swap._id,
    metadata: {
      dateKey,
      period,
      teacherAId: teacherA._id,
      teacherBId: teacherB._id,
      previousA,
      previousB,
      newA,
      newB,
      changedBy: actorId || null,
      changedAt: swap.changedAt
    }
  });

  return { swap, preview: summary };
}

async function listTeacherSlots({ schoolId, dateKey, teacherId }) {
  if (!teacherId) throw AppError.badRequest("teacherId is required");
  const key = normalizeDateKey(dateKey);
  const ctx = await loadEffectiveDay({ schoolId, dateKey: key });
  const teacher = ctx.teachersById.get(String(teacherId));
  if (!teacher) throw AppError.notFound("Teacher not found");
  const names = await nameMaps(schoolId);
  const periods = periodNumbers(ctx.timetable);
  return {
    teacher: { id: teacher._id, name: teacher.name },
    dateKey: key,
    weekCount: ctx.week.weekCount,
    weekParity: ctx.week.weekParity,
    periods: periods.map((period) => {
      const entry = teacherPeriodEntry(ctx.effective, teacher._id, period);
      const snap = snapshotFromEntry(entry, teacher._id);
      return {
        period,
        free: snap.free,
        label: assignmentLabel(snap, names),
        assignment: snap,
        entry: entry ? presentEntry(entry) : null
      };
    })
  };
}

async function classGridForSwap({ schoolId, classId, sectionId, dateKey, timetableId }) {
  if (!classId) throw AppError.badRequest("Class is required");
  if (!sectionId) throw AppError.badRequest("Section is required");
  const key = dateKey ? normalizeDateKey(dateKey) : (await resolveSchoolToday(schoolId)).dateKey;
  const { school } = await resolveSchoolToday(schoolId);
  if (!school?.currentAcademicSession) throw AppError.badRequest("No current academic session for this school");
  const session = await AcademicSession.findOne({ _id: school.currentAcademicSession, schoolId });
  const timetables = await findActiveTimetables({
    schoolId,
    academicSessionId: session._id,
    dateKey: key,
    timetableId
  });
  let timetable = null;
  if (timetableId) {
    timetable = timetables.find((tt) => String(tt._id) === String(timetableId)) || null;
  } else {
    for (const tt of timetables) {
      const scoped = (tt.classIds || []).map(String);
      if (scoped.length && !scoped.includes(String(classId))) continue;
      const count = await TimetableEntry.countDocuments({
        schoolId,
        timetableId: tt._id,
        classId,
        sectionId,
        active: true
      });
      if (count > 0 || !scoped.length) {
        timetable = tt;
        if (count > 0) break;
      }
    }
    if (!timetable) timetable = timetables[0] || null;
  }
  if (!timetable) {
    timetable = await Timetable.findOne({ schoolId, academicSessionId: session._id }).sort({ version: -1 });
  }
  if (!timetable) throw AppError.badRequest("No timetable found for this class");
  const view = await getClassView(schoolId, timetable._id, classId, sectionId);
  return {
    dateKey: key,
    dayOfWeek: dayOfWeekFromDateKey(key, school.timezone || "Asia/Kolkata"),
    timetable: {
      _id: timetable._id,
      name: timetable.name,
      periodCount: timetable.periodCount,
      periodStart: timetable.periodStart,
      weekDays: timetable.weekDays
    },
    class: view.class,
    section: view.section,
    days: view.days,
    periods: view.periods,
    daysSchedule: view.daysSchedule
  };
}

async function weekForDate(schoolId, date) {
  const { school } = await resolveSchoolToday(schoolId);
  const dateKey = date ? normalizeDateKey(date) : (await resolveSchoolToday(schoolId)).dateKey;
  if (!school?.currentAcademicSession) {
    throw AppError.badRequest("No current academic session for this school");
  }
  const session = await AcademicSession.findOne({
    _id: school.currentAcademicSession,
    schoolId
  });
  if (!session) throw AppError.badRequest("Current academic session is invalid");
  const week = academicWeekInfo(session.startDate, dateKey);
  let timetable = await findActiveTimetable({
    schoolId,
    academicSessionId: session._id,
    dateKey
  });
  if (!timetable) {
    timetable = await Timetable.findOne({ schoolId, academicSessionId: session._id }).sort({ version: -1 });
  }
  return {
    dateKey,
    ...week,
    sessionId: session._id,
    sessionStart: session.startDate,
    periodCount: timetable?.periodCount || 8,
    periodStart: timetable?.periodStart === 0 ? 0 : 1,
    weekDays: timetable?.weekDays === 5 ? 5 : 6,
    periods: periodNumbers(timetable || { periodCount: 8, periodStart: 1 }),
    days: gridDaysOf(timetable || { weekDays: 6 })
  };
}

module.exports = {
  previewOrCommitSwap,
  listTeacherSlots,
  weekForDate,
  classGridForSwap,
  loadEffectiveDay,
  collectTimetableTeacherIds,
  applySwapsToEntries
};
