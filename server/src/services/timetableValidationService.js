const { TimetableEntry, Teacher, Subject, Class, Section, ClassGroupMembership } = require("../models");
const {
  DAYS_OF_WEEK,
  EMPLOYMENT_STATUS,
  DEFAULT_PERIOD_COUNT,
  MAX_PERIOD_COUNT,
  TIMETABLE_GRID_DAYS,
  WEEK_PATTERN,
  ASSIGNMENT_TYPE,
  ACTIVITY_ASSIGNMENT_TYPES
} = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { weekPatternsOverlap } = require("../utils/academicWeek");

function idStr(value) {
  if (value == null) return "";
  if (typeof value === "object" && (value._id || value.id)) return String(value._id || value.id);
  return String(value);
}

function parsePeriodCount(value, fallback = DEFAULT_PERIOD_COUNT) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PERIOD_COUNT) {
    throw AppError.badRequest(`Period count must be a whole number from 1 to ${MAX_PERIOD_COUNT}`);
  }
  return n;
}

function parsePeriodStart(value, fallback = 1) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (n !== 0 && n !== 1) {
    throw AppError.badRequest("The first period must be Period 0 or Period 1");
  }
  return n;
}

function periodStartOf(timetable) {
  return timetable && timetable.periodStart === 0 ? 0 : 1;
}

function periodNumbers(timetable) {
  const start = periodStartOf(timetable);
  const count = timetable?.periodCount || DEFAULT_PERIOD_COUNT;
  return Array.from({ length: count }, (_, i) => start + i);
}

function parseWeekDays(value, fallback = 6) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (n !== 5 && n !== 6) {
    throw AppError.badRequest("School timetable days must be Monday–Friday (5) or Monday–Saturday (6)");
  }
  return n;
}

function weekDaysOf(timetable) {
  return timetable && Number(timetable.weekDays) === 5 ? 5 : 6;
}

function gridDaysOf(timetable) {
  return TIMETABLE_GRID_DAYS.slice(0, weekDaysOf(timetable));
}

function defaultHalfRanges(timetable) {
  const periods = periodNumbers(timetable);
  if (!periods.length) {
    return { firstHalfStart: 1, firstHalfEnd: 1, secondHalfStart: 1, secondHalfEnd: 1 };
  }
  const mid = Math.ceil(periods.length / 2);
  const first = periods.slice(0, mid);
  const second = periods.slice(mid);
  if (!second.length) {
    return {
      firstHalfStart: first[0],
      firstHalfEnd: first[first.length - 1],
      secondHalfStart: first[0],
      secondHalfEnd: first[first.length - 1]
    };
  }
  return {
    firstHalfStart: first[0],
    firstHalfEnd: first[first.length - 1],
    secondHalfStart: second[0],
    secondHalfEnd: second[second.length - 1]
  };
}

function resolveHalfRanges(timetable) {
  if (
    timetable?.firstHalfStart == null ||
    timetable?.firstHalfEnd == null ||
    timetable?.secondHalfStart == null ||
    timetable?.secondHalfEnd == null
  ) {
    return defaultHalfRanges(timetable);
  }
  return {
    firstHalfStart: Number(timetable.firstHalfStart),
    firstHalfEnd: Number(timetable.firstHalfEnd),
    secondHalfStart: Number(timetable.secondHalfStart),
    secondHalfEnd: Number(timetable.secondHalfEnd)
  };
}

function parseHalfRanges(payload, timetable) {
  const periods = periodNumbers(timetable);
  const allowed = new Set(periods);
  const defaults = defaultHalfRanges(timetable);
  const firstHalfStart =
    payload.firstHalfStart === undefined || payload.firstHalfStart === "" || payload.firstHalfStart == null
      ? timetable.firstHalfStart ?? defaults.firstHalfStart
      : Number(payload.firstHalfStart);
  const firstHalfEnd =
    payload.firstHalfEnd === undefined || payload.firstHalfEnd === "" || payload.firstHalfEnd == null
      ? timetable.firstHalfEnd ?? defaults.firstHalfEnd
      : Number(payload.firstHalfEnd);
  const secondHalfStart =
    payload.secondHalfStart === undefined || payload.secondHalfStart === "" || payload.secondHalfStart == null
      ? timetable.secondHalfStart ?? defaults.secondHalfStart
      : Number(payload.secondHalfStart);
  const secondHalfEnd =
    payload.secondHalfEnd === undefined || payload.secondHalfEnd === "" || payload.secondHalfEnd == null
      ? timetable.secondHalfEnd ?? defaults.secondHalfEnd
      : Number(payload.secondHalfEnd);
  const values = [firstHalfStart, firstHalfEnd, secondHalfStart, secondHalfEnd];
  if (values.some((n) => !Number.isInteger(n) || !allowed.has(n))) {
    throw AppError.badRequest("Half-day period ranges must use periods that exist on this timetable");
  }
  if (firstHalfStart > firstHalfEnd || secondHalfStart > secondHalfEnd) {
    throw AppError.badRequest("Each half-day range must start at or before it ends");
  }
  return { firstHalfStart, firstHalfEnd, secondHalfStart, secondHalfEnd };
}

