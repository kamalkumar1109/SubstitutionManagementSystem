const { Timetable, TimetableEntry, TimetableSwap, AcademicSession, Teacher, Class, Section } = require("../models");
const {
  TIMETABLE_STATUS,
  AUDIT_ACTIONS,
  WEEK_PATTERN,
  ASSIGNMENT_TYPE
} = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { writeAudit } = require("./auditService");
const {
  parsePeriodCount,
  parsePeriodStart,
  parseWeekDays,
  periodNumbers,
  gridDaysOf,
  validateEntryPayload,
  mapDuplicateKey,
  normalizeWeekPattern,
  normalizeAssignmentType,
  assignmentDisplayLabel,
  loadTeacher,
  resolveTeacherSubject,
  assertTeacherActive,
  resolveSectionsFromCombinedLabel,
  parseHalfRanges,
  parseStayback,
  parseRoundDuties,
  parseClassIds,
  normalizeComment
} = require("./timetableValidationService");
const mongoose = require("mongoose");

const ENTRY_POPULATE = [
  { path: "teacherId", select: "name employeeCode category alternateWeekSchedule" },
  { path: "subjectId", select: "name code" },
  { path: "classId", select: "name classGroupId" },
  { path: "sectionId", select: "name classId" }
];

function presentEntry(entry) {
  if (!entry) return null;
  const row = entry.toObject ? entry.toObject() : entry;
  const assignmentType = row.assignmentType || ASSIGNMENT_TYPE.CLASS;
  const className = row.classId?.name || "";
  const sectionName = row.sectionId?.name || "";
  const combinedLabel = row.combinedLabel || "";
  return {
    _id: row._id,
    timetableId: row.timetableId,
    schoolId: row.schoolId,
    academicSessionId: row.academicSessionId,
    dayOfWeek: row.dayOfWeek,
    period: row.period,
    room: row.room || "",
    active: row.active,
    assignmentType,
    teacherId: row.teacherId?._id || row.teacherId,
    teacherName: row.teacherId?.name || "",
    subjectId: row.subjectId?._id || row.subjectId || null,
    subjectName: row.subjectId?.name || "",
    classId: row.classId?._id || row.classId || null,
    className,
    sectionId: row.sectionId?._id || row.sectionId || null,
    sectionName,
    weekPattern: row.weekPattern || WEEK_PATTERN.EVERY,
    combinedLabel,
    comment: row.comment || "",
    displayLabel: assignmentDisplayLabel({
      assignmentType,
      combinedLabel,
      className,
      sectionName,
      comment: row.comment
    }),
    assignmentGroupId: row.assignmentGroupId || null,
    followLeadSection: Boolean(row.followLeadSection)
  };
}

async function loadOwnedTimetable(schoolId, timetableId) {
  const timetable = await Timetable.findOne({ _id: timetableId, schoolId }).populate(
    "academicSessionId",
    "name isCurrent status startDate endDate"
  );
  if (!timetable) throw AppError.notFound("Timetable not found");
  return timetable;
}

async function assertOwnedClassIds(schoolId, classIds) {
  if (!classIds.length) return;
  const count = await Class.countDocuments({ _id: { $in: classIds }, schoolId });
  if (count !== classIds.length) throw AppError.badRequest("One or more classes do not belong to this school");
}

async function normalizeRoundDuties(schoolId, duties) {
  const teacherIds = [
    ...new Set(duties.flatMap((floor) => (floor.slots || []).map((s) => s.teacherId).filter(Boolean)).map(String))
  ];
  if (teacherIds.length) {
    const count = await Teacher.countDocuments({ _id: { $in: teacherIds }, schoolId });
    if (count !== teacherIds.length) throw AppError.badRequest("Round duty teachers must belong to this school");
  }
  return duties;
}

