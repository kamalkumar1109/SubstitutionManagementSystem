const { ClassGroup, ClassGroupMembership, Class, Section, Subject, Teacher, TimetableEntry, Substitution } = require("../models");
const { AUDIT_ACTIONS } = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { writeAudit } = require("./auditService");

function omitSchoolId(payload) {
  if (!payload || typeof payload !== "object") return {};
  const next = { ...payload };
  delete next.schoolId;
  return next;
}

function rejectSchoolSpoof(payload, schoolId) {
  if (payload && payload.schoolId && String(payload.schoolId) !== String(schoolId)) {
    throw AppError.forbidden("Cannot assign records to another school");
  }
}

function requireName(body, label) {
  if (!body.name || !String(body.name).trim()) {
    throw AppError.badRequest(`${label} name is required`);
  }
}

function uniqueIds(values) {
  const seen = new Set();
  const ids = [];
  (values || []).forEach((value) => {
    if (value == null || value === "") return;
    const id = String(value._id || value);
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

async function replaceClassGroupMembers(schoolId, classGroupId, members) {
  if (!Array.isArray(members)) return;
  const seen = new Set();
  const docs = [];
  for (const row of members) {
    if (!row || !row.classId) continue;
    const classId = String(row.classId);
    if (seen.has(classId)) {
      throw AppError.badRequest("A class can only be added once to a class group");
    }
    seen.add(classId);
    const klass = await Class.findOne({ _id: row.classId, schoolId });
    if (!klass) throw AppError.badRequest("Class does not belong to this school");
    const sectionIds = uniqueIds(row.sectionIds);
    if (!sectionIds.length) {
      throw AppError.badRequest(`Select at least one section of ${klass.name}`);
    }
    const sections = await Section.find({ _id: { $in: sectionIds }, schoolId, classId: klass._id });
    if (sections.length !== sectionIds.length) {
      throw AppError.badRequest("Section does not belong to the selected class");
    }
    docs.push({
      schoolId,
      classGroupId,
      classId: klass._id,
      sectionIds: sections.map((section) => section._id)
    });
  }
  await ClassGroupMembership.deleteMany({ schoolId, classGroupId });
  if (docs.length) await ClassGroupMembership.insertMany(docs);
}

async function backfillLegacyMemberships(schoolId, classGroupId) {
  const classes = await Class.find({ schoolId, classGroupId });
  for (const klass of classes) {
    const existing = await ClassGroupMembership.findOne({
      schoolId,
      classGroupId,
      classId: klass._id
    });
    if (existing) continue;
    const sections = await Section.find({ schoolId, classId: klass._id }).select("_id");
    await ClassGroupMembership.create({
      schoolId,
      classGroupId,
      classId: klass._id,
      sectionIds: sections.map((section) => section._id)
    });
  }
}

async function presentClassGroup(schoolId, group) {
  const row = group.toObject ? group.toObject() : group;
  await backfillLegacyMemberships(schoolId, row._id);
  const memberships = await ClassGroupMembership.find({ schoolId, classGroupId: row._id })
    .populate("classId", "name")
    .populate("sectionIds", "name");
  return {
    ...row,
    members: memberships.map((membership) => ({
      classId: membership.classId?._id || membership.classId,
      className: membership.classId?.name || "",
      sectionIds: (membership.sectionIds || []).map((section) => section._id || section),
      sections: (membership.sectionIds || []).map((section) => ({
        _id: section._id || section,
        name: section.name || ""
      }))
    }))
  };
}

async function presentClass(schoolId, klass) {
  const populated = klass.classGroupId && klass.classGroupId.name
    ? klass
    : await Class.findById(klass._id).populate("classGroupId", "name active");
  const row = populated.toObject ? populated.toObject() : populated;
  const memberships = await ClassGroupMembership.find({ schoolId, classId: row._id }).populate(
    "classGroupId",
    "name active"
  );
  const groups = [];
  const seen = new Set();
  function addGroup(group) {
    if (!group) return;
    const id = String(group._id || group);
    if (seen.has(id)) return;
    seen.add(id);
    groups.push({
      _id: group._id || group,
      name: group.name || "",
      active: group.active !== false
    });
  }
  addGroup(row.classGroupId);
  memberships.forEach((membership) => addGroup(membership.classGroupId));
  return {
    ...row,
    classGroups: groups,
    classGroupIds: groups.map((group) => group._id)
  };
}

async function presentClasses(schoolId, classes) {
  return Promise.all(classes.map((klass) => presentClass(schoolId, klass)));
}

async function createClassGroup(schoolId, payload) {
  rejectSchoolSpoof(payload, schoolId);
  const body = omitSchoolId(payload);
  requireName(body, "Class group");
  const group = await ClassGroup.create({
    schoolId,
    name: String(body.name).trim(),
    description: body.description || "",
    sortOrder: body.sortOrder || 0,
    active: body.active !== false
  });
  await replaceClassGroupMembers(schoolId, group._id, body.members);
  return presentClassGroup(schoolId, group);
}

async function listClassGroups(schoolId, { includeInactive } = {}) {
  const filter = { schoolId };
  if (!includeInactive) filter.active = true;
  const groups = await ClassGroup.find(filter).sort({ sortOrder: 1, name: 1 });
  return Promise.all(groups.map((group) => presentClassGroup(schoolId, group)));
}

async function updateClassGroup(schoolId, id, payload) {
  rejectSchoolSpoof(payload, schoolId);
  const body = omitSchoolId(payload);
  const doc = await ClassGroup.findOne({ _id: id, schoolId });
  if (!doc) throw AppError.notFound("Class group not found");
  ["name", "description", "sortOrder", "active"].forEach((key) => {
    if (body[key] !== undefined) doc[key] = body[key];
  });
  await doc.save();
  if (body.members !== undefined) {
    await replaceClassGroupMembers(schoolId, doc._id, body.members);
  }
  return presentClassGroup(schoolId, doc);
}

async function deactivateClassGroup(schoolId, id, actorId) {
  return setCatalogActive("ClassGroup", schoolId, id, false, actorId);
}

async function activateClassGroup(schoolId, id, actorId) {
  return setCatalogActive("ClassGroup", schoolId, id, true, actorId);
}

async function createClass(schoolId, payload) {
  rejectSchoolSpoof(payload, schoolId);
  const body = omitSchoolId(payload);
  requireName(body, "Class");
  if (!body.classGroupId) throw AppError.badRequest("classGroupId is required");
  const group = await ClassGroup.findOne({ _id: body.classGroupId, schoolId });
  if (!group) throw AppError.badRequest("classGroupId does not belong to this school");
  const name = String(body.name).trim();
  const existing = await Class.findOne({ schoolId, name });
  if (existing) {
    throw AppError.conflict(
      "A class with this name already exists. Add it to another group from the class group form."
    );
  }
  let doc;
  try {
    doc = await Class.create({
      schoolId,
      classGroupId: body.classGroupId,
      name,
      gradeNumber: body.gradeNumber,
      sortOrder: body.sortOrder || 0,
      active: body.active !== false
    });
  } catch (err) {
    if (err.code === 11000 || err.code === "11000") {
      throw AppError.conflict(
        "A class with this name already exists. Add it to another group from the class group form."
      );
    }
    throw err;
  }
  await ClassGroupMembership.create({
    schoolId,
    classGroupId: body.classGroupId,
    classId: doc._id,
    sectionIds: []
  });
  return presentClass(schoolId, doc);
}

async function listClasses(schoolId, { includeInactive } = {}) {
  const filter = { schoolId };
  if (!includeInactive) filter.active = true;
  const classes = await Class.find(filter).populate("classGroupId", "name active").sort({ sortOrder: 1, name: 1 });
  return presentClasses(schoolId, classes);
}

async function updateClass(schoolId, id, payload) {
  rejectSchoolSpoof(payload, schoolId);
  const body = omitSchoolId(payload);
  const doc = await Class.findOne({ _id: id, schoolId });
  if (!doc) throw AppError.notFound("Class not found");
  if (body.classGroupId) {
    const group = await ClassGroup.findOne({ _id: body.classGroupId, schoolId });
    if (!group) throw AppError.badRequest("classGroupId does not belong to this school");
    doc.classGroupId = body.classGroupId;
  }
  ["name", "gradeNumber", "sortOrder", "active"].forEach((key) => {
    if (body[key] !== undefined) doc[key] = body[key];
  });
  await doc.save();
  return presentClass(schoolId, doc);
}

async function deactivateClass(schoolId, id, actorId) {
  return setCatalogActive("Class", schoolId, id, false, actorId);
}

async function activateClass(schoolId, id, actorId) {
  return setCatalogActive("Class", schoolId, id, true, actorId);
}

async function createSection(schoolId, payload) {
  rejectSchoolSpoof(payload, schoolId);
  const body = omitSchoolId(payload);
  requireName(body, "Section");
  if (!body.classId) throw AppError.badRequest("classId is required");
  const klass = await Class.findOne({ _id: body.classId, schoolId });
  if (!klass) throw AppError.badRequest("classId does not belong to this school");
  const section = await Section.create({
    schoolId,
    classId: body.classId,
    name: String(body.name).trim(),
    sortOrder: body.sortOrder || 0,
    active: body.active !== false
  });
  await ClassGroupMembership.updateOne(
    { schoolId, classId: klass._id, classGroupId: klass.classGroupId },
    { $addToSet: { sectionIds: section._id } },
    { upsert: true }
  );
  return section;
}

async function listSections(schoolId, classId, { includeInactive } = {}) {
  const filter = { schoolId };
  if (classId) filter.classId = classId;
  if (!includeInactive) filter.active = true;
  return Section.find(filter).populate("classId", "name").sort({ sortOrder: 1, name: 1 });
}

async function updateSection(schoolId, id, payload) {
  rejectSchoolSpoof(payload, schoolId);
  const body = omitSchoolId(payload);
  const doc = await Section.findOne({ _id: id, schoolId });
  if (!doc) throw AppError.notFound("Section not found");
  if (body.classId) {
    const klass = await Class.findOne({ _id: body.classId, schoolId });
    if (!klass) throw AppError.badRequest("classId does not belong to this school");
    doc.classId = body.classId;
  }
  ["name", "sortOrder", "active"].forEach((key) => {
    if (body[key] !== undefined) doc[key] = body[key];
  });
  await doc.save();
  return Section.findById(doc._id).populate("classId", "name");
}

async function deactivateSection(schoolId, id, actorId) {
  return setCatalogActive("Section", schoolId, id, false, actorId);
}

async function activateSection(schoolId, id, actorId) {
  return setCatalogActive("Section", schoolId, id, true, actorId);
}

async function createSubject(schoolId, payload) {
  rejectSchoolSpoof(payload, schoolId);
  const body = omitSchoolId(payload);
  requireName(body, "Subject");
  return Subject.create({
    schoolId,
    name: String(body.name).trim(),
    code: body.code,
    active: body.active !== false
  });
}

async function listSubjects(schoolId, { includeInactive } = {}) {
  const filter = { schoolId };
  if (!includeInactive) filter.active = true;
  return Subject.find(filter).sort({ name: 1 });
}

async function updateSubject(schoolId, id, payload) {
  rejectSchoolSpoof(payload, schoolId);
  const body = omitSchoolId(payload);
  const doc = await Subject.findOne({ _id: id, schoolId });
  if (!doc) throw AppError.notFound("Subject not found");
  ["name", "code", "active"].forEach((key) => {
    if (body[key] !== undefined) doc[key] = body[key];
  });
  await doc.save();
  return doc;
}

async function deactivateSubject(schoolId, id, actorId) {
  return setCatalogActive("Subject", schoolId, id, false, actorId);
}

async function activateSubject(schoolId, id, actorId) {
  return setCatalogActive("Subject", schoolId, id, true, actorId);
}

const CATALOG_MODELS = {
  ClassGroup,
  Class,
  Section,
  Subject
};

async function setCatalogActive(entityType, schoolId, id, active, actorId) {
  const Model = CATALOG_MODELS[entityType];
  const doc = await Model.findOne({ _id: id, schoolId });
  if (!doc) throw AppError.notFound(`${entityType} not found`);
  doc.active = Boolean(active);
  await doc.save();
  await writeAudit({
    schoolId,
    actorId,
    action: active ? AUDIT_ACTIONS.CATALOG_ACTIVATED : AUDIT_ACTIONS.CATALOG_DEACTIVATED,
    entityType,
    entityId: doc._id,
    metadata: { active: doc.active }
  });
  if (entityType === "Class") return presentClass(schoolId, doc);
  if (entityType === "Section") return Section.findById(doc._id).populate("classId", "name");
  return doc;
}

async function catalogUsage(schoolId, entityType, id) {
  if (entityType === "ClassGroup") {
    const [classes, teachers, memberships] = await Promise.all([
      Class.countDocuments({ schoolId, classGroupId: id }),
      Teacher.countDocuments({ schoolId, eligibleClassGroups: id }),
      ClassGroupMembership.countDocuments({ schoolId, classGroupId: id })
    ]);
    return { classes, teachers, memberships, blocking: classes > 0 || teachers > 0 };
  }
  if (entityType === "Class") {
    const [sections, entries, substitutions] = await Promise.all([
      Section.countDocuments({ schoolId, classId: id }),
      TimetableEntry.countDocuments({ schoolId, classId: id }),
      Substitution.countDocuments({ schoolId, classId: id })
    ]);
    return { sections, timetableEntries: entries, substitutions, blocking: sections + entries + substitutions > 0 };
  }
  if (entityType === "Section") {
    const [entries, substitutions] = await Promise.all([
      TimetableEntry.countDocuments({ schoolId, sectionId: id }),
      Substitution.countDocuments({ schoolId, sectionId: id })
    ]);
    return { timetableEntries: entries, substitutions, blocking: entries + substitutions > 0 };
  }
  const [teachers, entries, substitutions] = await Promise.all([
    Teacher.countDocuments({ schoolId, subjects: id }),
    TimetableEntry.countDocuments({ schoolId, subjectId: id }),
    Substitution.countDocuments({ schoolId, subjectId: id })
  ]);
  return { teachers, timetableEntries: entries, substitutions, blocking: teachers + entries + substitutions > 0 };
}

async function deleteCatalogEntity(entityType, schoolId, id, actorId) {
  const Model = CATALOG_MODELS[entityType];
  const doc = await Model.findOne({ _id: id, schoolId });
  if (!doc) throw AppError.notFound(`${entityType} not found`);
  const usage = await catalogUsage(schoolId, entityType, id);
  if (usage.blocking) {
    throw AppError.conflict(
      "This record is used by timetable, substitution, or related catalog data. Deactivate it instead of deleting."
    );
  }
  if (entityType === "ClassGroup") {
    await ClassGroupMembership.deleteMany({ schoolId, classGroupId: id });
  }
  if (entityType === "Class") {
    await ClassGroupMembership.deleteMany({ schoolId, classId: id });
  }
  await Model.deleteOne({ _id: id, schoolId });
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.CATALOG_DELETED,
    entityType,
    entityId: id
  });
  return { deleted: true };
}

async function withClassGroupIds(schoolId, classes) {
  const memberships = await ClassGroupMembership.find({ schoolId }).select("classId classGroupId");
  const extra = new Map();
  memberships.forEach((membership) => {
    const classId = String(membership.classId);
    if (!extra.has(classId)) extra.set(classId, []);
    extra.get(classId).push(membership.classGroupId);
  });
  return (classes || []).map((klass) => {
    const row = klass.toObject ? klass.toObject() : { ...klass };
    const ids = new Set();
    if (row.classGroupId) ids.add(row.classGroupId);
    (extra.get(String(row._id)) || []).forEach((id) => ids.add(id));
    row.classGroupIds = [...ids];
    return row;
  });
}

module.exports = {
  createClassGroup,
  listClassGroups,
  updateClassGroup,
  deactivateClassGroup,
  activateClassGroup,
  deleteClassGroup: (schoolId, id, actorId) => deleteCatalogEntity("ClassGroup", schoolId, id, actorId),
  createClass,
  listClasses,
  updateClass,
  deactivateClass,
  activateClass,
  deleteClass: (schoolId, id, actorId) => deleteCatalogEntity("Class", schoolId, id, actorId),
  createSection,
  listSections,
  updateSection,
  deactivateSection,
  activateSection,
  deleteSection: (schoolId, id, actorId) => deleteCatalogEntity("Section", schoolId, id, actorId),
  createSubject,
  listSubjects,
  updateSubject,
  deactivateSubject,
  activateSubject,
  deleteSubject: (schoolId, id, actorId) => deleteCatalogEntity("Subject", schoolId, id, actorId),
  withClassGroupIds
};
