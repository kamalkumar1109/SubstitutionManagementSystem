const asyncHandler = require("../utils/asyncHandler");
const schoolService = require("../services/schoolService");
const { USER_ROLES } = require("../config/constants");
const { AppError } = require("../utils/AppError");

const list = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.SUPER_ADMIN) {
    throw AppError.forbidden("Only SUPER_ADMIN can list all schools");
  }
  const schools = await schoolService.listSchools();
  res.json({ ok: true, schools });
});

const getOne = asyncHandler(async (req, res) => {
  const school = await schoolService.getSchool(req.schoolId);
  res.json({ ok: true, school });
});

const update = asyncHandler(async (req, res) => {
  const school = await schoolService.updateSchool(req.schoolId, req.body);
  res.json({ ok: true, school });
});

module.exports = { list, getOne, update };
