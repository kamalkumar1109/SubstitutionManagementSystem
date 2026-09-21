const { Teacher, ClassGroup, Subject, Timetable, TimetableEntry, Substitution, DailyTeacherStatus, TimetableSwap } = require("../models");
const { EMPLOYMENT_STATUS, AUDIT_ACTIONS, TEACHER_CATEGORY } = require("../config/constants");
const { AppError } = require("../utils/AppError");
const { writeAudit } = require("./auditService");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function omitSchoolId(payload) {
  if (!payload || typeof payload !== "object") return {};
  const next = { ...payload };
  delete next.schoolId;
  return next;
}

async function assertOwnedIds(schoolId, Model, ids, label) {
  if (!ids || ids.length === 0) return;
  const unique = [...new Set(ids.map((id) => String(id)))];
  const count = await Model.countDocuments({ _id: { $in: unique }, schoolId });
  if (count !== unique.length) {
    throw AppError.badRequest(`One or more ${label} do not belong to this school`);
  }
}

const teacherPopulate = [
  { path: "subjects", select: "name code active" },
  { path: "eligibleClassGroups", select: "name active" },
  { path: "homeWingTimetableId", select: "name status academicSessionId" }
];

async function resolveHomeWingTimetableId(schoolId, value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const timetable = await Timetable.findOne({ _id: value, schoolId }).select("_id");
  if (!timetable) {
    throw AppError.badRequest("Home Wing must be one of this school's timetables");
  }
  return timetable._id;
}

async function createTeacher({ schoolId, actorId, payload }) {
  if (payload && payload.schoolId && String(payload.schoolId) !== String(schoolId)) {
    throw AppError.forbidden("Cannot assign a teacher to another school");
  }
  const body = omitSchoolId(payload);
  if (!body.name || !String(body.name).trim()) {
    throw AppError.badRequest("Teacher name is required");
  }
  if (body.employmentStatus && !Object.values(EMPLOYMENT_STATUS).includes(body.employmentStatus)) {
    throw AppError.badRequest("Invalid employment status");
  }

  if (body.category && !Object.values(TEACHER_CATEGORY).includes(body.category)) {
    throw AppError.badRequest("Invalid teacher category");
  }

  await assertOwnedIds(schoolId, ClassGroup, body.eligibleClassGroups, "class groups");
  await assertOwnedIds(schoolId, Subject, body.subjects, "subjects");
  const homeWingTimetableId = await resolveHomeWingTimetableId(schoolId, body.homeWingTimetableId);

  const teacher = await Teacher.create({
    schoolId,
    name: String(body.name).trim(),
    employeeCode: body.employeeCode,
    email: body.email,
    phone: body.phone,
    designation: body.designation,
    category: body.category || TEACHER_CATEGORY.REGULAR,
    alternateWeekSchedule: body.alternateWeekSchedule === true,
    subjects: body.subjects || [],
    eligibleClassGroups: body.eligibleClassGroups || [],
    homeWingTimetableId: homeWingTimetableId ?? null,
    employmentStatus: body.employmentStatus || EMPLOYMENT_STATUS.ACTIVE,
    joiningDate: body.joiningDate || null,
    leavingDate: body.leavingDate || null,
    active: true
  });

  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.TEACHER_ADDED,
    entityType: "Teacher",
    entityId: teacher._id
  });

  return Teacher.findById(teacher._id).populate(teacherPopulate);
}

async function listTeachers(schoolId, query = {}) {
  const filter = { schoolId };
  if (query.active === "true") filter.active = true;
  else if (query.active === "false") filter.active = false;
  else if (query.includeInactive !== true && query.includeInactive !== "true") {
    filter.active = true;
  }

  if (query.designation) {
    filter.designation = new RegExp(escapeRegex(query.designation), "i");
  }
  if (query.classGroupId) {
    filter.eligibleClassGroups = query.classGroupId;
  }

  const q = String(query.q || "").trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    const matchingSubjects = await Subject.find({ schoolId, name: rx }).select("_id");
    filter.$or = [
      { name: rx },
      { employeeCode: rx },
      { designation: rx },
      { subjects: { $in: matchingSubjects.map((s) => s._id) } }
    ];
  }

  return Teacher.find(filter).populate(teacherPopulate).sort({ name: 1 });
}

async function getTeacher(schoolId, teacherId) {
  const teacher = await Teacher.findOne({ _id: teacherId, schoolId }).populate(teacherPopulate);
  if (!teacher) throw AppError.notFound("Teacher not found");
  return teacher;
}

