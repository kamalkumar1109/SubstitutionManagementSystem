const {
  Teacher,
  Class,
  DailyTeacherStatus,
  Substitution,
  SubstitutionRun,
  AcademicSession,
  RoundDutyAssignment,
  TimetableEntry
} = require("../models");
const {
  SUBSTITUTION_SOURCE,
  SUBSTITUTION_STATUS,
  SUBSTITUTION_RUN_STATUS,
  AUDIT_ACTIONS,
  ENGINE_VERSION,
  ASSIGNMENT_TYPE
} = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { writeAudit } = require("./auditService");
const { loadEffectiveDay } = require("./timetableSwapService");
const {
  generateAssignments,
  validateManualSubstitute,
  pickRoundDutyTeacher,
  buildEntryLookups,
  refId,
  substitutionSlotKey
} = require("./substitutionEngine");
const { resolveSchoolToday, rejectNonToday } = require("./schoolToday");
const { withClassGroupIds } = require("./catalogService");
const { resolveHalfRangesForDay, periodNumbers, assignmentDisplayLabel } = require("./timetableValidationService");
const { findActiveTimetables } = require("./timetableService");

const substitutionPopulate = [
  { path: "classId", select: "name classGroupId" },
  { path: "sectionId", select: "name" },
  { path: "subjectId", select: "name code" },
  { path: "absentTeacherId", select: "name" },
  { path: "substituteTeacherId", select: "name" },
  { path: "generatedSubstituteTeacherId", select: "name" },
  { path: "override.previousSubstituteTeacherId", select: "name" },
  { path: "override.newSubstituteTeacherId", select: "name" },
  { path: "override.overriddenBy", select: "name email" }
];

async function resolveSession(schoolId, academicSessionId, school) {
  if (academicSessionId) {
    const session = await AcademicSession.findOne({ _id: academicSessionId, schoolId });
    if (!session) throw AppError.notFound("Academic session not found");
    return session;
  }
  if (!school?.currentAcademicSession) {
    throw AppError.badRequest("No current academic session for this school");
  }
  const session = await AcademicSession.findOne({
    _id: school.currentAcademicSession,
    schoolId
  });
  if (!session) throw AppError.badRequest("Current academic session is invalid");
  return session;
}

function presentSubstitution(row) {
  const informational =
    Boolean(row.informational) || row.assignmentType === ASSIGNMENT_TYPE.MEETING;
  const unassigned =
    !informational && (row.status === SUBSTITUTION_STATUS.UNASSIGNED || !row.substituteTeacherId);
  const overridden = row.status === SUBSTITUTION_STATUS.OVERRIDDEN || row.source === SUBSTITUTION_SOURCE.MANUAL;
  const originalName = row.generatedSubstituteTeacherId?.name || row.override?.previousSubstituteTeacherId?.name || "";
  let statusLabel = "Generated";
  if (informational) statusLabel = "Meeting";
  else if (row.source === SUBSTITUTION_SOURCE.SWAP) statusLabel = "Swap";
  else if (unassigned) statusLabel = "Unassigned";
  else if (overridden) statusLabel = "Manually overridden";

  const named = informational
    ? "—"
    : unassigned
      ? "No suitable substitute available"
      : row.substituteTeacherId?.name || "—";
  const finalName = row.source === SUBSTITUTION_SOURCE.SWAP && !unassigned && !informational ? `SWAP ${named}` : named;
  const comment = row.comment || "";
  const displayLabel = informational
    ? assignmentDisplayLabel({
        assignmentType: ASSIGNMENT_TYPE.MEETING,
        comment
      })
    : assignmentDisplayLabel({
        assignmentType: row.assignmentType,
        className: row.classId?.name || "",
        sectionName: row.sectionId?.name || "",
        comment
      }) || row.classId?.name || "";

  return {
    _id: row._id,
    timetableId: row.timetableId || null,
    period: row.period,
    classId: row.classId?._id || row.classId,
    sectionId: row.sectionId?._id || row.sectionId,
    subjectId: row.subjectId?._id || row.subjectId,
    className: row.classId?.name || "—",
    sectionName: row.sectionId?.name || "—",
    subjectName: row.subjectId?.name || "—",
    absentTeacherId: row.absentTeacherId?._id || row.absentTeacherId,
    substituteTeacherId: row.substituteTeacherId?._id || row.substituteTeacherId || null,
    generatedSubstituteTeacherId:
      row.generatedSubstituteTeacherId?._id || row.generatedSubstituteTeacherId || null,
    absentTeacherName: row.absentTeacherId?.name || "—",
    substituteTeacherName: named,
    finalSubstituteName: finalName,
    originalSubstituteName: originalName || (unassigned ? "" : finalName),
    status: row.status,
    statusLabel,
    source: row.source,
    reason: row.reason || (unassigned ? "No suitable substitute available" : ""),
    assignmentType: row.assignmentType || "",
    comment,
    displayLabel,
    informational,
    dateKey: row.dateKey,
    override: row.override
      ? {
          previousSubstituteTeacherId:
            row.override.previousSubstituteTeacherId?._id || row.override.previousSubstituteTeacherId || null,
          previousSubstituteName: row.override.previousSubstituteTeacherId?.name || originalName || "",
          newSubstituteTeacherId:
            row.override.newSubstituteTeacherId?._id || row.override.newSubstituteTeacherId || null,
          changedBy: row.override.overriddenBy?.name || "",
          changedById: row.override.overriddenBy?._id || row.override.overriddenBy || null,
          changedAt: row.override.overriddenAt || null,
          reason: row.override.reason || ""
        }
      : null
  };
}

