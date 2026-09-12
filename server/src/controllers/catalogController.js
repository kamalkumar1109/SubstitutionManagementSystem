const asyncHandler = require("../utils/asyncHandler");
const catalogService = require("../services/catalogService");

const includeInactive = (req) => req.query.includeInactive === "true";

const createClassGroup = asyncHandler(async (req, res) => {
  const classGroup = await catalogService.createClassGroup(req.schoolId, req.body);
  res.status(201).json({ ok: true, classGroup });
});

const listClassGroups = asyncHandler(async (req, res) => {
  const classGroups = await catalogService.listClassGroups(req.schoolId, {
    includeInactive: includeInactive(req)
  });
  res.json({ ok: true, classGroups });
});

const updateClassGroup = asyncHandler(async (req, res) => {
  const classGroup = await catalogService.updateClassGroup(
    req.schoolId,
    req.params.id,
    req.body
  );
  res.json({ ok: true, classGroup });
});

const deactivateClassGroup = asyncHandler(async (req, res) => {
  const classGroup = await catalogService.deactivateClassGroup(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, classGroup });
});

const activateClassGroup = asyncHandler(async (req, res) => {
  const classGroup = await catalogService.activateClassGroup(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, classGroup });
});

const deleteClassGroup = asyncHandler(async (req, res) => {
  await catalogService.deleteClassGroup(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, deleted: true });
});

const createClass = asyncHandler(async (req, res) => {
  const classDoc = await catalogService.createClass(req.schoolId, req.body);
  res.status(201).json({ ok: true, class: classDoc });
});

const listClasses = asyncHandler(async (req, res) => {
  const classes = await catalogService.listClasses(req.schoolId, {
    includeInactive: includeInactive(req)
  });
  res.json({ ok: true, classes });
});

const updateClass = asyncHandler(async (req, res) => {
  const classDoc = await catalogService.updateClass(req.schoolId, req.params.id, req.body);
  res.json({ ok: true, class: classDoc });
});

const deactivateClass = asyncHandler(async (req, res) => {
  const classDoc = await catalogService.deactivateClass(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, class: classDoc });
});

const activateClass = asyncHandler(async (req, res) => {
  const classDoc = await catalogService.activateClass(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, class: classDoc });
});

const deleteClass = asyncHandler(async (req, res) => {
  await catalogService.deleteClass(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, deleted: true });
});

const createSection = asyncHandler(async (req, res) => {
  const section = await catalogService.createSection(req.schoolId, req.body);
  res.status(201).json({ ok: true, section });
});

const listSections = asyncHandler(async (req, res) => {
  const sections = await catalogService.listSections(req.schoolId, req.query.classId, {
    includeInactive: includeInactive(req)
  });
  res.json({ ok: true, sections });
});

const updateSection = asyncHandler(async (req, res) => {
  const section = await catalogService.updateSection(req.schoolId, req.params.id, req.body);
  res.json({ ok: true, section });
});

const deactivateSection = asyncHandler(async (req, res) => {
  const section = await catalogService.deactivateSection(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, section });
});

const activateSection = asyncHandler(async (req, res) => {
  const section = await catalogService.activateSection(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, section });
});

const deleteSection = asyncHandler(async (req, res) => {
  await catalogService.deleteSection(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, deleted: true });
});

const createSubject = asyncHandler(async (req, res) => {
  const subject = await catalogService.createSubject(req.schoolId, req.body);
  res.status(201).json({ ok: true, subject });
});

const listSubjects = asyncHandler(async (req, res) => {
  const subjects = await catalogService.listSubjects(req.schoolId, {
    includeInactive: includeInactive(req)
  });
  res.json({ ok: true, subjects });
});

const updateSubject = asyncHandler(async (req, res) => {
  const subject = await catalogService.updateSubject(req.schoolId, req.params.id, req.body);
  res.json({ ok: true, subject });
});

const deactivateSubject = asyncHandler(async (req, res) => {
  const subject = await catalogService.deactivateSubject(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, subject });
});

const activateSubject = asyncHandler(async (req, res) => {
  const subject = await catalogService.activateSubject(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, subject });
});

const deleteSubject = asyncHandler(async (req, res) => {
  await catalogService.deleteSubject(req.schoolId, req.params.id, req.user._id);
  res.json({ ok: true, deleted: true });
});

module.exports = {
  createClassGroup,
  listClassGroups,
  updateClassGroup,
  deactivateClassGroup,
  activateClassGroup,
  deleteClassGroup,
  createClass,
  listClasses,
  updateClass,
  deactivateClass,
  activateClass,
  deleteClass,
  createSection,
  listSections,
  updateSection,
  deactivateSection,
  activateSection,
  deleteSection,
  createSubject,
  listSubjects,
  updateSubject,
  deactivateSubject,
  activateSubject,
  deleteSubject
};
