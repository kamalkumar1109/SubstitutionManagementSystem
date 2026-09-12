const asyncHandler = require("../utils/asyncHandler");
const timetableService = require("../services/timetableService");
const timetableSwapService = require("../services/timetableSwapService");

const create = asyncHandler(async (req, res) => {
  const timetable = await timetableService.createTimetable({
    schoolId: req.schoolId,
    actorId: req.user._id,
    payload: req.body
  });
  res.status(201).json({ ok: true, timetable });
});

const list = asyncHandler(async (req, res) => {
  const timetables = await timetableService.listTimetables(req.schoolId, req.query.academicSessionId);
  res.json({ ok: true, timetables });
});

const getOne = asyncHandler(async (req, res) => {
  const data = await timetableService.getTimetable(req.schoolId, req.params.timetableId);
  res.json({ ok: true, ...data });
});

const update = asyncHandler(async (req, res) => {
  const timetable = await timetableService.updateTimetable({
    schoolId: req.schoolId,
    actorId: req.user._id,
    timetableId: req.params.timetableId,
    payload: req.body || {}
  });
  res.json({ ok: true, timetable });
});

const remove = asyncHandler(async (req, res) => {
  const result = await timetableService.deleteTimetable({
    schoolId: req.schoolId,
    actorId: req.user._id,
    timetableId: req.params.timetableId
  });
  res.json({ ok: true, ...result });
});

const grid = asyncHandler(async (req, res) => {
  const data = await timetableService.getGrid(req.schoolId, req.params.timetableId);
  res.json({ ok: true, ...data });
});

const teacherView = asyncHandler(async (req, res) => {
  const data = await timetableService.getTeacherView(
    req.schoolId,
    req.params.timetableId,
    req.params.teacherId
  );
  res.json({ ok: true, ...data });
});

const classView = asyncHandler(async (req, res) => {
  const data = await timetableService.getClassView(
    req.schoolId,
    req.params.timetableId,
    req.params.classId,
    req.query.sectionId
  );
  res.json({ ok: true, ...data });
});

const sectionView = asyncHandler(async (req, res) => {
  const data = await timetableService.getSectionView(
    req.schoolId,
    req.params.timetableId,
    req.params.sectionId
  );
  res.json({ ok: true, ...data });
});

const addEntry = asyncHandler(async (req, res) => {
  const result = await timetableService.addEntry({
    schoolId: req.schoolId,
    actorId: req.user._id,
    timetableId: req.params.timetableId,
    payload: req.body
  });
  if (result && result.entries) {
    res.status(201).json({ ok: true, entry: result.entries[0], entries: result.entries });
    return;
  }
  res.status(201).json({ ok: true, entry: result });
});

const updateEntry = asyncHandler(async (req, res) => {
  const entry = await timetableService.updateEntry({
    schoolId: req.schoolId,
    actorId: req.user._id,
    timetableId: req.params.timetableId,
    entryId: req.params.entryId,
    payload: req.body || {}
  });
  res.json({ ok: true, entry });
});

const removeEntry = asyncHandler(async (req, res) => {
  await timetableService.removeEntry({
    schoolId: req.schoolId,
    actorId: req.user._id,
    timetableId: req.params.timetableId,
    entryId: req.params.entryId
  });
  res.json({ ok: true, deleted: true });
});

const queryEntries = asyncHandler(async (req, res) => {
  const entries = await timetableService.queryEntries(req.schoolId, req.query);
  res.json({ ok: true, entries });
});

const week = asyncHandler(async (req, res) => {
  const data = await timetableSwapService.weekForDate(req.schoolId, req.query.date);
  res.json({ ok: true, ...data });
});

const previewSwap = asyncHandler(async (req, res) => {
  const data = await timetableSwapService.previewOrCommitSwap({
    schoolId: req.schoolId,
    actorId: req.user._id,
    payload: req.body || {},
    commit: false
  });
  res.json({ ok: true, ...data });
});

const confirmSwap = asyncHandler(async (req, res) => {
  const data = await timetableSwapService.previewOrCommitSwap({
    schoolId: req.schoolId,
    actorId: req.user._id,
    payload: req.body || {},
    commit: true
  });
  res.status(201).json({ ok: true, ...data });
});

const classGrid = asyncHandler(async (req, res) => {
  const data = await timetableSwapService.classGridForSwap({
    schoolId: req.schoolId,
    classId: req.query.classId,
    sectionId: req.query.sectionId,
    dateKey: req.query.date || req.query.dateKey,
    timetableId: req.query.timetableId
  });
  res.json({ ok: true, ...data });
});

const teacherSlots = asyncHandler(async (req, res) => {
  const data = await timetableSwapService.listTeacherSlots({
    schoolId: req.schoolId,
    dateKey: req.query.date || req.query.dateKey,
    teacherId: req.query.teacherId
  });
  res.json({ ok: true, ...data });
});

module.exports = {
  create,
  list,
  getOne,
  update,
  remove,
  grid,
  teacherView,
  classView,
  sectionView,
  addEntry,
  updateEntry,
  removeEntry,
  queryEntries,
  week,
  previewSwap,
  confirmSwap,
  teacherSlots,
  classGrid
};
