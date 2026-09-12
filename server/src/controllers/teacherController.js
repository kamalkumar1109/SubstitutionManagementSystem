const asyncHandler = require("../utils/asyncHandler");
const teacherService = require("../services/teacherService");

const create = asyncHandler(async (req, res) => {
  const teacher = await teacherService.createTeacher({
    schoolId: req.schoolId,
    actorId: req.user._id,
    payload: req.body
  });
  res.status(201).json({ ok: true, teacher });
});

const list = asyncHandler(async (req, res) => {
  const teachers = await teacherService.listTeachers(req.schoolId, {
    includeInactive: req.query.includeInactive === "true",
    q: req.query.q,
    active: req.query.active,
    designation: req.query.designation,
    classGroupId: req.query.classGroupId
  });
  res.json({ ok: true, teachers });
});

const getOne = asyncHandler(async (req, res) => {
  const teacher = await teacherService.getTeacher(req.schoolId, req.params.teacherId);
  res.json({ ok: true, teacher });
});

const update = asyncHandler(async (req, res) => {
  const teacher = await teacherService.updateTeacher({
    schoolId: req.schoolId,
    actorId: req.user._id,
    teacherId: req.params.teacherId,
    payload: req.body
  });
  res.json({ ok: true, teacher });
});

const deactivate = asyncHandler(async (req, res) => {
  const teacher = await teacherService.deactivateTeacher({
    schoolId: req.schoolId,
    actorId: req.user._id,
    teacherId: req.params.teacherId,
    asResigned: req.body?.asResigned === true || req.query.asResigned === "true"
  });
  res.json({ ok: true, teacher });
});

const activate = asyncHandler(async (req, res) => {
  const teacher = await teacherService.activateTeacher({
    schoolId: req.schoolId,
    actorId: req.user._id,
    teacherId: req.params.teacherId
  });
  res.json({ ok: true, teacher });
});

const remove = asyncHandler(async (req, res) => {
  await teacherService.deleteTeacher({
    schoolId: req.schoolId,
    actorId: req.user._id,
    teacherId: req.params.teacherId
  });
  res.json({ ok: true, deleted: true });
});

module.exports = { create, list, getOne, update, deactivate, activate, remove };