async function createTimetable({ schoolId, actorId, payload }) {
  const session = await AcademicSession.findOne({ _id: payload.academicSessionId, schoolId });
  if (!session) throw AppError.badRequest("academicSessionId does not belong to this school");
  const last = await Timetable.findOne({
    schoolId,
    academicSessionId: payload.academicSessionId
  }).sort({ version: -1 });

  const status = payload.status || TIMETABLE_STATUS.DRAFT;
  const periodCount = parsePeriodCount(payload.periodCount);
  const periodStart = parsePeriodStart(payload.periodStart);
  const weekDays = parseWeekDays(payload.weekDays);
  const shape = { periodCount, periodStart, weekDays };
  const halves = parseHalfRanges(payload, shape);
  const classIds = parseClassIds(payload, { classIds: [] });
  await assertOwnedClassIds(schoolId, classIds);
  const roundDuties = await normalizeRoundDuties(schoolId, parseRoundDuties(payload.roundDuties, shape));
  const stayback = parseStayback(payload, { ...shape, ...halves });
  const timetable = await Timetable.create({
    schoolId,
    academicSessionId: payload.academicSessionId,
    name: payload.name,
    effectiveFrom: payload.effectiveFrom || null,
    effectiveTo: payload.effectiveTo || null,
    status,
    version: last ? last.version + 1 : 1,
    periodCount,
    periodStart,
    weekDays,
    roomConflictsEnabled: payload.roomConflictsEnabled !== false,
    ...halves,
    ...stayback,
    classIds,
    roundDuties
  });

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.TIMETABLE_CHANGED,
    entityType: "Timetable",
    entityId: timetable._id,
    metadata: { created: true, version: timetable.version }
  });

  return timetable;
}

async function listTimetables(schoolId, academicSessionId) {
  const filter = { schoolId };
  if (academicSessionId) filter.academicSessionId = academicSessionId;
  return Timetable.find(filter)
    .populate("academicSessionId", "name isCurrent status startDate endDate")
    .sort({ createdAt: -1, version: -1 });
}

async function getTimetable(schoolId, timetableId) {
  const timetable = await loadOwnedTimetable(schoolId, timetableId);
  const entries = await TimetableEntry.find({ timetableId: timetable._id, schoolId, active: true })
    .populate(ENTRY_POPULATE)
    .sort({ dayOfWeek: 1, period: 1 });
  return { timetable, entries: entries.map(presentEntry) };
}

async function updateTimetable({ schoolId, actorId, timetableId, payload }) {
  const timetable = await loadOwnedTimetable(schoolId, timetableId);
  if (payload.name !== undefined) timetable.name = payload.name;
  if (payload.effectiveFrom !== undefined) timetable.effectiveFrom = payload.effectiveFrom || null;
  if (payload.effectiveTo !== undefined) timetable.effectiveTo = payload.effectiveTo || null;
  const nextCount =
    payload.periodCount !== undefined ? parsePeriodCount(payload.periodCount) : timetable.periodCount;
  const nextStart =
    payload.periodStart !== undefined ? parsePeriodStart(payload.periodStart) : timetable.periodStart;
  if (payload.periodCount !== undefined || payload.periodStart !== undefined) {
    const allowed = periodNumbers({ periodCount: nextCount, periodStart: nextStart });
    const orphans = await TimetableEntry.countDocuments({
      timetableId: timetable._id,
      schoolId,
      active: true,
      period: { $nin: allowed }
    });
    if (orphans > 0) {
      throw AppError.conflict(
        `Changing the period configuration would drop ${orphans} existing lesson${orphans === 1 ? "" : "s"}. Delete or move those lessons first.`
      );
    }
    timetable.periodCount = nextCount;
    timetable.periodStart = nextStart;
  }
  if (payload.weekDays !== undefined) {
    timetable.weekDays = parseWeekDays(payload.weekDays);
  }
  if (payload.roomConflictsEnabled !== undefined) {
    timetable.roomConflictsEnabled = Boolean(payload.roomConflictsEnabled);
  }
  const nextShape = {
    periodCount: timetable.periodCount,
    periodStart: timetable.periodStart,
    weekDays: timetable.weekDays,
    firstHalfStart: timetable.firstHalfStart,
    firstHalfEnd: timetable.firstHalfEnd,
    secondHalfStart: timetable.secondHalfStart,
    secondHalfEnd: timetable.secondHalfEnd,
    classIds: timetable.classIds,
    roundDuties: timetable.roundDuties
  };
  if (
    payload.firstHalfStart !== undefined ||
    payload.firstHalfEnd !== undefined ||
    payload.secondHalfStart !== undefined ||
    payload.secondHalfEnd !== undefined
  ) {
    Object.assign(timetable, parseHalfRanges(payload, nextShape));
  }
  if (
    payload.staybackEnabled !== undefined ||
    payload.staybackDay !== undefined ||
    payload.staybackFirstHalfStart !== undefined ||
    payload.staybackFirstHalfEnd !== undefined ||
    payload.staybackSecondHalfStart !== undefined ||
    payload.staybackSecondHalfEnd !== undefined
  ) {
    Object.assign(
      timetable,
      parseStayback(payload, {
        periodCount: timetable.periodCount,
        periodStart: timetable.periodStart,
        weekDays: timetable.weekDays,
        firstHalfStart: timetable.firstHalfStart,
        firstHalfEnd: timetable.firstHalfEnd,
        secondHalfStart: timetable.secondHalfStart,
        secondHalfEnd: timetable.secondHalfEnd
      })
    );
  }
  if (payload.classIds !== undefined) {
    const classIds = parseClassIds(payload, nextShape);
    await assertOwnedClassIds(schoolId, classIds);
    timetable.classIds = classIds;
  }
  if (payload.roundDuties !== undefined) {
    timetable.roundDuties = await normalizeRoundDuties(
      schoolId,
      parseRoundDuties(payload.roundDuties, { ...nextShape, periodCount: timetable.periodCount, periodStart: timetable.periodStart })
    );
  }
  if (payload.status) {
    if (!Object.values(TIMETABLE_STATUS).includes(payload.status)) {
      throw AppError.badRequest("Invalid timetable status");
    }
    timetable.status = payload.status;
  }
  await timetable.save();
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.TIMETABLE_CHANGED,
    entityType: "Timetable",
    entityId: timetable._id,
    metadata: { updated: true }
  });
  return timetable;
}