async function loadGenerationContext({ schoolId, academicSessionId, dateKey, dayOfWeek, timetableId }) {
  const { school } = await resolveSchoolToday(schoolId);
  const session = await resolveSession(schoolId, academicSessionId, school);
  const effectiveDay = await loadEffectiveDay({
    schoolId,
    dateKey,
    academicSessionId: session._id,
    timetableId
  });

  const [classes, statusRows, existingSubstitutions] = await Promise.all([
    Class.find({ schoolId }),
    DailyTeacherStatus.find({ schoolId, academicSessionId: session._id, dateKey }),
    Substitution.find({
      schoolId,
      academicSessionId: session._id,
      dateKey,
      timetableId: effectiveDay.timetable._id
    })
  ]);

  const classesWithGroups = await withClassGroupIds(schoolId, classes);
  const classesById = new Map(classesWithGroups.map((c) => [String(c._id), c]));
  const statusByTeacherId = new Map(statusRows.map((r) => [String(r.teacherId), r.status]));

  return {
    school,
    session,
    timetable: effectiveDay.timetable,
    dayOfWeek: effectiveDay.dayOfWeek,
    week: effectiveDay.week,
    teachers: effectiveDay.teachers,
    classesById,
    statusByTeacherId,
    timetableEntries: (effectiveDay.effective || []).map((entry) => ({
      ...(entry.toObject ? entry.toObject() : entry),
      teacherId: entry.teacherId?._id || entry.teacherId,
      classId: entry.classId?._id || entry.classId,
      sectionId: entry.sectionId?._id || entry.sectionId,
      subjectId: entry.subjectId?._id || entry.subjectId,
      schoolId: entry.schoolId,
      academicSessionId: entry.academicSessionId,
      timetableId: entry.timetableId || effectiveDay.timetable._id,
      assignmentType: entry.assignmentType,
      comment: entry.comment || ""
    })),
    existingSubstitutions
  };
}

async function listSubstitutions({ schoolId, academicSessionId, date, timetableId }) {
  const { school, dateKey } = await resolveSchoolToday(schoolId);
  if (date) {
    const { normalizeDateKey } = require("../utils/dates");
    try {
      normalizeDateKey(date);
    } catch {
      throw AppError.badRequest("Invalid date");
    }
  }
  const session = await resolveSession(schoolId, academicSessionId, school);
  const dateFilter = date ? require("../utils/dates").normalizeDateKey(date) : dateKey;
  const filter = {
    schoolId,
    academicSessionId: session._id,
    dateKey: dateFilter
  };
  if (timetableId) filter.timetableId = timetableId;
  const rows = await Substitution.find(filter)
    .populate(substitutionPopulate)
    .sort({ period: 1, classId: 1 });
  return rows.map(presentSubstitution);
}

