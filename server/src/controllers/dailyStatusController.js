const asyncHandler = require("../utils/asyncHandler");
const dailyStatusService = require("../services/dailyStatusService");

const list = asyncHandler(async (req, res) => {
  const result = await dailyStatusService.listDailyStatus({
    schoolId: req.schoolId,
    academicSessionId: req.query.academicSessionId,
    date: req.query.date
  });
  res.json({ ok: true, ...result });
});

const setStatus = asyncHandler(async (req, res) => {
  const row = await dailyStatusService.setDailyStatus({
    schoolId: req.schoolId,
    academicSessionId: req.body.academicSessionId,
    actorId: req.user._id,
    teacherId: req.body.teacherId,
    date: req.body.date,
    status: req.body.status,
    note: req.body.note
  });
  res.json({ ok: true, row });
});

module.exports = { list, setStatus };
