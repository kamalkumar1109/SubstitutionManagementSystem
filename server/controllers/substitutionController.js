const { teachers } = require("../data/teachers");
const { attendanceSeed } = require("../data/attendanceSeed");
const { attendanceByTeacherId, substitutionsByDay, resetDay } = require("../data/store");
const { generateSubstitutions, applyManualOverride, normalizeDay } = require("../services/substitutionService");

function ensureSeeded() {
  if (attendanceByTeacherId.size === 0) {
    for (const a of attendanceSeed) attendanceByTeacherId.set(a.teacherId, a.status);
  }
}

function getStatsForDay(day, substitutions) {
  const d = normalizeDay(day);
  const substitutionCountByTeacherId = new Map();
  for (const t of teachers) substitutionCountByTeacherId.set(t.id, 0);
  for (const row of substitutions || []) {
    if (row.day !== d) continue;
    if (row.substituteTeacherId == null) continue;
    substitutionCountByTeacherId.set(
      row.substituteTeacherId,
      (substitutionCountByTeacherId.get(row.substituteTeacherId) || 0) + 1
    );
  }
  return {
    substitutionCountByTeacherId: Object.fromEntries(substitutionCountByTeacherId.entries())
  };
}

function generate(req, res) {
  ensureSeeded();
  const day = normalizeDay((req.body && req.body.day) || "Monday");
  const existing = substitutionsByDay.get(day) || [];

  const { substitutions } = generateSubstitutions({
    day,
    attendanceByTeacherId,
    existingSubstitutions: existing
  });

  substitutionsByDay.set(day, substitutions);
  return res.json({ ok: true, day, substitutions, ...getStatsForDay(day, substitutions) });
}

function list(req, res) {
  ensureSeeded();
  const day = normalizeDay((req.query && req.query.day) || "Monday");
  const substitutions = substitutionsByDay.get(day) || [];
  return res.json({ day, substitutions, ...getStatsForDay(day, substitutions) });
}

function manualOverride(req, res) {
  ensureSeeded();
  const { day, period, absentTeacherId, substituteTeacherId } = req.body || {};
  const d = normalizeDay(day || "Monday");
  const substitutions = substitutionsByDay.get(d) || [];

  const result = applyManualOverride({
    day: d,
    substitutions,
    attendanceByTeacherId,
    period: Number(period),
    absentTeacherId: Number(absentTeacherId),
    substituteTeacherId: substituteTeacherId == null ? null : Number(substituteTeacherId)
  });

  if (!result.ok) return res.status(400).json(result);

  substitutionsByDay.set(d, substitutions);
  return res.json({ ok: true, row: result.row, ...getStatsForDay(d, substitutions) });
}

function reset(req, res) {
  ensureSeeded();
  const day = normalizeDay((req.body && req.body.day) || "Monday");
  resetDay(day);
  return res.json({ ok: true, day });
}

module.exports = {
  generate,
  list,
  manualOverride,
  reset
};