async function generateForToday({ schoolId, academicSessionId, date, generatedBy, timetableId }) {
  if (!timetableId) {
    throw AppError.badRequest("Select a timetable before generating substitutions");
  }
  const { dateKey, dayOfWeek } = await resolveSchoolToday(schoolId);
  rejectNonToday(date, dateKey, "Substitutions can only be generated for today");

  const ctx = await loadGenerationContext({
    schoolId,
    academicSessionId,
    dateKey,
    dayOfWeek,
    timetableId
  });

  const remaining = await Substitution.find({
    schoolId,
    academicSessionId: ctx.session._id,
    dateKey,
    timetableId: ctx.timetable._id
  });

  const run = await SubstitutionRun.create({
    schoolId,
    academicSessionId: ctx.session._id,
    dateKey,
    generatedBy: generatedBy || null,
    generatedAt: new Date(),
    status: SUBSTITUTION_RUN_STATUS.PENDING,
    generationVersion: ENGINE_VERSION,
    weekCount: ctx.week.weekCount
  });

  try {
    const halves = resolveHalfRangesForDay(ctx.timetable, dayOfWeek);
    const { assignments, engineVersion, neededKeys } = generateAssignments({
      schoolId,
      academicSessionId: ctx.session._id,
      timetableId: ctx.timetable._id,
      dateKey,
      dayOfWeek,
      teachers: ctx.teachers,
      classesById: ctx.classesById,
      statusByTeacherId: ctx.statusByTeacherId,
      timetableEntries: ctx.timetableEntries,
      existingSubstitutions: remaining,
      halves
    });

    const needed = new Set(neededKeys || []);
    for (const row of remaining) {
      if (row.source !== SUBSTITUTION_SOURCE.GENERATED) continue;
      if (row.status !== SUBSTITUTION_STATUS.ASSIGNED && row.status !== SUBSTITUTION_STATUS.UNASSIGNED) continue;
      const key =
        row.slotKey ||
        substitutionSlotKey({
          timetableId: ctx.timetable._id,
          period: row.period,
          absentTeacherId: row.absentTeacherId,
          classId: row.classId,
          sectionId: row.sectionId
        });
      if (!needed.has(key)) {
        await row.deleteOne();
      }
    }

    const created = [];
    for (const row of assignments) {
      const { dayOfWeek: _day, ...persist } = row;
      const doc = await Substitution.create({
        ...persist,
        substitutionRunId: run._id,
        generatedSubstituteTeacherId: persist.substituteTeacherId || null,
        slotKey:
          persist.slotKey ||
          substitutionSlotKey({
            timetableId: ctx.timetable._id,
            period: persist.period,
            absentTeacherId: persist.absentTeacherId,
            classId: persist.classId,
            sectionId: persist.sectionId
          })
      });
      created.push(doc);
    }

    const live = await Substitution.find({
      schoolId,
      academicSessionId: ctx.session._id,
      dateKey,
      timetableId: ctx.timetable._id
    })
      .populate(substitutionPopulate)
      .sort({ period: 1, classId: 1 });
    const snapshot = live.map(presentSubstitution);

    run.status = SUBSTITUTION_RUN_STATUS.COMPLETED;
    run.generationVersion = engineVersion;
    run.snapshot = snapshot;
    run.summary = {
      created: created.length,
      assigned: created.filter((r) => r.status === SUBSTITUTION_STATUS.ASSIGNED).length,
      unassigned: created.filter((r) => r.status === SUBSTITUTION_STATUS.UNASSIGNED).length,
      preservedOverrides: remaining.length,
      weekCount: ctx.week.weekCount,
      weekParity: ctx.week.weekParity
    };
    await run.save();

    await syncRoundDutyAssignments({
      schoolId,
      timetableId: ctx.timetable._id,
      dateKey,
      actorId: generatedBy
    });

    await writeAudit({
      schoolId,
      actorId: generatedBy,
      action: AUDIT_ACTIONS.SUBSTITUTION_GENERATED,
      entityType: "SubstitutionRun",
      entityId: run._id,
      metadata: { dateKey, dayOfWeek, ...run.summary }
    });

    return {
      run,
      dateKey,
      dayOfWeek,
      substitutions: snapshot
    };
  } catch (err) {
    run.status = SUBSTITUTION_RUN_STATUS.FAILED;
    run.summary = { error: err.message };
    await run.save();
    throw err;
  }
}

function presentRoundDuties(assignments, areas, periods, teachersById) {
  const labels = (areas || []).map((row) => String(row.label || "").trim()).filter(Boolean);
  return labels.map((label) => {
    const byPeriod = {};
    const slots = {};
    for (const period of periods || []) {
      const row = (assignments || []).find(
        (item) => item.areaName === label && Number(item.period) === Number(period)
      );
      const teacher = row?.teacherId
        ? teachersById.get(String(row.teacherId._id || row.teacherId))
        : null;
      const name = teacher?.name || row?.teacherId?.name || "";
      const unassigned = !name || row?.status === SUBSTITUTION_STATUS.UNASSIGNED;
      byPeriod[period] = unassigned ? "UNASSIGNED" : name;
      slots[period] = row
        ? {
            _id: row._id,
            period,
            kind: "ROUND_DUTY",
            label,
            teacherName: name,
            unassigned,
            finalSubstituteName: unassigned ? "UNASSIGNED" : name
          }
        : null;
    }
    return { label, byPeriod, slots };
  });
}