async function updateTeacher({ schoolId, actorId, teacherId, payload }) {
  const body = omitSchoolId(payload);
  if (payload && payload.schoolId && String(payload.schoolId) !== String(schoolId)) {
    throw AppError.forbidden("Cannot move a teacher to another school");
  }

  const teacher = await Teacher.findOne({ _id: teacherId, schoolId });
  if (!teacher) throw AppError.notFound("Teacher not found");

  const allowed = [
    "employeeCode",
    "name",
    "email",
    "phone",
    "designation",
    "category",
    "alternateWeekSchedule",
    "subjects",
    "eligibleClassGroups",
    "employmentStatus",
    "joiningDate",
    "leavingDate"
  ];

  if (body.category && !Object.values(TEACHER_CATEGORY).includes(body.category)) {
    throw AppError.badRequest("Invalid teacher category");
  }
  if (body.employmentStatus && !Object.values(EMPLOYMENT_STATUS).includes(body.employmentStatus)) {
    throw AppError.badRequest("Invalid employment status");
  }
  if (body.alternateWeekSchedule !== undefined) {
    body.alternateWeekSchedule = body.alternateWeekSchedule === true;
  }
  if (body.eligibleClassGroups) {
    await assertOwnedIds(schoolId, ClassGroup, body.eligibleClassGroups, "class groups");
  }
  if (body.subjects) {
    await assertOwnedIds(schoolId, Subject, body.subjects, "subjects");
  }
  if (body.homeWingTimetableId !== undefined) {
    teacher.homeWingTimetableId = await resolveHomeWingTimetableId(schoolId, body.homeWingTimetableId);
  }

  for (const key of allowed) {
    if (body[key] !== undefined) teacher[key] = body[key];
  }

  if (body.employmentStatus === EMPLOYMENT_STATUS.RESIGNED) {
    teacher.active = false;
    if (!teacher.leavingDate) teacher.leavingDate = new Date();
  } else if (body.employmentStatus === EMPLOYMENT_STATUS.INACTIVE) {
    teacher.active = false;
  } else if (body.employmentStatus === EMPLOYMENT_STATUS.ACTIVE) {
    teacher.active = true;
  }

  await teacher.save();

  await writeAudit({
    schoolId,
    actorId,
    action:
      body.employmentStatus === EMPLOYMENT_STATUS.RESIGNED
        ? AUDIT_ACTIONS.TEACHER_RESIGNED
        : AUDIT_ACTIONS.TEACHER_EDITED,
    entityType: "Teacher",
    entityId: teacher._id
  });

  return getTeacher(schoolId, teacherId);
}

async function deactivateTeacher({ schoolId, actorId, teacherId, asResigned }) {
  const teacher = await Teacher.findOne({ _id: teacherId, schoolId });
  if (!teacher) throw AppError.notFound("Teacher not found");
  teacher.active = false;
  if (asResigned) {
    teacher.employmentStatus = EMPLOYMENT_STATUS.RESIGNED;
    if (!teacher.leavingDate) teacher.leavingDate = new Date();
  } else if (teacher.employmentStatus === EMPLOYMENT_STATUS.ACTIVE) {
    teacher.employmentStatus = EMPLOYMENT_STATUS.INACTIVE;
  }
  await teacher.save();
  await writeAudit({
    schoolId,
    actorId,
    action: asResigned ? AUDIT_ACTIONS.TEACHER_RESIGNED : AUDIT_ACTIONS.TEACHER_DEACTIVATED,
    entityType: "Teacher",
    entityId: teacher._id
  });
  return getTeacher(schoolId, teacherId);
}

async function activateTeacher({ schoolId, actorId, teacherId }) {
  const teacher = await Teacher.findOne({ _id: teacherId, schoolId });
  if (!teacher) throw AppError.notFound("Teacher not found");
  teacher.active = true;
  if (teacher.employmentStatus !== EMPLOYMENT_STATUS.ON_LEAVE) {
    teacher.employmentStatus = EMPLOYMENT_STATUS.ACTIVE;
  }
  await teacher.save();
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.TEACHER_ACTIVATED,
    entityType: "Teacher",
    entityId: teacher._id
  });
  return getTeacher(schoolId, teacherId);
}

async function deleteTeacher({ schoolId, actorId, teacherId }) {
  const teacher = await Teacher.findOne({ _id: teacherId, schoolId });
  if (!teacher) throw AppError.notFound("Teacher not found");
  const [entries, substitutions, statuses, swaps] = await Promise.all([
    TimetableEntry.countDocuments({ schoolId, teacherId }),
    Substitution.countDocuments({
      schoolId,
      $or: [{ absentTeacherId: teacherId }, { substituteTeacherId: teacherId }]
    }),
    DailyTeacherStatus.countDocuments({ schoolId, teacherId }),
    TimetableSwap.countDocuments({
      schoolId,
      $or: [{ teacherAId: teacherId }, { teacherBId: teacherId }]
    })
  ]);
  if (entries + substitutions + statuses + swaps > 0) {
    throw AppError.conflict(
      "This teacher appears in timetable, substitution, or attendance history. Deactivate the teacher instead of deleting."
    );
  }
  await Teacher.deleteOne({ _id: teacherId, schoolId });
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.TEACHER_DELETED,
    entityType: "Teacher",
    entityId: teacherId
  });
  return { deleted: true };
}

module.exports = {
  createTeacher,
  listTeachers,
  getTeacher,
  updateTeacher,
  deactivateTeacher,
  activateTeacher,
  deleteTeacher
};