async function deleteTimetable({ schoolId, actorId, timetableId }) {
  const timetable = await loadOwnedTimetable(schoolId, timetableId);
  const entries = await TimetableEntry.deleteMany({ timetableId: timetable._id, schoolId });
  await TimetableSwap.deleteMany({ timetableId: timetable._id, schoolId });
  await Timetable.deleteOne({ _id: timetable._id, schoolId });
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.TIMETABLE_DELETED,
    entityType: "Timetable",
    entityId: timetable._id,
    metadata: { deletedEntries: entries.deletedCount || 0 }
  });
  return { deleted: true, deletedEntries: entries.deletedCount || 0 };
}

async function createSingleEntry({ schoolId, actorId, timetable, payload }) {
  const valid = await validateEntryPayload({ schoolId, timetable, payload });
  let entry;
  try {
    entry = await TimetableEntry.create({
      timetableId: timetable._id,
      schoolId,
      academicSessionId: timetable.academicSessionId._id || timetable.academicSessionId,
      dayOfWeek: payload.dayOfWeek,
      period: valid.period,
      assignmentType: valid.assignmentType,
      teacherId: payload.teacherId,
      subjectId: valid.subject?._id || null,
      classId: valid.klass?._id || null,
      sectionId: valid.section?._id || null,
      room: valid.room,
      weekPattern: valid.weekPattern,
      combinedLabel: String(payload.combinedLabel || "").trim(),
      comment: normalizeComment(valid.comment !== undefined ? valid.comment : payload.comment),
      assignmentGroupId: payload.assignmentGroupId || null,
      followLeadSection: payload.followLeadSection === true,
      active: true
    });
  } catch (err) {
    if (err.code === 11000) throw mapDuplicateKey(err);
    throw err;
  }
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.TIMETABLE_CHANGED,
    entityType: "TimetableEntry",
    entityId: entry._id
  });
  await entry.populate(ENTRY_POPULATE);
  return presentEntry(entry);
}

function combinedLabelFor(sections) {
  if (!sections.length) return "";
  const className = String(sections[0].classId?.name || sections[0].className || "").replace(/^class\s+/i, "");
  const letters = sections.map((s) => String(s.name || "").replace(/^.*?(?=[A-Za-z0-9]+$)/, "")).join("");
  const compact = sections.map((s) => s.name).join("");
  return compact || `${className}${letters}`;
}