async function syncRoundDutyAssignments({ schoolId, timetableId, dateKey, actorId }) {
  const { dateKey: todayKey, dayOfWeek } = await resolveSchoolToday(schoolId);
  const key = dateKey || todayKey;
  const ctx = await loadGenerationContext({
    schoolId,
    dateKey: key,
    dayOfWeek,
    timetableId
  });
  const areas = (ctx.timetable.roundDuties || [])
    .map((row) => String(row.label || "").trim())
    .filter(Boolean);
  const periods = periodNumbers(ctx.timetable);
  const substitutions = await Substitution.find({
    schoolId,
    academicSessionId: ctx.session._id,
    dateKey: key,
    timetableId: ctx.timetable._id,
    status: { $ne: SUBSTITUTION_STATUS.CANCELLED }
  });
  const existing = await RoundDutyAssignment.find({
    schoolId,
    timetableId: ctx.timetable._id,
    dateKey: key
  });
  const areaSet = new Set(areas);
  for (const row of existing) {
    if (!areaSet.has(row.areaName) || !periods.includes(Number(row.period))) {
      await row.deleteOne();
    }
  }
  const leftover = await RoundDutyAssignment.find({
    schoolId,
    timetableId: ctx.timetable._id,
    dateKey: key
  });
  const halves = resolveHalfRangesForDay(ctx.timetable, ctx.dayOfWeek);
  const { entriesByTeacherPeriod } = buildEntryLookups(ctx.timetableEntries, ctx.teachers);
  const assignedSubByPeriod = new Map();
  const dutyCountByTeacher = new Map();
  for (const row of substitutions) {
    if (!row.substituteTeacherId) continue;
    if (!assignedSubByPeriod.has(row.period)) assignedSubByPeriod.set(row.period, new Set());
    assignedSubByPeriod.get(row.period).add(String(row.substituteTeacherId));
    const subKey = `sub:${String(row.substituteTeacherId)}`;
    dutyCountByTeacher.set(subKey, (dutyCountByTeacher.get(subKey) || 0) + 1);
  }
  for (const row of leftover) {
    if (row.source !== SUBSTITUTION_SOURCE.MANUAL || !row.teacherId) continue;
    if (!assignedSubByPeriod.has(row.period)) assignedSubByPeriod.set(row.period, new Set());
    assignedSubByPeriod.get(row.period).add(String(row.teacherId));
    dutyCountByTeacher.set(String(row.teacherId), (dutyCountByTeacher.get(String(row.teacherId)) || 0) + 1);
  }

  for (const period of periods) {
    if (!assignedSubByPeriod.has(period)) assignedSubByPeriod.set(period, new Set());
    for (const areaName of areas) {
      const current = leftover.find(
        (row) => row.areaName === areaName && Number(row.period) === Number(period)
      );
      if (current && current.source === SUBSTITUTION_SOURCE.MANUAL && current.teacherId) {
        continue;
      }
      const chosen = pickRoundDutyTeacher({
        schoolId,
        period,
        teachers: ctx.teachers,
        statusByTeacherId: ctx.statusByTeacherId,
        entriesByTeacherPeriod,
        assignedSubByPeriod,
        halves,
        dutyCountByTeacher
      });
      const payload = {
        schoolId,
        academicSessionId: ctx.session._id,
        timetableId: ctx.timetable._id,
        dateKey: key,
        areaName,
        period,
        teacherId: chosen?._id || null,
        source: SUBSTITUTION_SOURCE.GENERATED,
        status: chosen ? SUBSTITUTION_STATUS.ASSIGNED : SUBSTITUTION_STATUS.UNASSIGNED
      };
      if (current) {
        if (current.source === SUBSTITUTION_SOURCE.MANUAL) {
          current.teacherId = payload.teacherId;
          current.status = payload.status;
          current.source = SUBSTITUTION_SOURCE.GENERATED;
          await current.save();
        } else {
          Object.assign(current, payload);
          await current.save();
        }
      } else {
        await RoundDutyAssignment.create(payload);
      }
      if (chosen) {
        assignedSubByPeriod.get(period).add(String(chosen._id));
        dutyCountByTeacher.set(String(chosen._id), (dutyCountByTeacher.get(String(chosen._id)) || 0) + 1);
      }
    }
  }
  return { ok: true, actorId };
}