function emptyStayback() {
  return {
    staybackEnabled: false,
    staybackDay: null,
    staybackFirstHalfStart: null,
    staybackFirstHalfEnd: null,
    staybackSecondHalfStart: null,
    staybackSecondHalfEnd: null
  };
}

function parseStaybackEnabled(value) {
  if (value === true || value === "true" || String(value || "").toUpperCase() === "YES") return true;
  return false;
}

function parseStayback(payload, timetable) {
  if (!parseStaybackEnabled(payload.staybackEnabled)) return emptyStayback();
  const days = gridDaysOf(timetable);
  const day = String(payload.staybackDay || "").trim().toUpperCase();
  if (!day) throw AppError.badRequest("Select which day is stayback day");
  if (!days.includes(day)) {
    throw AppError.badRequest("Stayback day must belong to this timetable's configured school days");
  }
  const required = [
    payload.staybackFirstHalfStart,
    payload.staybackFirstHalfEnd,
    payload.staybackSecondHalfStart,
    payload.staybackSecondHalfEnd
  ];
  if (required.some((n) => n === undefined || n === null || n === "")) {
    throw AppError.badRequest("Stayback half-day period ranges are required");
  }
  const halves = parseHalfRanges(
    {
      firstHalfStart: payload.staybackFirstHalfStart,
      firstHalfEnd: payload.staybackFirstHalfEnd,
      secondHalfStart: payload.staybackSecondHalfStart,
      secondHalfEnd: payload.staybackSecondHalfEnd
    },
    {
      periodCount: timetable.periodCount,
      periodStart: timetable.periodStart,
      firstHalfStart: payload.staybackFirstHalfStart,
      firstHalfEnd: payload.staybackFirstHalfEnd,
      secondHalfStart: payload.staybackSecondHalfStart,
      secondHalfEnd: payload.staybackSecondHalfEnd
    }
  );
  return {
    staybackEnabled: true,
    staybackDay: day,
    staybackFirstHalfStart: halves.firstHalfStart,
    staybackFirstHalfEnd: halves.firstHalfEnd,
    staybackSecondHalfStart: halves.secondHalfStart,
    staybackSecondHalfEnd: halves.secondHalfEnd
  };
}

function resolveHalfRangesForDay(timetable, dayOfWeek) {
  if (
    timetable?.staybackEnabled &&
    timetable.staybackDay &&
    String(dayOfWeek || "").toUpperCase() === String(timetable.staybackDay).toUpperCase() &&
    timetable.staybackFirstHalfStart != null &&
    timetable.staybackFirstHalfEnd != null &&
    timetable.staybackSecondHalfStart != null &&
    timetable.staybackSecondHalfEnd != null
  ) {
    return {
      firstHalfStart: Number(timetable.staybackFirstHalfStart),
      firstHalfEnd: Number(timetable.staybackFirstHalfEnd),
      secondHalfStart: Number(timetable.staybackSecondHalfStart),
      secondHalfEnd: Number(timetable.staybackSecondHalfEnd)
    };
  }
  return resolveHalfRanges(timetable);
}

function normalizeComment(value) {
  return String(value || "").trim();
}

function isPeriodInRange(period, start, end) {
  return Number(period) >= Number(start) && Number(period) <= Number(end);
}

function parseRoundDuties(payloadDuties, timetable) {
  if (payloadDuties == null) return Array.isArray(timetable.roundDuties) ? timetable.roundDuties : [];
  if (!Array.isArray(payloadDuties)) throw AppError.badRequest("Round duty configuration is invalid");
  const seen = new Set();
  return payloadDuties
    .map((floor) => {
      const label = String(floor.label || floor.areaName || "").trim();
      if (!label) return null;
      const key = label.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return { label, classGroupIds: [], slots: [] };
    })
    .filter(Boolean);
}

