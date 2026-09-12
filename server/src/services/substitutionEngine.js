const {
  DAILY_TEACHER_STATUS,
  EMPLOYMENT_STATUS,
  SUBSTITUTION_SOURCE,
  SUBSTITUTION_STATUS,
  ASSIGNMENT_TYPE,
  ENGINE_VERSION
} = require("../config/constants");
const { idsEqual, toIdSet } = require("../utils/dates");
const { resolveHalfRanges, isPeriodInRange } = require("./timetableValidationService");

const NO_SUBSTITUTE_REASON = "No suitable substitute available";

function refId(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }
  return String(value);
}

const scorePlugins = [];

function registerScorePlugin(plugin) {
  if (typeof plugin !== "function") {
    throw new Error("Score plugin must be a function");
  }
  scorePlugins.push(plugin);
}

function resetScorePlugins() {
  scorePlugins.length = 0;
}

function dailyStatusFor(teacherId, statusByTeacherId) {
  return statusByTeacherId.get(refId(teacherId)) || DAILY_TEACHER_STATUS.PRESENT;
}

function isEmployable(teacher) {
  return teacher.active !== false && teacher.employmentStatus === EMPLOYMENT_STATUS.ACTIVE;
}

function isPresentForDuty(teacherId, statusByTeacherId) {
  const status = dailyStatusFor(teacherId, statusByTeacherId);
  return status === DAILY_TEACHER_STATUS.PRESENT;
}

function teacherCanCoverPeriod(teacherId, period, statusByTeacherId, halves) {
  const status = dailyStatusFor(teacherId, statusByTeacherId);
  if (status === DAILY_TEACHER_STATUS.PRESENT) return true;
  if (status === DAILY_TEACHER_STATUS.FIRST_HALF_OFF) {
    return isPeriodInRange(period, halves.secondHalfStart, halves.secondHalfEnd);
  }
  if (status === DAILY_TEACHER_STATUS.SECOND_HALF_OFF) {
    return isPeriodInRange(period, halves.firstHalfStart, halves.firstHalfEnd);
  }
  return false;
}

function periodNeedsCover(teacherId, period, statusByTeacherId, halves) {
  const status = dailyStatusFor(teacherId, statusByTeacherId);
  if (status === DAILY_TEACHER_STATUS.ABSENT || status === DAILY_TEACHER_STATUS.ON_DUTY) return true;
  if (status === DAILY_TEACHER_STATUS.FIRST_HALF_OFF) {
    return isPeriodInRange(period, halves.firstHalfStart, halves.firstHalfEnd);
  }
  if (status === DAILY_TEACHER_STATUS.SECOND_HALF_OFF) {
    return isPeriodInRange(period, halves.secondHalfStart, halves.secondHalfEnd);
  }
  return false;
}

function substitutionSlotKey({ timetableId, period, absentTeacherId, classId, sectionId }) {
  return [
    String(timetableId || ""),
    String(period),
    String(absentTeacherId || ""),
    String(classId || "-"),
    String(sectionId || "-")
  ].join(":");
}

function isEligibleForClassGroup(teacher, classGroupId) {
  if (!classGroupId) return false;
  const groups = teacher.eligibleClassGroups || [];
  if (groups.length === 0) return false;
  const wanted = refId(classGroupId);
  return groups.some((id) => refId(id) === wanted);
}

function isEligibleForClassGroups(teacher, classGroupIds) {
  const ids = Array.isArray(classGroupIds) ? classGroupIds : [classGroupIds];
  return ids.some((id) => isEligibleForClassGroup(teacher, id));
}

function teacherTeachesSubject(teacher, subjectId) {
  if (!subjectId) return false;
  const subjects = teacher.subjects || [];
  const wanted = refId(subjectId);
  return subjects.some((id) => refId(id) === wanted);
}

function isTeacherFree({ teacherId, period, entriesByTeacherPeriod, assignedSubByPeriod }) {
  const teaching = entriesByTeacherPeriod.get(`${String(teacherId)}:${period}`);
  if (teaching) return false;
  if (assignedSubByPeriod.get(period)?.has(String(teacherId))) return false;
  return true;
}

