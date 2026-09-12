const { USER_ROLES, AUDIT_ACTIONS } = require("../config/constants");
const { User, School } = require("../models");
const { AppError } = require("../utils/AppError");
const { hashPassword, verifyPassword } = require("../utils/password");
const { signToken } = require("../utils/jwt");
const { writeAudit } = require("./auditService");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublicUser(user) {
  return {
    id: user._id,
    schoolId: user.schoolId,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function issueAuth(user) {
  const token = signToken({
    sub: String(user._id),
    role: user.role,
    schoolId: user.schoolId ? String(user.schoolId) : null
  });
  return { token, user: toPublicUser(user) };
}

async function registerSchoolWithAdmin({ school, admin }) {
  if (!school || !school.name || !school.schoolCode || !school.email) {
    throw AppError.badRequest("School name, schoolCode, and email are required");
  }
  if (!admin || !admin.name || !admin.email || !admin.password) {
    throw AppError.badRequest("Admin name, email, and password are required");
  }

  const existingCode = await School.findOne({ schoolCode: String(school.schoolCode).toUpperCase() });
  if (existingCode) throw AppError.conflict("schoolCode already exists");

  const existingEmail = await User.findOne({ email: String(admin.email).toLowerCase() });
  if (existingEmail) throw AppError.conflict("Admin email already exists");

  const createdSchool = await School.create({
    name: school.name,
    schoolCode: school.schoolCode,
    email: school.email,
    phone: school.phone || "",
    address: school.address || "",
    logo: school.logo || "",
    timezone: school.timezone || "Asia/Kolkata"
  });

  const passwordHash = await hashPassword(admin.password);
  const user = await User.create({
    schoolId: createdSchool._id,
    name: admin.name,
    email: admin.email,
    passwordHash,
    role: USER_ROLES.SCHOOL_ADMIN
  });

  await writeAudit({
    schoolId: createdSchool._id,
    actorId: user._id,
    action: AUDIT_ACTIONS.SCHOOL_CREATED,
    entityType: "School",
    entityId: createdSchool._id
  });

  return { school: createdSchool, ...issueAuth(user) };
}

async function findUserForLogin(identifier) {
  if (identifier.includes("@")) {
    return User.findOne({ email: identifier.toLowerCase() }).select("+passwordHash");
  }

  const school = await School.findOne({
    $or: [{ schoolCode: identifier.toUpperCase() }, { email: identifier.toLowerCase() }]
  });
  if (!school) return null;

  return User.findOne({
    schoolId: school._id,
    role: USER_ROLES.SCHOOL_ADMIN,
    active: true
  }).select("+passwordHash");
}

async function login({ email, password, loginId, expectedRole }) {
  const identifier = String(loginId || email || "").trim();
  if (!identifier || !password) throw AppError.unauthorized("Invalid credentials");

  const user = await findUserForLogin(identifier);
  if (!user || !user.active) throw AppError.unauthorized("Invalid credentials");

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw AppError.unauthorized("Invalid credentials");

  if (expectedRole && user.role !== expectedRole) {
    throw AppError.unauthorized("Invalid credentials");
  }

  if (user.role === USER_ROLES.SCHOOL_ADMIN) {
    if (!user.schoolId) throw AppError.unauthorized("Invalid credentials");
    const school = await School.findById(user.schoolId).select("active");
    if (!school || !school.active) {
      throw AppError.forbidden(
        "Your school account has been deactivated. Please contact the platform administrator."
      );
    }
  }

  user.lastLogin = new Date();
  await user.save();

  await writeAudit({
    schoolId: user.schoolId,
    actorId: user._id,
    action: AUDIT_ACTIONS.AUTH_LOGIN,
    entityType: "User",
    entityId: user._id
  });

  return issueAuth(user);
}

async function createSchoolUser({ actor, schoolId, name, email, password, role }) {
  if (role !== USER_ROLES.SCHOOL_ADMIN) {
    throw AppError.badRequest("Only SCHOOL_ADMIN can be created for a school");
  }
  if (actor.role === USER_ROLES.SCHOOL_ADMIN && String(actor.schoolId) !== String(schoolId)) {
    throw AppError.forbidden("Cannot create users for another school");
  }
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    schoolId,
    name,
    email,
    passwordHash,
    role
  });
  await writeAudit({
    schoolId,
    actorId: actor._id,
    action: AUDIT_ACTIONS.USER_CREATED,
    entityType: "User",
    entityId: user._id
  });
  return toPublicUser(user);
}