async function addEntry({ schoolId, actorId, timetableId, payload }) {
  const timetable = await loadOwnedTimetable(schoolId, timetableId);
  const assignmentType = normalizeAssignmentType(payload.assignmentType);
  const alternateWeek = payload.alternateWeek === true;
  const partnerTeacherId = payload.partnerTeacherId;
  const weekPattern = normalizeWeekPattern(payload.weekPattern);

  if (assignmentType !== ASSIGNMENT_TYPE.CLASS && (alternateWeek || payload.followLeadSection)) {
    throw AppError.badRequest("Alternate-week combined assignments are only available for Class lessons");
  }

  if (assignmentType !== ASSIGNMENT_TYPE.CLASS) {
    return createSingleEntry({ schoolId, actorId, timetable, payload: { ...payload, assignmentType } });
  }

  let sectionIds = Array.isArray(payload.sectionIds) && payload.sectionIds.length
    ? payload.sectionIds
    : payload.sectionId
      ? [payload.sectionId]
      : [];

  let partnerSubjectId = payload.partnerSubjectId || null;
  if (alternateWeek) {
    if (!partnerTeacherId) {
      throw AppError.badRequest("partnerTeacherId is required for an alternate-week combined assignment");
    }
    const partner = await loadTeacher(schoolId, partnerTeacherId, "Partner teacher");
    assertTeacherActive(partner, "Partner teacher");
    const partnerSubject = await resolveTeacherSubject(partner, partnerSubjectId, partner.name);
    partnerSubjectId = partnerSubject._id;
    if (!sectionIds.length) {
      const resolved = await resolveSectionsFromCombinedLabel(
        schoolId,
        payload.classId,
        payload.combinedLabel
      );
      sectionIds = resolved.map((row) => row._id);
    }
  }

  if (!sectionIds.length) throw AppError.badRequest("sectionId is required");

  const assignmentGroupId =
    sectionIds.length > 1 || alternateWeek || payload.followLeadSection
      ? new mongoose.Types.ObjectId()
      : payload.assignmentGroupId || null;

  let sections = [];
  if (sectionIds.length > 1) {
    sections = await Section.find({ _id: { $in: sectionIds }, schoolId, classId: payload.classId }).sort({
      name: 1
    });
    if (sections.length !== sectionIds.length) {
      throw AppError.badRequest("One or more sections do not belong to this class");
    }
  }

  const label =
    String(payload.combinedLabel || "").trim() ||
    (sections.length > 1 ? combinedLabelFor(sections) : "");
  if (alternateWeek && !label) {
    throw AppError.badRequest("Combined label is required for an alternate-week combined assignment");
  }

  const created = [];
  const teacherA = payload.teacherId;
  const teacherB = partnerTeacherId || payload.teacherId;
  const subjectA = payload.subjectId;
  const subjectB = partnerSubjectId || payload.subjectId;

  for (let i = 0; i < sectionIds.length; i += 1) {
    const sectionId = sectionIds[i];
    if (alternateWeek) {
      if (!partnerTeacherId) {
        throw AppError.badRequest("partnerTeacherId is required for an alternate-week combined assignment");
      }
      const oddTeacher = i % 2 === 0 ? teacherA : teacherB;
      const evenTeacher = i % 2 === 0 ? teacherB : teacherA;
      const oddSubject = i % 2 === 0 ? subjectA : subjectB;
      const evenSubject = i % 2 === 0 ? subjectB : subjectA;
      created.push(
        await createSingleEntry({
          schoolId,
          actorId,
          timetable,
          payload: {
            ...payload,
            sectionId,
            teacherId: oddTeacher,
            subjectId: oddSubject,
            weekPattern: WEEK_PATTERN.ODD,
            combinedLabel: label,
            assignmentGroupId
          }
        })
      );
      created.push(
        await createSingleEntry({
          schoolId,
          actorId,
          timetable,
          payload: {
            ...payload,
            sectionId,
            teacherId: evenTeacher,
            subjectId: evenSubject,
            weekPattern: WEEK_PATTERN.EVEN,
            combinedLabel: label,
            assignmentGroupId
          }
        })
      );
    } else if (payload.followLeadSection === true && partnerTeacherId) {
      created.push(
        await createSingleEntry({
          schoolId,
          actorId,
          timetable,
          payload: {
            ...payload,
            sectionId,
            teacherId: teacherA,
            weekPattern: WEEK_PATTERN.ODD,
            combinedLabel: label,
            assignmentGroupId,
            followLeadSection: true
          }
        })
      );
      created.push(
        await createSingleEntry({
          schoolId,
          actorId,
          timetable,
          payload: {
            ...payload,
            sectionId,
            teacherId: teacherB,
            subjectId: subjectB,
            weekPattern: WEEK_PATTERN.EVEN,
            combinedLabel: label,
            assignmentGroupId,
            followLeadSection: true
          }
        })
      );
    } else {
      created.push(
        await createSingleEntry({
          schoolId,
          actorId,
          timetable,
          payload: {
            ...payload,
            sectionId,
            weekPattern,
            combinedLabel: label,
            assignmentGroupId
          }
        })
      );
    }
  }

  return created.length === 1 ? created[0] : { entries: created };
}