function belongsToSchool(teacher, schoolId) {
  return idsEqual(teacher.schoolId, schoolId);
}

function defaultScore(teacherStat, context) {
  const sameSubjectBonus = context.sameSubject ? 12 : 0;
  const availability = teacherStat.freePeriodsCount || 0;
  const fairnessPenalty = (teacherStat.substitutionCount || 0) * 4;
  const workloadPenalty = (teacherStat.teachingLoad || 0) * 0.2;
  const backToBackPenalty =
    teacherStat.assignedPeriods.has(context.period - 1) ||
    teacherStat.assignedPeriods.has(context.period + 1)
      ? 0.5
      : 0;
  return sameSubjectBonus + availability - fairnessPenalty - workloadPenalty - backToBackPenalty;
}

function scoreCandidate(candidate, context) {
  const stat = context.statsByTeacherId.get(refId(candidate._id)) || {
    freePeriodsCount: 0,
    substitutionCount: 0,
    teachingLoad: 0,
    assignedPeriods: new Set()
  };
  let score = defaultScore(stat, context);
  for (const plugin of scorePlugins) {
    score = plugin(score, candidate, context);
  }
  return score;
}

function pickBest(scored, statsByTeacherId) {
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ca = statsByTeacherId.get(refId(a.teacher._id))?.substitutionCount || 0;
    const cb = statsByTeacherId.get(refId(b.teacher._id))?.substitutionCount || 0;
    if (ca !== cb) return ca - cb;
    return String(a.teacher.name || "").localeCompare(String(b.teacher.name || ""));
  });
  return scored[0].teacher;
}

function buildEntryLookups(entries, teachers = []) {
  const entriesByTeacherPeriod = new Map();
  const freePeriodsByTeacher = new Map();
  const teachingLoadByTeacher = new Map();
  const periods = new Set();

  for (const entry of entries) {
    if (entry.active === false) continue;
    periods.add(entry.period);
    const tid = refId(entry.teacherId);
    entriesByTeacherPeriod.set(`${tid}:${entry.period}`, entry);
    teachingLoadByTeacher.set(tid, (teachingLoadByTeacher.get(tid) || 0) + 1);
  }

  const periodList = [...periods];
  const teacherIds = new Set([
    ...teachers.map((t) => refId(t._id)),
    ...[...teachingLoadByTeacher.keys()]
  ]);
  for (const teacherId of teacherIds) {
    let free = 0;
    for (const period of periodList) {
      if (!entriesByTeacherPeriod.has(`${teacherId}:${period}`)) free += 1;
    }
    freePeriodsByTeacher.set(teacherId, periodList.length ? free : 0);
  }

  return { entriesByTeacherPeriod, freePeriodsByTeacher, teachingLoadByTeacher };
}

function buildStats({ teachers, freePeriodsByTeacher, teachingLoadByTeacher, existingSubstitutions }) {
  const statsByTeacherId = new Map();
  for (const t of teachers) {
    const id = refId(t._id);
    statsByTeacherId.set(id, {
      teacherId: t._id,
      freePeriodsCount: freePeriodsByTeacher.get(id) || 0,
      teachingLoad: teachingLoadByTeacher.get(id) || 0,
      substitutionCount: 0,
      assignedPeriods: new Set()
    });
  }
  for (const row of existingSubstitutions || []) {
    if (!row.substituteTeacherId) continue;
    if (row.status === SUBSTITUTION_STATUS.CANCELLED) continue;
    const st = statsByTeacherId.get(String(row.substituteTeacherId));
    if (!st) continue;
    st.substitutionCount += 1;
    st.assignedPeriods.add(row.period);
  }
  return statsByTeacherId;
}

function passesHardRules({
  teacher,
  schoolId,
  classGroupId,
  classGroupIds,
  period,
  statusByTeacherId,
  entriesByTeacherPeriod,
  assignedSubByPeriod,
  requireClassGroup = true,
  halves
}) {
  if (!belongsToSchool(teacher, schoolId)) {
    return { ok: false, reason: "Teacher belongs to a different school" };
  }
  if (!isEmployable(teacher)) {
    return { ok: false, reason: "Teacher is not active" };
  }
  if (!teacherCanCoverPeriod(teacher._id, period, statusByTeacherId, halves || resolveHalfRanges({}))) {
    return { ok: false, reason: "Teacher is not available in this period" };
  }
  if (requireClassGroup && !isEligibleForClassGroups(teacher, classGroupIds || classGroupId)) {
    return { ok: false, reason: "Teacher is not eligible for this class group" };
  }
  if (!isTeacherFree({ teacherId: teacher._id, period, entriesByTeacherPeriod, assignedSubByPeriod })) {
    return { ok: false, reason: "Teacher is not free in this period" };
  }
  return { ok: true };
}

