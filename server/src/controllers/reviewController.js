const asyncHandler = require("../utils/asyncHandler");
const reviewService = require("../services/reviewService");

const publicList = asyncHandler(async (req, res) => {
  const reviews = await reviewService.listPublished();
  res.json({ ok: true, reviews });
});

const mine = asyncHandler(async (req, res) => {
  const review = await reviewService.getMine(req.schoolId);
  res.json({ ok: true, review });
});

const saveMine = asyncHandler(async (req, res) => {
  const review = await reviewService.upsertMine({
    schoolId: req.schoolId,
    actorId: req.user._id,
    payload: req.body || {}
  });
  res.json({ ok: true, review });
});

const removeMine = asyncHandler(async (req, res) => {
  const result = await reviewService.deleteMine({
    schoolId: req.schoolId,
    actorId: req.user._id
  });
  res.json({ ok: true, ...result });
});

module.exports = { publicList, mine, saveMine, removeMine };
