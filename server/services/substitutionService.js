const { teachers } = require("../data/teachers");
const { timetables } = require("../data/timetables");

function normalizeDay(day) {
  return (day || "Monday").trim();
}

function getTeacherById(teacherId) {
  return teachers.find((t) => t.id === teacherId) || null;
}

function getDayTimetable(teacherId, day) {
  const d = normalizeDay(day);
  return (
    timetables.find((tt) => tt.teacherId === teacherId && tt.day === d) || null
  );
}

function getPeriodEntry(teacherId, day, period) {
  const tt = getDayTimetable(teacherId, day);
  if (!tt) return null;
  return tt.periods.find((p) => p.period === period) || null;
}

function isTeacherFree(teacherId, day, period) {
  const entry = getPeriodEntry(teacherId, day, period);
  // If no timetable entry exists, treat as BUSY to avoid bad assignments
  if (!entry) return false;
  return entry.class == null;
}

function getFreePeriodsCount(teacherId, day) {
  const tt = getDayTimetable(teacherId, day);
  if (!tt) return 0;
  return tt.periods.filter((p) => p.class == null).length;
}

function chooseRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildInitialStats(day, substitutions) {
  const statsByTeacherId = new Map();
  for (const t of teachers) {
    statsByTeacherId.set(t.id, {
      teacherId: t.id,
      freePeriodsCount: getFreePeriodsCount(t.id, day),
      substitutionCount: 0,
      assignedPeriods: new Set()
    });
  }

  // If substitutions already exist, include them in stats (supports regenerate/partial runs)
  for (const row of substitutions || []) {
    const st = statsByTeacherId.get(row.substituteTeacherId);
    if (st) {
      st.substitutionCount += 1;
      st.assignedPeriods.add(row.period);
    }
  }

  return statsByTeacherId;
}

function getAbsentTeachers(attendanceByTeacherId) {
  const absent = [];
  for (const t of teachers) {
    const status = attendanceByTeacherId.get(t.id) || "present";
    if (status === "absent") absent.push(t);
  }
  return absent;
}

function getPresentTeacherIds(attendanceByTeacherId) {
  const present = new Set();
  for (const t of teachers) {
    const status = attendanceByTeacherId.get(t.id) || "present";
    if (status === "present") present.add(t.id);
  }
  return present;
}