/**
 * Generate substitution assignments for one school/date/timetable snapshot.
 * Does not persist. Does not mutate timetable documents.
 */
function generateAssignments({
  schoolId,
  academicSessionId,
  timetableId,
  dateKey,
  dayOfWeek,
  teachers,
  classesById,
  statusByTeacherId,
  timetableEntries,
  existingSubstitutions,
  halves
}) {
  const halfRanges = halves || resolveHalfRanges({});
  const scopedTeachers = (teachers || []).filter((t) => belongsToSchool(t, schoolId));
  const scopedEntries = (timetableEntries || []).filter(
    (e) =>
      e.active !== false &&
      idsEqual(e.schoolId, schoolId) &&
      idsEqual(e.academicSessionId, academicSessionId)
  );
  const scopedExisting = (existingSubstitutions || []).filter((row) =>
    idsEqual(row.schoolId, schoolId)
  );

  const { entriesByTeacherPeriod, freePeriodsByTeacher, teachingLoadByTeacher } = buildEntryLookups(
    scopedEntries,
    scopedTeachers
  );
  const statsByTeacherId = buildStats({
    teachers: scopedTeachers,
    freePeriodsByTeacher,
    teachingLoadByTeacher,
    existingSubstitutions: scopedExisting
  });

  const assignedSubByPeriod = new Map();
  for (const row of scopedExisting) {
    if (!row.substituteTeacherId) continue;
    if (row.status === SUBSTITUTION_STATUS.CANCELLED) continue;
    if (!assignedSubByPeriod.has(row.period)) assignedSubByPeriod.set(row.period, new Set());
    assignedSubByPeriod.get(row.period).add(String(row.substituteTeacherId));
  }

  const existingKeys = new Set(
    scopedExisting
      .filter((r) => r.status !== SUBSTITUTION_STATUS.CANCELLED)
      .map((r) =>
        substitutionSlotKey({
          timetableId: r.timetableId || timetableId,
          period: r.period,
          absentTeacherId: r.absentTeacherId,
          classId: r.classId,
          sectionId: r.sectionId
        })
      )
  );

  const neededKeys = new Set();
  const assignments = [];

  for (const absentTeacher of scopedTeachers) {
    const teachingEntries = scopedEntries.filter((e) => idsEqual(e.teacherId, absentTeacher._id));

    for (const entry of teachingEntries) {
      if (!periodNeedsCover(absentTeacher._id, entry.period, statusByTeacherId, halfRanges)) continue;
      const assignmentType = entry.assignmentType || ASSIGNMENT_TYPE.CLASS;
      if (assignmentType === ASSIGNMENT_TYPE.MEETING) continue;

      const key = substitutionSlotKey({
        timetableId: entry.timetableId || timetableId,
        period: entry.period,
        absentTeacherId: absentTeacher._id,
        classId: entry.classId,
        sectionId: entry.sectionId
      });
      neededKeys.add(key);
      if (existingKeys.has(key)) continue;

      const comment = String(entry.comment || "").trim();
      const baseRow = {
        schoolId,
        academicSessionId,
        timetableId: entry.timetableId || timetableId || null,
        dateKey,
        dayOfWeek,
        period: entry.period,
        classId: entry.classId || null,
        sectionId: entry.sectionId || null,
        absentTeacherId: absentTeacher._id,
        subjectId: entry.subjectId || null,
        slotKey: key,
        assignmentType,
        comment,
        informational: false
      };

      const klass = classesById.get(refId(entry.classId));
      const classGroupIds = klass
        ? klass.classGroupIds && klass.classGroupIds.length
          ? klass.classGroupIds
          : [klass.classGroupId]
        : [];

      const candidates = scopedTeachers.filter((t) => {
        if (idsEqual(t._id, absentTeacher._id)) return false;
        return passesHardRules({
          teacher: t,
          schoolId,
          classGroupIds,
          period: entry.period,
          statusByTeacherId,
          entriesByTeacherPeriod,
          assignedSubByPeriod,
          requireClassGroup: Boolean(klass),
          halves: halfRanges
        }).ok;
      });

      if (candidates.length === 0) {
        assignments.push({
          ...baseRow,
          substituteTeacherId: null,
          source: SUBSTITUTION_SOURCE.GENERATED,
          status: SUBSTITUTION_STATUS.UNASSIGNED,
          score: null,
          reason: NO_SUBSTITUTE_REASON
        });
        continue;
      }

      const scored = candidates.map((t) => ({
        teacher: t,
        score: scoreCandidate(t, {
          period: entry.period,
          statsByTeacherId,
          entry,
          classGroupId: classGroupIds[0] || null,
          absentTeacher,
          sameSubject: teacherTeachesSubject(t, entry.subjectId)
        })
      }));
      const chosen = pickBest(scored, statsByTeacherId);
      const maxScore = scored.find((s) => refId(s.teacher._id) === refId(chosen._id)).score;

      const chosenStat = statsByTeacherId.get(String(chosen._id));
      chosenStat.substitutionCount += 1;
      chosenStat.assignedPeriods.add(entry.period);
      if (!assignedSubByPeriod.has(entry.period)) assignedSubByPeriod.set(entry.period, new Set());
      assignedSubByPeriod.get(entry.period).add(String(chosen._id));

      assignments.push({
        ...baseRow,
        substituteTeacherId: chosen._id,
        source: SUBSTITUTION_SOURCE.GENERATED,
        status: SUBSTITUTION_STATUS.ASSIGNED,
        score: maxScore,
        reason: ""
      });
    }
  }

  return { assignments, engineVersion: ENGINE_VERSION, neededKeys: [...neededKeys] };
}