async function getTodayBoard({ schoolId, timetableId }) {
  const { school, dateKey, dayOfWeek, timezone } = await resolveSchoolToday(schoolId);
  const dailyStatusService = require("./dailyStatusService");
  const status = await dailyStatusService.listDailyStatus({ schoolId });

  let substitutions = [];
  let timetable = null;
  let latestRun = null;
  let boardRuns = [];
  let dayEntries = [];
  let periodCount = 8;
  let periodStart = 1;
  let weekDays = 6;
  let weekInfo = null;
  let timetables = [];
  let roundDuties = [];
  let halves = null;
  let usedClasses = [];
  let teachers = [];
  try {
    const session = await resolveSession(schoolId, null, school);
    timetables = await findActiveTimetables({
      schoolId,
      academicSessionId: session._id,
      dateKey
    });
    if (timetableId) {
      const effectiveDay = await loadEffectiveDay({
        schoolId,
        dateKey,
        academicSessionId: session._id,
        timetableId
      });
      timetable = effectiveDay.timetable;
      weekInfo = effectiveDay.week;
      substitutions = await listSubstitutions({
        schoolId,
        date: dateKey,
        timetableId: timetable._id
      });
      latestRun = await SubstitutionRun.findOne({
        schoolId,
        academicSessionId: session._id,
        dateKey
      }).sort({ generatedAt: -1 });
      dayEntries = (effectiveDay.effective || []).map((row) => {
        const teacher = effectiveDay.teachersById.get(String(row.teacherId?._id || row.teacherId));
        return {
          period: row.period,
          className: row.classId?.name || "",
          sectionName: row.sectionId?.name || "",
          subjectName: row.subjectId?.name || "",
          teacherName: teacher?.name || row.teacherId?.name || "",
          weekPattern: row.weekPattern || "EVERY",
          assignmentType: row.assignmentType || "",
          comment: row.comment || "",
          displayLabel: row.displayLabel || ""
        };
      });
      periodCount = timetable.periodCount || 8;
      periodStart = timetable.periodStart === 0 ? 0 : 1;
      weekDays = timetable.weekDays === 5 ? 5 : 6;
      halves = resolveHalfRangesForDay(timetable, dayOfWeek);
      const dutyRows = await RoundDutyAssignment.find({
        schoolId,
        timetableId: timetable._id,
        dateKey
      }).populate("teacherId", "name");
      roundDuties = presentRoundDuties(
        dutyRows,
        timetable.roundDuties,
        periodNumbers(timetable),
        effectiveDay.teachersById
      );
      const teacherIdSet = new Set((effectiveDay.teachers || []).map((t) => String(t._id)));
      teachers = (status.rows || []).filter((row) => teacherIdSet.has(String(row.teacher?._id)));
      const classIds = await TimetableEntry.distinct("classId", {
        schoolId,
        timetableId: timetable._id,
        active: true,
        classId: { $ne: null }
      });
      if (classIds.length) {
        const classRows = await Class.find({ _id: { $in: classIds }, schoolId }).select("name");
        usedClasses = classRows.map((row) => ({ _id: row._id, name: row.name }));
      }
    }
  } catch {
    substitutions = [];
  }

  return {
    dateKey,
    dayOfWeek,
    timezone,
    schoolName: school.name,
    timetable: timetable
      ? {
          _id: timetable._id,
          name: timetable.name,
          firstHalfStart: timetable.firstHalfStart,
          firstHalfEnd: timetable.firstHalfEnd,
          secondHalfStart: timetable.secondHalfStart,
          secondHalfEnd: timetable.secondHalfEnd,
          staybackEnabled: Boolean(timetable.staybackEnabled),
          staybackDay: timetable.staybackDay || null
        }
      : null,
    timetables: timetables.map((tt) => ({ _id: tt._id, name: tt.name })),
    usedClasses,
    teachers,
    substitutions,
    latestRun: latestRun
      ? {
          _id: latestRun._id,
          status: latestRun.status,
          summary: latestRun.summary,
          generatedAt: latestRun.generatedAt
        }
      : null,
    runs: boardRuns,
    dayEntries,
    roundDuties,
    halves,
    periodCount,
    periodStart,
    weekDays,
    weekCount: weekInfo?.weekCount || null,
    weekParity: weekInfo?.weekParity || null
  };
}