async function updateEntry({ schoolId, actorId, timetableId, entryId, payload }) {
  const timetable = await loadOwnedTimetable(schoolId, timetableId);
  const entry = await TimetableEntry.findOne({ _id: entryId, timetableId: timetable._id, schoolId });
  if (!entry) throw AppError.notFound("Timetable entry not found");

  const next = {
    teacherId: payload.teacherId ?? entry.teacherId,
    subjectId: payload.subjectId !== undefined ? payload.subjectId : entry.subjectId,
    assignmentType: payload.assignmentType ?? entry.assignmentType,
    classId: payload.classId !== undefined ? payload.classId : entry.classId,
    sectionId: payload.sectionId !== undefined ? payload.sectionId : entry.sectionId,
    dayOfWeek: payload.dayOfWeek ?? entry.dayOfWeek,
    period: payload.period ?? entry.period,
    room: payload.room !== undefined ? payload.room : entry.room,
    weekPattern: payload.weekPattern !== undefined ? payload.weekPattern : entry.weekPattern,
    combinedLabel: payload.combinedLabel !== undefined ? payload.combinedLabel : entry.combinedLabel,
    comment: payload.comment !== undefined ? payload.comment : entry.comment
  };
  const assignmentType = normalizeAssignmentType(next.assignmentType);
  if (assignmentType !== ASSIGNMENT_TYPE.CLASS) {
    next.classId = next.classId || null;
    next.sectionId = next.classId ? next.sectionId || null : null;
  }
  next.assignmentType = assignmentType;
  const valid = await validateEntryPayload({
    schoolId,
    timetable,
    payload: next,
    excludeEntryId: entry._id
  });

  entry.teacherId = next.teacherId;
  entry.assignmentType = valid.assignmentType;
  entry.subjectId = valid.subject?._id || null;
  entry.classId = valid.klass?._id || null;
  entry.sectionId = valid.section?._id || null;
  entry.dayOfWeek = next.dayOfWeek;
  entry.period = valid.period;
  entry.room = valid.room;
  entry.weekPattern = valid.weekPattern;
  if (payload.combinedLabel !== undefined) entry.combinedLabel = String(payload.combinedLabel || "").trim();
  if (payload.comment !== undefined) entry.comment = normalizeComment(payload.comment);
  if (payload.followLeadSection !== undefined) entry.followLeadSection = payload.followLeadSection === true;
  try {
    await entry.save();
  } catch (err) {
    if (err.code === 11000) throw mapDuplicateKey(err);
    throw err;
  }

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.TIMETABLE_CHANGED,
    entityType: "TimetableEntry",
    entityId: entry._id,
    metadata: { updated: true }
  });
  await entry.populate(ENTRY_POPULATE);
  return presentEntry(entry);
}

async function removeEntry({ schoolId, actorId, timetableId, entryId }) {
  const timetable = await loadOwnedTimetable(schoolId, timetableId);
  const entry = await TimetableEntry.findOneAndDelete({
    _id: entryId,
    timetableId: timetable._id,
    schoolId
  });
  if (!entry) throw AppError.notFound("Timetable entry not found");
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.TIMETABLE_CHANGED,
    entityType: "TimetableEntry",
    entityId: entry._id,
    metadata: { deleted: true }
  });
  return { deleted: true };
}

async function queryEntries(schoolId, filters) {
  const query = { schoolId, active: true };
  const keys = [
    "timetableId",
    "academicSessionId",
    "teacherId",
    "classId",
    "sectionId",
    "subjectId",
    "dayOfWeek",
    "period"
  ];
  for (const key of keys) {
    if (filters[key] !== undefined && filters[key] !== "") query[key] = filters[key];
  }
  const rows = await TimetableEntry.find(query).populate(ENTRY_POPULATE).sort({ dayOfWeek: 1, period: 1 });
  return rows.map(presentEntry);
}

function periodList(timetable) {
  return periodNumbers(timetable);
}

function cellKey(day, period) {
  return `${day}:${period}`;
}