function pickRoundDutyTeacher({
  schoolId,
  period,
  teachers,
  statusByTeacherId,
  entriesByTeacherPeriod,
  assignedSubByPeriod,
  halves,
  dutyCountByTeacher
}) {
  const halfRanges = halves || resolveHalfRanges({});
  const candidates = (teachers || []).filter((teacher) =>
    passesHardRules({
      teacher,
      schoolId,
      period,
      statusByTeacherId,
      entriesByTeacherPeriod,
      assignedSubByPeriod,
      requireClassGroup: false,
      halves: halfRanges
    }).ok
  );
  const counts = dutyCountByTeacher || new Map();
  candidates.sort((a, b) => {
    const da = counts.get(refId(a._id)) || 0;
    const db = counts.get(refId(b._id)) || 0;
    if (da !== db) return da - db;
    const ca = counts.get(`sub:${refId(a._id)}`) || 0;
    const cb = counts.get(`sub:${refId(b._id)}`) || 0;
    if (ca !== cb) return ca - cb;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  return candidates[0] || null;
}

function validateManualSubstitute({
  schoolId,
  teacher,
  classGroupId,
  classGroupIds,
  period,
  statusByTeacherId,
  entriesByTeacherPeriod,
  assignedSubByPeriod,
  halves,
  requireClassGroup = false
}) {
  return passesHardRules({
    teacher,
    schoolId,
    classGroupId,
    classGroupIds,
    period,
    statusByTeacherId,
    entriesByTeacherPeriod,
    assignedSubByPeriod,
    requireClassGroup,
    halves: halves || resolveHalfRanges({})
  });
}

module.exports = {
  ENGINE_VERSION,
  NO_SUBSTITUTE_REASON,
  registerScorePlugin,
  resetScorePlugins,
  generateAssignments,
  validateManualSubstitute,
  pickRoundDutyTeacher,
  isEligibleForClassGroup,
  isEligibleForClassGroups,
  teacherTeachesSubject,
  dailyStatusFor,
  buildEntryLookups,
  substitutionSlotKey,
  periodNeedsCover,
  teacherCanCoverPeriod,
  toIdSet,
  refId
};