async function changeSchoolEmail({ actor, email }) {
  if (!actor || actor.role !== USER_ROLES.SCHOOL_ADMIN) {
    throw AppError.forbidden("Only a school administrator can change the school login email");
  }
  const next = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(next)) throw AppError.badRequest("Enter a valid email address.");

  const user = await User.findById(actor._id);
  if (!user || !user.schoolId) throw AppError.forbidden("User is not attached to a school");
  if (String(user.schoolId) !== String(actor.schoolId)) {
    throw AppError.forbidden("Cannot change another school's login email");
  }
  if (user.email === next) throw AppError.badRequest("This is already your login email.");

  const taken = await User.findOne({ email: next, _id: { $ne: user._id } });
  if (taken) throw AppError.conflict("That email is already in use.");

  user.email = next;
  await user.save();

  const school = await School.findById(user.schoolId);
  if (school) {
    school.email = next;
    await school.save();
  }

  await writeAudit({
    schoolId: user.schoolId,
    actorId: user._id,
    action: AUDIT_ACTIONS.AUTH_EMAIL_CHANGED,
    entityType: "User",
    entityId: user._id,
    metadata: { email: next }
  });

  return { user: toPublicUser(user), school };
}

async function changeSchoolPassword({ actor, oldPassword, newPassword, confirmPassword }) {
  if (!actor || actor.role !== USER_ROLES.SCHOOL_ADMIN) {
    throw AppError.forbidden("Only a school administrator can change the school login password");
  }
  if (!oldPassword || !newPassword) {
    throw AppError.badRequest("Old password and new password are required.");
  }
  if (newPassword !== confirmPassword) {
    throw AppError.badRequest("New password and confirmation do not match.");
  }

  const user = await User.findById(actor._id).select("+passwordHash");
  if (!user || !user.schoolId) throw AppError.forbidden("User is not attached to a school");
  if (String(user.schoolId) !== String(actor.schoolId)) {
    throw AppError.forbidden("Cannot change another school's password");
  }

  const oldOk = await verifyPassword(oldPassword, user.passwordHash);
  if (!oldOk) throw AppError.badRequest("Old password is incorrect.");

  try {
    user.passwordHash = await hashPassword(newPassword);
  } catch (err) {
    throw AppError.badRequest(err.message);
  }
  await user.save();

  await writeAudit({
    schoolId: user.schoolId,
    actorId: user._id,
    action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
    entityType: "User",
    entityId: user._id
  });

  return { user: toPublicUser(user) };
}

async function ensureSuperAdmin({ email, password, name }) {
  if (!email || !password) return null;
  const passwordHash = await hashPassword(password);
  const normalizedEmail = String(email).trim().toLowerCase();
  const displayName = name || "Platform Owner";

  let user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");
  if (user) {
    if (user.role !== USER_ROLES.SUPER_ADMIN) {
      throw AppError.conflict("That email is already used by a non-admin account");
    }
    user.passwordHash = passwordHash;
    user.name = displayName;
    user.active = true;
    user.schoolId = null;
    await user.save();
    return user;
  }

  const existing = await User.findOne({ role: USER_ROLES.SUPER_ADMIN }).select("+passwordHash");
  if (existing) {
    existing.email = normalizedEmail;
    existing.passwordHash = passwordHash;
    existing.name = displayName;
    existing.active = true;
    existing.schoolId = null;
    await existing.save();
    return existing;
  }

  return User.create({
    schoolId: null,
    name: displayName,
    email: normalizedEmail,
    passwordHash,
    role: USER_ROLES.SUPER_ADMIN
  });
}

module.exports = {
  toPublicUser,
  registerSchoolWithAdmin,
  login,
  createSchoolUser,
  changeSchoolEmail,
  changeSchoolPassword,
  ensureSuperAdmin
};