function parseClassIds(payload, timetable) {
  if (payload.classIds == null) return Array.isArray(timetable.classIds) ? timetable.classIds : [];
  if (!Array.isArray(payload.classIds)) throw AppError.badRequest("Timetable class scope is invalid");
  return payload.classIds.filter(Boolean);
}

function teacherSubjectIds(teacher) {
  return (teacher?.subjects || []).map(idStr).filter(Boolean);
}

function teacherGroupIds(teacher) {
  return (teacher?.eligibleClassGroups || []).map(idStr).filter(Boolean);
}

async function loadTeacher(schoolId, teacherId, label = "Teacher") {
  const teacher = await Teacher.findOne({ _id: teacherId, schoolId });
  if (!teacher) throw AppError.badRequest(`${label} does not belong to this school`);
  return teacher;
}

function assertTeacherActive(teacher, label = "Teacher") {
  if (teacher.active === false) {
    throw AppError.badRequest(`${label} is inactive and cannot be placed on the timetable`);
  }
  if (teacher.employmentStatus && teacher.employmentStatus !== EMPLOYMENT_STATUS.ACTIVE) {
    throw AppError.badRequest(`${label} is not currently employed for timetable assignment`);
  }
}

async function resolveTeacherSubject(teacher, requestedSubjectId, label) {
  const ids = teacherSubjectIds(teacher);
  const who = label || teacher.name || "Teacher";
  if (requestedSubjectId) {
    const subject = await Subject.findOne({ _id: requestedSubjectId, schoolId: teacher.schoolId });
    if (!subject) throw AppError.badRequest("Subject does not belong to this school");
    if (ids.length && !ids.includes(idStr(subject._id))) {
      throw AppError.badRequest(`${who} is not assigned the selected subject`);
    }
    return subject;
  }
  if (ids.length === 1) {
    const subject = await Subject.findOne({ _id: ids[0], schoolId: teacher.schoolId });
    if (!subject) throw AppError.badRequest("Assigned subject was not found");
    return subject;
  }
  if (ids.length > 1) {
    throw AppError.badRequest(`Select a subject assigned to ${who}`);
  }
  throw AppError.badRequest(`No subject is assigned to ${who}`);
}

function classGroupIdList(klass) {
  if (!klass) return [];
  const ids = [];
  if (Array.isArray(klass.classGroupIds)) {
    klass.classGroupIds.forEach((id) => {
      const value = idStr(id);
      if (value) ids.push(value);
    });
  }
  const home = idStr(klass.classGroupId);
  if (home) ids.push(home);
  return [...new Set(ids)];
}

async function groupIdsForClass(klass) {
  const ids = new Set(classGroupIdList(klass));
  if (klass?._id) {
    const memberships = await ClassGroupMembership.find({
      schoolId: klass.schoolId,
      classId: klass._id
    }).select("classGroupId");
    memberships.forEach((row) => {
      const value = idStr(row.classGroupId);
      if (value) ids.add(value);
    });
  }
  return [...ids];
}

async function assertTeacherEligibleForClass(teacher, klass) {
  assertTeacherActive(teacher);
  const groups = teacherGroupIds(teacher);
  if (!groups.length || !klass) return;
  const classGroups = await groupIdsForClass(klass);
  if (classGroups.length && !classGroups.some((id) => groups.includes(id))) {
    throw AppError.badRequest("This teacher is not eligible for this class group");
  }
}

function normalizeAssignmentType(value) {
  if (!value) return ASSIGNMENT_TYPE.CLASS;
  const type = String(value).trim().toUpperCase();
  if (!Object.values(ASSIGNMENT_TYPE).includes(type)) {
    throw AppError.badRequest("Lesson type must be Normal Class, Meeting, or Activity");
  }
  return type;
}

function compactClassCode(className, sectionName) {
  const section = String(sectionName || "").replace(/\s+/g, "");
  if (section && /\d/.test(section) && /[A-Za-z]/.test(section)) return section;
  const klass = String(className || "").replace(/^class\s+/i, "").replace(/\s+/g, "");
  if (section && klass && section.toUpperCase().startsWith(klass.toUpperCase())) return section;
  return `${klass}${section}`;
}