async function applyManualOverride({
  schoolId,
  academicSessionId,
  actorId,
  date,
  substitutionId,
  period,
  classId,
  sectionId,
  absentTeacherId,
  substituteTeacherId,
  reason
}) {
  const { dateKey, dayOfWeek } = await resolveSchoolToday(schoolId);
  rejectNonToday(date, dateKey, "Overrides can only be applied for today");

  const row = substitutionId
    ? await Substitution.findOne({ _id: substitutionId, schoolId, dateKey })
    : await Substitution.findOne({
        schoolId,
        dateKey,
        period: Number(period),
        classId,
        sectionId,
        absentTeacherId
      });
  if (!row) throw AppError.notFound("Substitution row not found");
  if (row.informational || row.assignmentType === ASSIGNMENT_TYPE.MEETING) {
    throw AppError.badRequest("Meeting periods cannot be assigned a class substitute");
  }

  const ctx = await loadGenerationContext({
    schoolId,
    academicSessionId,
    dateKey,
    dayOfWeek,
    timetableId: row.timetableId
  });

  const previousSubstituteTeacherId = row.substituteTeacherId;

  if (substituteTeacherId == null || substituteTeacherId === "") {
    row.substituteTeacherId = null;
    row.status = SUBSTITUTION_STATUS.UNASSIGNED;
    row.source = SUBSTITUTION_SOURCE.MANUAL;
    row.reason = reason || "No suitable substitute available";
    row.override = {
      overriddenBy: actorId,
      overriddenAt: new Date(),
      previousSubstituteTeacherId,
      newSubstituteTeacherId: null,
      reason: reason || "Manual override"
    };
    await row.save();
  } else {
    const teacher = ctx.teachers.find((t) => String(t._id) === String(substituteTeacherId));
    if (!teacher) throw AppError.badRequest("Substitute teacher not found in this school");

    const klass = ctx.classesById.get(refId(row.classId));
    const { entriesByTeacherPeriod } = buildEntryLookups(ctx.timetableEntries, ctx.teachers);
    const assignedSubByPeriod = new Map();
    for (const existing of ctx.existingSubstitutions) {
      if (!existing.substituteTeacherId) continue;
      if (String(existing._id) === String(row._id)) continue;
      if (existing.status === SUBSTITUTION_STATUS.CANCELLED) continue;
      if (!assignedSubByPeriod.has(existing.period)) assignedSubByPeriod.set(existing.period, new Set());
      assignedSubByPeriod.get(existing.period).add(String(existing.substituteTeacherId));
    }
    const dutyOccupied = await RoundDutyAssignment.find({
      schoolId,
      timetableId: ctx.timetable._id,
      dateKey,
      teacherId: { $ne: null }
    });
    for (const duty of dutyOccupied) {
      if (!assignedSubByPeriod.has(duty.period)) assignedSubByPeriod.set(duty.period, new Set());
      assignedSubByPeriod.get(duty.period).add(String(duty.teacherId));
    }

    const check = validateManualSubstitute({
      schoolId,
      teacher,
      classGroupIds: klass?.classGroupIds?.length ? klass.classGroupIds : [klass?.classGroupId],
      period: row.period,
      statusByTeacherId: ctx.statusByTeacherId,
      entriesByTeacherPeriod,
      assignedSubByPeriod,
      halves: resolveHalfRangesForDay(ctx.timetable, ctx.dayOfWeek),
      requireClassGroup: false
    });
    if (!check.ok) throw AppError.badRequest(check.reason);

    row.substituteTeacherId = teacher._id;
    row.status = SUBSTITUTION_STATUS.OVERRIDDEN;
    row.source = SUBSTITUTION_SOURCE.MANUAL;
    row.reason = reason || "Manual override";
    row.override = {
      overriddenBy: actorId,
      overriddenAt: new Date(),
      previousSubstituteTeacherId,
      newSubstituteTeacherId: teacher._id,
      reason: reason || "Manual override"
    };
    await row.save();
  }

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.SUBSTITUTION_OVERRIDDEN,
    entityType: "Substitution",
    entityId: row._id,
    metadata: {
      dateKey,
      period: row.period,
      previousSubstituteTeacherId: previousSubstituteTeacherId
        ? String(previousSubstituteTeacherId)
        : null,
      newSubstituteTeacherId: row.substituteTeacherId ? String(row.substituteTeacherId) : null,
      reason: row.override.reason
    }
  });

  return presentSubstitution(await row.populate(substitutionPopulate));
}

