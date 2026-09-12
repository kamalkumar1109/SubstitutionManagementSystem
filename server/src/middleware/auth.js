const { AppError } = require("../utils/AppError");
const { USER_ROLES } = require("../config/constants");
const { User, School } = require("../models");
const { verifyToken } = require("../utils/jwt");

const SCHOOL_DEACTIVATED =
  "Your school account has been deactivated. Please contact the platform administrator.";

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [, token] = header.split(" ");
    if (!token) throw AppError.unauthorized("Missing bearer token");

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw AppError.unauthorized("Invalid or expired token");
    }

    const user = await User.findById(payload.sub);
    if (!user || !user.active) throw AppError.unauthorized("Account is inactive");

    if (user.role === USER_ROLES.SCHOOL_ADMIN) {
      if (!user.schoolId) throw AppError.forbidden("User is not attached to a school");
      const school = await School.findById(user.schoolId).select("active");
      if (!school || !school.active) throw AppError.forbidden(SCHOOL_DEACTIVATED);
    }

    req.user = user;
    req.auth = payload;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(AppError.forbidden("Insufficient role"));
    }
    next();
  };
}

module.exports = { authenticate, requireRoles };