function assignmentDisplayLabel({ assignmentType, combinedLabel, className, sectionName, comment }) {
  const type = assignmentType || ASSIGNMENT_TYPE.CLASS;
  const note = String(comment || "").trim();
  if (type === ASSIGNMENT_TYPE.MEETING) {
    return note ? `Meeting — ${note}` : "Meeting";
  }
  if (type === ASSIGNMENT_TYPE.ACTIVITY) {
    const code = compactClassCode(className, sectionName);
    const base = code || "Activity";
    return note ? `${base} — ${note}` : base;
  }
  if (ACTIVITY_ASSIGNMENT_TYPES.includes(type)) {
    const code = compactClassCode(className, sectionName);
    const base = code ? `${code}-${type}` : type;
    return note ? `${base} — ${note}` : base;
  }
  const classLabel = combinedLabel || [className, sectionName].filter(Boolean).join(" ");
  if (note) return classLabel ? `${classLabel} · ${note}` : note;
  return classLabel;
}

function assertDay(dayOfWeek) {
  if (!DAYS_OF_WEEK.includes(dayOfWeek)) {
    throw AppError.badRequest("Day must be a valid weekday");
  }
}

function assertPeriod(timetable, period) {
  const n = Number(period);
  const allowed = periodNumbers(timetable);
  if (!Number.isInteger(n) || !allowed.includes(n)) {
    throw AppError.badRequest(`Period must be one of ${allowed.join(", ")} for this timetable`);
  }
  return n;
}

async function resolveSectionsFromCombinedLabel(schoolId, classId, combinedLabel) {
  const label = String(combinedLabel || "").trim().toUpperCase();
  if (!label) {
    throw AppError.badRequest("Combined label is required for an alternate-week combined assignment");
  }
  const letters = label.replace(/[^A-Z]/g, "");
  if (letters.length < 2) {
    throw AppError.badRequest("Combined label must name at least two sections, for example 7AB");
  }
  const sections = await Section.find({ schoolId, classId, active: { $ne: false } }).sort({ name: 1 });
  const matched = [];
  for (const letter of letters.split("")) {
    const found = sections.find((row) => {
      const name = String(row.name || "")
        .toUpperCase()
        .replace(/\s+/g, "");
      return name === letter || name.endsWith(letter);
    });
    if (!found) {
      throw AppError.badRequest(`Combined label ${label} does not match a section for this class`);
    }
    if (!matched.some((s) => idStr(s._id) === idStr(found._id))) matched.push(found);
  }
  if (matched.length < 2) {
    throw AppError.badRequest("Combined label must resolve to at least two different sections");
  }
  return matched;
}

async function assertNoConflicts({
  timetable,
  dayOfWeek,
  period,
  teacherId,
  classId,
  sectionId,
  room,
  weekPattern,
  assignmentType,
  excludeEntryId
}) {
  const filter = {
    timetableId: timetable._id,
    dayOfWeek,
    period,
    active: true
  };
  if (excludeEntryId) filter._id = { $ne: excludeEntryId };
  const existing = await TimetableEntry.find(filter);
  const pattern = weekPattern || WEEK_PATTERN.EVERY;
  const activity = assignmentType === ASSIGNMENT_TYPE.ACTIVITY;

  for (const row of existing) {
    if (!weekPatternsOverlap(row.weekPattern || WEEK_PATTERN.EVERY, pattern)) continue;
    if (!activity) {
      if (idStr(row.teacherId) === idStr(teacherId)) {
        throw AppError.conflict("This teacher is already assigned to another class in this period.");
      }
      if (classId && sectionId && idStr(row.classId) === idStr(classId) && idStr(row.sectionId) === idStr(sectionId)) {
        throw AppError.conflict("This class section already has a subject in this period.");
      }
    }
    const a = String(room || "").trim().toLowerCase();
    const b = String(row.room || "").trim().toLowerCase();
    if (timetable.roomConflictsEnabled !== false && a && b && a === b) {
      throw AppError.conflict(`Room ${room.trim()} is already assigned in this period.`);
    }
  }
}

function mapDuplicateKey(err) {
  const keys = Object.keys(err.keyPattern || err.keyValue || {});
  if (keys.includes("teacherId")) {
    return AppError.conflict("This teacher is already assigned to another class in this period.");
  }
  if (keys.includes("sectionId")) {
    return AppError.conflict("This class section already has a subject in this period.");
  }
  return AppError.conflict("This slot conflicts with an existing timetable entry.");
}

function normalizeWeekPattern(value) {
  if (!value) return WEEK_PATTERN.EVERY;
  if (!Object.values(WEEK_PATTERN).includes(value)) {
    throw AppError.badRequest("Week pattern must be EVERY, ODD, or EVEN");
  }
  return value;
}

