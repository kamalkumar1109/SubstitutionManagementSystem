const asyncHandler = require("../utils/asyncHandler");
const substitutionService = require("../services/substitutionService");

const today = asyncHandler(async (req, res) => {
  const board = await substitutionService.getTodayBoard({
    schoolId: req.schoolId,
    timetableId: req.query.timetableId
  });
  res.json({ ok: true, ...board });
});

const todayPdf = asyncHandler(async (req, res) => {
  const { buffer, filename } = await substitutionService.buildTodayPdf({
    schoolId: req.schoolId,
    timetableId: req.query.timetableId
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

const generate = asyncHandler(async (req, res) => {
  const result = await substitutionService.generateForToday({
    schoolId: req.schoolId,
    academicSessionId: req.body.academicSessionId,
    date: req.body.date,
    generatedBy: req.user._id,
    timetableId: req.body.timetableId
  });
  res.status(201).json({ ok: true, ...result });
});

const list = asyncHandler(async (req, res) => {
  const substitutions = await substitutionService.listSubstitutions({
    schoolId: req.schoolId,
    academicSessionId: req.query.academicSessionId,
    date: req.query.date
  });
  res.json({ ok: true, substitutions });
});

const listRuns = asyncHandler(async (req, res) => {
  const runs = await substitutionService.listRuns({ schoolId: req.schoolId });
  res.json({ ok: true, runs });
});

const candidates = asyncHandler(async (req, res) => {
  const result = await substitutionService.listOverrideCandidates({
    schoolId: req.schoolId,
    substitutionId: req.params.substitutionId,
    q: req.query.q
  });
  res.json({ ok: true, ...result });
});

const override = asyncHandler(async (req, res) => {
  const substitution = await substitutionService.applyManualOverride({
    schoolId: req.schoolId,
    academicSessionId: req.body.academicSessionId,
    actorId: req.user._id,
    date: req.body.date,
    substitutionId: req.params.substitutionId || req.body.substitutionId,
    period: req.body.period,
    classId: req.body.classId,
    sectionId: req.body.sectionId,
    absentTeacherId: req.body.absentTeacherId,
    substituteTeacherId: req.body.substituteTeacherId,
    reason: req.body.reason
  });
  res.json({ ok: true, substitution });
});

const roundDutyCandidates = asyncHandler(async (req, res) => {
  const result = await substitutionService.listRoundDutyCandidates({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    q: req.query.q
  });
  res.json({ ok: true, ...result });
});

const roundDutyOverride = asyncHandler(async (req, res) => {
  const assignment = await substitutionService.applyRoundDutyOverride({
    schoolId: req.schoolId,
    actorId: req.user._id,
    assignmentId: req.params.assignmentId,
    substituteTeacherId: req.body.substituteTeacherId,
    reason: req.body.reason
  });
  res.json({ ok: true, assignment });
});

module.exports = { today, todayPdf, generate, list, listRuns, candidates, override, roundDutyCandidates, roundDutyOverride };
