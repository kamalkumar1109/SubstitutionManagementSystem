const mongoose = require("mongoose");
const { USER_ROLES } = require("../config/constants");
const { AppError } = require("../utils/AppError");

function extractRequestedSchoolId(req) {
  return (
    req.headers["x-school-id"] ||
    req.params.schoolId ||
    req.query.schoolId ||
    (req.body && req.body.schoolId) ||
    null
  );
}

function schoolScope(req, res, next) {
  try {
    if (!req.user) throw AppError.unauthorized();

    if (req.user.role === USER_ROLES.SUPER_ADMIN) {
      const requested = extractRequestedSchoolId(req);
      if (!requested) {
        throw AppError.badRequest("schoolId is required (use X-School-Id header)");
      }
      if (!mongoose.isValidObjectId(requested)) {
        throw AppError.badRequest("Invalid schoolId");
      }
      req.schoolId = requested;
      return next();
    }

    if (req.user.role === USER_ROLES.SCHOOL_ADMIN) {
      if (!req.user.schoolId) {
        throw AppError.forbidden("User is not attached to a school");
      }
      const requested = extractRequestedSchoolId(req);
      if (requested && String(requested) !== String(req.user.schoolId)) {
        throw AppError.forbidden("Cannot access another school's data");
      }
      req.schoolId = req.user.schoolId;
      return next();
    }

    throw AppError.forbidden();
  } catch (err) {
    next(err);
  }
}

function schoolFilter(req, extra = {}) {
  return { schoolId: req.schoolId, ...extra };
}

module.exports = { schoolScope, schoolFilter, extractRequestedSchoolId };