async function assignmentLookups(ctx, exceptSubstitutionId, extra = {}) {
  const { entriesByTeacherPeriod } = buildEntryLookups(ctx.timetableEntries, ctx.teachers);
  const assignedSubByPeriod = new Map();
  for (const existing of ctx.existingSubstitutions) {
    if (!existing.substituteTeacherId) continue;
    if (exceptSubstitutionId && String(existing._id) === String(exceptSubstitutionId)) continue;
    if (existing.status === SUBSTITUTION_STATUS.CANCELLED) continue;
    if (!assignedSubByPeriod.has(existing.period)) assignedSubByPeriod.set(existing.period, new Set());
    assignedSubByPeriod.get(existing.period).add(String(existing.substituteTeacherId));
  }
  if (extra.dateKey && ctx.timetable?._id) {
    const duties = await RoundDutyAssignment.find({
      schoolId: ctx.school._id,
      timetableId: ctx.timetable._id,
      dateKey: extra.dateKey,
      teacherId: { $ne: null }
    });
    for (const duty of duties) {
      if (extra.exceptDutyId && String(duty._id) === String(extra.exceptDutyId)) continue;
      if (!assignedSubByPeriod.has(duty.period)) assignedSubByPeriod.set(duty.period, new Set());
      assignedSubByPeriod.get(duty.period).add(String(duty.teacherId));
    }
  }
  return { entriesByTeacherPeriod, assignedSubByPeriod };
}

async function listOverrideCandidates({ schoolId, substitutionId, q }) {
  const { dateKey, dayOfWeek } = await resolveSchoolToday(schoolId);
  const row = await Substitution.findOne({ _id: substitutionId, schoolId, dateKey }).populate(
    substitutionPopulate
  );
  if (!row) throw AppError.notFound("Substitution row not found");
  if (row.informational || row.assignmentType === ASSIGNMENT_TYPE.MEETING) {
    return { substitution: presentSubstitution(row), candidates: [] };
  }
  const ctx = await loadGenerationContext({
    schoolId,
    dateKey,
    dayOfWeek,
    timetableId: row.timetableId
  });

  const klass = ctx.classesById.get(refId(row.classId));
  const { entriesByTeacherPeriod, assignedSubByPeriod } = await assignmentLookups(ctx, row._id, {
    dateKey
  });
  const needle = String(q || "").trim().toLowerCase();

  const candidates = [];
  for (const teacher of ctx.teachers) {
    if (String(teacher._id) === String(row.absentTeacherId)) continue;
    if (teacher.active === false) continue;
    const check = validateManualSubstitute({
      schoolId,
      teacher,
      classGroupIds: klass?.classGroupIds?.length ? klass.classGroupIds : [klass?.classGroupId],
      period: row.period,
      statusByTeacherId: ctx.statusByTeacherId,
      entriesByTeacherPeriod,
      assignedSubByPeriod,
      halves: resolveHalfRangesForDay(ctx.timetable, ctx.dayOfWeek),
      requireClassGroup: false
    });
    if (!check.ok) continue;
    if (
      needle &&
      ![teacher.name, teacher.employeeCode, teacher.designation]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    ) {
      continue;
    }
    candidates.push({
      _id: teacher._id,
      name: teacher.name,
      employeeCode: teacher.employeeCode || "",
      designation: teacher.designation || ""
    });
  }

  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return { substitution: presentSubstitution(row), candidates };
}

async function listRuns({ schoolId }) {
  const { school, dateKey } = await resolveSchoolToday(schoolId);
  const session = await resolveSession(schoolId, null, school);
  return SubstitutionRun.find({ schoolId, academicSessionId: session._id })
    .sort({ generatedAt: -1 })
    .limit(50)
    .select("dateKey status summary generatedAt snapshot generatedBy");
}