async function resolveOptionalSubject(teacher, requestedSubjectId) {
  if (requestedSubjectId) {
    return resolveTeacherSubject(teacher, requestedSubjectId, teacher.name);
  }
  const ids = teacherSubjectIds(teacher);
  if (ids.length === 1) {
    return Subject.findOne({ _id: ids[0], schoolId: teacher.schoolId });
  }
  return null;
}

async function validateEntryPayload({ schoolId, timetable, payload, excludeEntryId }) {
  assertDay(payload.dayOfWeek);
  const period = assertPeriod(timetable, payload.period);
  const teacher = await loadTeacher(schoolId, payload.teacherId, "Teacher");
  assertTeacherActive(teacher);
  const assignmentType = normalizeAssignmentType(payload.assignmentType);
  const room = String(payload.room || "").trim();
  const weekPattern = normalizeWeekPattern(payload.weekPattern);
  const comment = normalizeComment(payload.comment);

  if (assignmentType === ASSIGNMENT_TYPE.MEETING) {
    payload = { ...payload, classId: null, sectionId: null };
  }

  if (assignmentType !== ASSIGNMENT_TYPE.CLASS) {
    const subject = await resolveOptionalSubject(teacher, payload.subjectId);
    let klass = null;
    let section = null;
    if (payload.classId) {
      klass = await Class.findOne({ _id: payload.classId, schoolId });
      if (!klass) throw AppError.badRequest("Class does not belong to this school");
      await assertTeacherEligibleForClass(teacher, klass);
      if (payload.sectionId) {
        section = await Section.findOne({ _id: payload.sectionId, schoolId });
        if (!section) throw AppError.badRequest("Section does not belong to this school");
        if (idStr(section.classId) !== idStr(payload.classId)) {
          throw AppError.badRequest("Section does not belong to the selected class");
        }
      }
    } else if (payload.sectionId) {
      throw AppError.badRequest("Select a class before selecting a section");
    }
    await assertNoConflicts({
      timetable,
      dayOfWeek: payload.dayOfWeek,
      period,
      teacherId: payload.teacherId,
      classId: klass?._id || null,
      sectionId: section?._id || null,
      room,
      weekPattern,
      assignmentType,
      excludeEntryId
    });
    return { teacher, subject, klass, section, period, room, weekPattern, assignmentType, comment };
  }

  const klass = await Class.findOne({ _id: payload.classId, schoolId });
  if (!klass) throw AppError.badRequest("Class does not belong to this school");
  await assertTeacherEligibleForClass(teacher, klass);

  let subject = await resolveTeacherSubject(teacher, payload.subjectId, teacher.name);

  if (!payload.sectionId) {
    throw AppError.badRequest(
      assignmentType === ASSIGNMENT_TYPE.CLASS
        ? "Section is required for a normal lesson"
        : "Section is required for this assignment type"
    );
  }
  const section = await Section.findOne({ _id: payload.sectionId, schoolId });
  if (!section) throw AppError.badRequest("Section does not belong to this school");
  if (idStr(section.classId) !== idStr(payload.classId)) {
    throw AppError.badRequest("Section does not belong to the selected class");
  }
  await assertNoConflicts({
    timetable,
    dayOfWeek: payload.dayOfWeek,
    period,
    teacherId: payload.teacherId,
    classId: payload.classId,
    sectionId: payload.sectionId,
    room,
    weekPattern,
    assignmentType,
    excludeEntryId
  });
  return { teacher, subject, klass, section, period, room, weekPattern, assignmentType, comment };
}

module.exports = {
  idStr,
  parsePeriodCount,
  parsePeriodStart,
  periodStartOf,
  periodNumbers,
  parseWeekDays,
  weekDaysOf,
  gridDaysOf,
  teacherSubjectIds,
  teacherGroupIds,
  loadTeacher,
  resolveTeacherSubject,
  assertTeacherActive,
  assertTeacherEligibleForClass,
  resolveSectionsFromCombinedLabel,
  validateEntryPayload,
  mapDuplicateKey,
  assertPeriod,
  normalizeWeekPattern,
  normalizeAssignmentType,
  assignmentDisplayLabel,
  compactClassCode,
  classGroupIdList,
  groupIdsForClass,
  defaultHalfRanges,
  resolveHalfRanges,
  parseHalfRanges,
  parseStayback,
  resolveHalfRangesForDay,
  normalizeComment,
  isPeriodInRange,
  parseRoundDuties,
  parseClassIds
};