function generateSubstitutions({ day, attendanceByTeacherId, existingSubstitutions }) {
  const d = normalizeDay(day);
  const substitutions = Array.isArray(existingSubstitutions)
    ? [...existingSubstitutions]
    : [];

  const absentTeachers = getAbsentTeachers(attendanceByTeacherId);
  const presentTeacherIds = getPresentTeacherIds(attendanceByTeacherId);

  // Fairness stats used by scoring and anti-repeat rules
  const statsByTeacherId = buildInitialStats(d, substitutions);

  // Track period occupancy to ensure "never assign teacher already busy that period"
  // (busy = either has class OR already assigned as substitute in that period)
  const assignedSubByPeriod = new Map(); // period -> Set(teacherId)
  for (const row of substitutions) {
    if (!assignedSubByPeriod.has(row.period)) assignedSubByPeriod.set(row.period, new Set());
    assignedSubByPeriod.get(row.period).add(row.substituteTeacherId);
  }

  const results = [];

  for (const absentTeacher of absentTeachers) {
    const tt = getDayTimetable(absentTeacher.id, d);
    if (!tt) continue;

    // STEP 2: periods where absent teacher has classes
    const teachingPeriods = tt.periods.filter((p) => p.class != null);

    for (const p of teachingPeriods) {
      const period = p.period;
      const className = p.class;

      // Skip if already generated for this absent teacher + period (idempotency)
      const already = substitutions.find(
        (r) => r.absentTeacherId === absentTeacher.id && r.period === period
      );
      if (already) continue;

      // STEP 3: candidates = PRESENT and FREE at that period
      const candidates = teachers
        .filter((t) => presentTeacherIds.has(t.id))
        .filter((t) => t.id !== absentTeacher.id)
        .filter((t) => isTeacherFree(t.id, d, period))
        .filter((t) => {
  const st = statsByTeacherId.get(t.id);
  if (!st) return false;

  return !assignedSubByPeriod.get(period)?.has(t.id);
})

      if (candidates.length === 0) {
        const row = {
          id: `${d}-${absentTeacher.id}-${period}`,
          day: d,
          period,
          className,
          absentTeacherId: absentTeacher.id,
          absentTeacherName: absentTeacher.name,
          substituteTeacherId: null,
          substituteTeacherName: "NO SUBSTITUTE",
          score: null,
          reason: "No present teacher free in this period"
        };
        substitutions.push(row);
        results.push(row);
        continue;
      }

      // STEP 4: rank with score = freePeriodsCount - substitutionCount
      // plus small penalties to reduce repeats/back-to-back
      const scored = candidates.map((t) => {
        const st = statsByTeacherId.get(t.id);
        const baseScore = st.freePeriodsCount - st.substitutionCount;

        // fairness penalties (small, so core formula still dominates)
        const backToBackPenalty =
          st.assignedPeriods.has(period - 1) || st.assignedPeriods.has(period + 1) ? 0.25 : 0;
        const loadPenalty = st.substitutionCount * 0.05;

        return {
          teacher: t,
          score: baseScore - backToBackPenalty - loadPenalty
        };
      });

      const maxScore = Math.max(...scored.map((s) => s.score));
      const top = scored.filter((s) => s.score === maxScore);

      // STEP 5: if multiple -> random
      const chosen = chooseRandom(top).teacher;
      const chosenStat = statsByTeacherId.get(chosen.id);
      chosenStat.substitutionCount += 1;
      chosenStat.assignedPeriods.add(period);
      if (!assignedSubByPeriod.has(period)) assignedSubByPeriod.set(period, new Set());
      assignedSubByPeriod.get(period).add(chosen.id);

      const row = {
        id: `${d}-${absentTeacher.id}-${period}`,
        day: d,
        period,
        className,
        absentTeacherId: absentTeacher.id,
        absentTeacherName: absentTeacher.name,
        substituteTeacherId: chosen.id,
        substituteTeacherName: chosen.name,
        score: maxScore,
        reason: null
      };

      substitutions.push(row);
      results.push(row);
    }
  }

  return { day: d, substitutions, newlyGenerated: results };
}

function applyManualOverride({ day, substitutions, attendanceByTeacherId, period, absentTeacherId, substituteTeacherId }) {
  const d = normalizeDay(day);
  const rowIdx = substitutions.findIndex(
    (r) => r.day === d && r.period === period && r.absentTeacherId === absentTeacherId
  );
  if (rowIdx === -1) {
    return { ok: false, error: "Row not found" };
  }

  if (substituteTeacherId == null) {
    substitutions[rowIdx] = {
      ...substitutions[rowIdx],
      substituteTeacherId: null,
      substituteTeacherName: "NO SUBSTITUTE",
      reason: "Manual override"
    };
    return { ok: true, row: substitutions[rowIdx] };
  }

  const status = attendanceByTeacherId.get(substituteTeacherId) || "present";
  if (status !== "present") {
    return { ok: false, error: "Selected teacher is not present" };
  }

  // Ensure teacher is free and not already assigned substitute in that period
  if (!isTeacherFree(substituteTeacherId, d, period)) {
    return { ok: false, error: "Selected teacher is not free in that period" };
  }
  const collision = substitutions.some(
    (r) => r.day === d && r.period === period && r.substituteTeacherId === substituteTeacherId
  );
  if (collision) {
    return { ok: false, error: "Selected teacher already assigned in that period" };
  }

  const t = getTeacherById(substituteTeacherId);
  substitutions[rowIdx] = {
    ...substitutions[rowIdx],
    substituteTeacherId,
    substituteTeacherName: t ? t.name : String(substituteTeacherId),
    reason: "Manual override"
  };

  return { ok: true, row: substitutions[rowIdx] };
}

module.exports = {
  normalizeDay,
  getTeacherById,
  getDayTimetable,
  isTeacherFree,
  getFreePeriodsCount,
  generateSubstitutions,
  applyManualOverride
};

