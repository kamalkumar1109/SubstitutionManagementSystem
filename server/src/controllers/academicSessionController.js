const asyncHandler = require("../utils/asyncHandler");
const academicSessionService = require("../services/academicSessionService");

const create = asyncHandler(async (req, res) => {
  const result = await academicSessionService.createSession({
    schoolId: req.schoolId,
    actorId: req.user._id,
    name: req.body.name,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    setCurrent: Boolean(req.body.setCurrent),
    createTimetable: req.body.createTimetable !== false,
    periodCount: req.body.periodCount,
    periodStart: req.body.periodStart,
    weekDays: req.body.weekDays,
    firstHalfStart: req.body.firstHalfStart,
    firstHalfEnd: req.body.firstHalfEnd,
    secondHalfStart: req.body.secondHalfStart,
    secondHalfEnd: req.body.secondHalfEnd,
    staybackEnabled: req.body.staybackEnabled,
    staybackDay: req.body.staybackDay,
    staybackFirstHalfStart: req.body.staybackFirstHalfStart,
    staybackFirstHalfEnd: req.body.staybackFirstHalfEnd,
    staybackSecondHalfStart: req.body.staybackSecondHalfStart,
    staybackSecondHalfEnd: req.body.staybackSecondHalfEnd,
    classIds: req.body.classIds,
    roundDuties: req.body.roundDuties
  });
  res.status(201).json({ ok: true, session: result.session, timetable: result.timetable });
});

const list = asyncHandler(async (req, res) => {
  const sessions = await academicSessionService.listSessions(req.schoolId);
  res.json({ ok: true, sessions });
});

const setCurrent = asyncHandler(async (req, res) => {
  const session = await academicSessionService.setCurrentSession({
    schoolId: req.schoolId,
    sessionId: req.params.sessionId,
    actorId: req.user._id
  });
  res.json({ ok: true, session });
});

module.exports = { create, list, setCurrent };