async function buildTodayPdf({ schoolId, timetableId }) {
  if (!timetableId) {
    throw AppError.badRequest("Select a timetable before downloading the substitution PDF");
  }
  const board = await getTodayBoard({ schoolId, timetableId });
  const { buildSubstitutionPdfBuffer, pdfFilename } = require("./pdf/substitutionPdfService");
  const buffer = buildSubstitutionPdfBuffer({
    schoolName: board.schoolName,
    dateKey: board.dateKey,
    dayOfWeek: board.dayOfWeek,
    substitutions: board.substitutions,
    dayEntries: board.dayEntries,
    periodCount: board.periodCount,
    periodStart: board.periodStart,
    roundDuties: board.roundDuties
  });
  return {
    buffer,
    filename: pdfFilename({ dateKey: board.dateKey }),
    substitutions: board.substitutions
  };
}

async function listRoundDutyCandidates({ schoolId, assignmentId, q }) {
  const { dateKey, dayOfWeek } = await resolveSchoolToday(schoolId);
  const row = await RoundDutyAssignment.findOne({ _id: assignmentId, schoolId, dateKey }).populate(
    "teacherId",
    "name"
  );
  if (!row) throw AppError.notFound("Round duty assignment not found");
  const ctx = await loadGenerationContext({
    schoolId,
    dateKey,
    dayOfWeek,
    timetableId: row.timetableId
  });
  const { entriesByTeacherPeriod, assignedSubByPeriod } = await assignmentLookups(ctx, null, {
    dateKey,
    exceptDutyId: row._id
  });
  const needle = String(q || "").trim().toLowerCase();
  const candidates = [];
  for (const teacher of ctx.teachers) {
    if (teacher.active === false) continue;
    const check = validateManualSubstitute({
      schoolId,
      teacher,
      period: row.period,
      statusByTeacherId: ctx.statusByTeacherId,
      entriesByTeacherPeriod,
      assignedSubByPeriod,
      halves: resolveHalfRangesForDay(ctx.timetable, ctx.dayOfWeek),
      requireClassGroup: false
    });
    if (!check.ok) continue;
    if (
      needle &&
      ![teacher.name, teacher.employeeCode, teacher.designation]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    ) {
      continue;
    }
    candidates.push({
      _id: teacher._id,
      name: teacher.name,
      employeeCode: teacher.employeeCode || "",
      designation: teacher.designation || ""
    });
  }
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return {
    substitution: {
      _id: row._id,
      period: row.period,
      kind: "ROUND_DUTY",
      className: `${row.areaName} Round Duty`,
      sectionName: "",
      subjectName: "",
      absentTeacherName: "Round duty",
      finalSubstituteName: row.teacherId?.name || "UNASSIGNED"
    },
    candidates
  };
}

async function applyRoundDutyOverride({ schoolId, actorId, assignmentId, substituteTeacherId, reason }) {
  const { dateKey, dayOfWeek } = await resolveSchoolToday(schoolId);
  const row = await RoundDutyAssignment.findOne({ _id: assignmentId, schoolId, dateKey });
  if (!row) throw AppError.notFound("Round duty assignment not found");
  const ctx = await loadGenerationContext({
    schoolId,
    dateKey,
    dayOfWeek,
    timetableId: row.timetableId
  });
  const teacher = ctx.teachers.find((t) => String(t._id) === String(substituteTeacherId));
  if (!teacher) throw AppError.badRequest("Substitute teacher not found in this school");
  const { entriesByTeacherPeriod, assignedSubByPeriod } = await assignmentLookups(ctx, null, {
    dateKey,
    exceptDutyId: row._id
  });
  const check = validateManualSubstitute({
    schoolId,
    teacher,
    period: row.period,
    statusByTeacherId: ctx.statusByTeacherId,
    entriesByTeacherPeriod,
    assignedSubByPeriod,
      halves: resolveHalfRangesForDay(ctx.timetable, ctx.dayOfWeek),
    requireClassGroup: false
  });
  if (!check.ok) throw AppError.badRequest(check.reason);
  row.teacherId = teacher._id;
  row.status = SUBSTITUTION_STATUS.OVERRIDDEN;
  row.source = SUBSTITUTION_SOURCE.MANUAL;
  await row.save();
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.SUBSTITUTION_OVERRIDDEN,
    entityType: "RoundDutyAssignment",
    entityId: row._id,
    metadata: { dateKey, period: row.period, areaName: row.areaName, reason: reason || "" }
  });
  return row;
}

module.exports = {
  generateForToday,
  generateForDate: generateForToday,
  listSubstitutions,
  applyManualOverride,
  getTodayBoard,
  listOverrideCandidates,
  listRoundDutyCandidates,
  applyRoundDutyOverride,
  syncRoundDutyAssignments,
  listRuns,
  buildTodayPdf,
  presentSubstitution
};