async function getGrid(schoolId, timetableId) {
  const { timetable, entries } = await getTimetable(schoolId, timetableId);
  const periods = periodList(timetable);
  const cells = {};
  for (const entry of entries) {
    const key = cellKey(entry.dayOfWeek, entry.period);
    if (!cells[key]) cells[key] = [];
    cells[key].push(entry);
  }
  const usedClasses = [];
  const seenClass = new Set();
  for (const entry of entries) {
    if (!entry.classId || seenClass.has(String(entry.classId))) continue;
    seenClass.add(String(entry.classId));
    usedClasses.push({ _id: entry.classId, name: entry.className || "" });
  }
  usedClasses.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return {
    timetable,
    days: gridDaysOf(timetable),
    periods,
    cells,
    entries,
    usedClasses
  };
}

function buildDaySlots(entries, periods, days, match) {
  const byPeriod = new Map();
  for (const entry of entries) {
    if (!match(entry)) continue;
    const key = `${entry.dayOfWeek}:${entry.period}`;
    const current = byPeriod.get(key);
    if (!current) byPeriod.set(key, [entry]);
    else current.push(entry);
  }
  return days.map((day) => ({
    dayOfWeek: day,
    periods: periods.map((period) => {
      const items = byPeriod.get(cellKey(day, period)) || [];
      if (!items.length) return { period, free: true, entries: [] };
      return { period, free: false, ...items[0], entries: items };
    })
  }));
}

async function getTeacherView(schoolId, timetableId, teacherId) {
  const teacher = await Teacher.findOne({ _id: teacherId, schoolId }).select("name employeeCode");
  if (!teacher) throw AppError.notFound("Teacher not found");
  const { timetable, entries } = await getTimetable(schoolId, timetableId);
  const periods = periodList(timetable);
  const days = gridDaysOf(timetable);
  return {
    timetable,
    teacher,
    days,
    periods,
    daysSchedule: buildDaySlots(entries, periods, days, (e) => String(e.teacherId) === String(teacher._id))
  };
}

async function getClassView(schoolId, timetableId, classId, sectionId) {
  const klass = await Class.findOne({ _id: classId, schoolId }).select("name");
  if (!klass) throw AppError.notFound("Class not found");
  let section = null;
  if (sectionId) {
    section = await Section.findOne({ _id: sectionId, schoolId, classId }).select("name classId");
    if (!section) throw AppError.notFound("Section not found for this class");
  }
  const { timetable, entries } = await getTimetable(schoolId, timetableId);
  const periods = periodList(timetable);
  const days = gridDaysOf(timetable);
  return {
    timetable,
    class: klass,
    section,
    days,
    periods,
    daysSchedule: buildDaySlots(entries, periods, days, (e) => {
      if (String(e.classId) !== String(klass._id)) return false;
      if (section) return String(e.sectionId) === String(section._id);
      return true;
    })
  };
}

async function getSectionView(schoolId, timetableId, sectionId) {
  const section = await Section.findOne({ _id: sectionId, schoolId }).select("name classId");
  if (!section) throw AppError.notFound("Section not found");
  return getClassView(schoolId, timetableId, section.classId, section._id);
}

function timetableInDateWindow(tt, dateKey) {
  if (!dateKey) return true;
  const fromOk = !tt.effectiveFrom || tt.effectiveFrom.toISOString().slice(0, 10) <= dateKey;
  const toOk = !tt.effectiveTo || tt.effectiveTo.toISOString().slice(0, 10) >= dateKey;
  return fromOk && toOk;
}

async function findActiveTimetables({ schoolId, academicSessionId, dateKey, timetableId }) {
  const filter = {
    schoolId,
    academicSessionId,
    status: TIMETABLE_STATUS.ACTIVE
  };
  if (timetableId) filter._id = timetableId;
  const timetables = await Timetable.find(filter).sort({ version: -1, name: 1 });
  return timetables.filter((tt) => timetableInDateWindow(tt, dateKey));
}

async function findActiveTimetable({ schoolId, academicSessionId, dateKey, timetableId }) {
  const timetables = await findActiveTimetables({ schoolId, academicSessionId, dateKey, timetableId });
  return timetables[0] || null;
}

module.exports = {
  createTimetable,
  listTimetables,
  getTimetable,
  updateTimetable,
  deleteTimetable,
  addEntry,
  updateEntry,
  removeEntry,
  queryEntries,
  getGrid,
  getTeacherView,
  getClassView,
  getSectionView,
  findActiveTimetable,
  findActiveTimetables,
  presentEntry
};
