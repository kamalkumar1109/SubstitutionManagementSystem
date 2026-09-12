const { School, AcademicSession } = require("../models");
const { AppError } = require("../utils/AppError");

async function listSchools() {
  return School.find({}).sort({ name: 1 });
}

async function getSchool(schoolId) {
  const school = await School.findById(schoolId);
  if (!school) throw AppError.notFound("School not found");
  return school;
}

async function updateSchool(schoolId, patch) {
  const allowed = [
    "name",
    "email",
    "phone",
    "address",
    "logo",
    "timezone",
    "active",
    "currentAcademicSession"
  ];
  const update = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) update[key] = patch[key];
  }

  if (update.currentAcademicSession) {
    const session = await AcademicSession.findOne({
      _id: update.currentAcademicSession,
      schoolId
    });
    if (!session) {
      throw AppError.badRequest("currentAcademicSession does not belong to this school");
    }
  }
  const school = await School.findByIdAndUpdate(schoolId, update, {
    new: true,
    runValidators: true
  });
  if (!school) throw AppError.notFound("School not found");
  return school;
}

module.exports = { listSchools, getSchool, updateSchool };
