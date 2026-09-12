const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");

const registerSchool = asyncHandler(async (req, res) => {
  const result = await authService.registerSchoolWithAdmin({
    school: req.body.school,
    admin: req.body.admin
  });
  res.status(201).json({
    ok: true,
    school: result.school,
    token: result.token,
    user: result.user
  });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    email: req.body.email,
    loginId: req.body.loginId || req.body.email,
    password: req.body.password,
    expectedRole: req.body.expectedRole
  });
  res.json({ ok: true, ...result });
});

const logout = asyncHandler(async (req, res) => {
  res.json({ ok: true });
});

const me = asyncHandler(async (req, res) => {
  res.json({ ok: true, user: authService.toPublicUser(req.user) });
});

const createUser = asyncHandler(async (req, res) => {
  const user = await authService.createSchoolUser({
    actor: req.user,
    schoolId: req.schoolId,
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    role: req.body.role
  });
  res.status(201).json({ ok: true, user });
});

const changeEmail = asyncHandler(async (req, res) => {
  const result = await authService.changeSchoolEmail({
    actor: req.user,
    email: req.body.email
  });
  res.json({ ok: true, user: result.user, school: result.school });
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changeSchoolPassword({
    actor: req.user,
    oldPassword: req.body.oldPassword,
    newPassword: req.body.newPassword,
    confirmPassword: req.body.confirmPassword
  });
  res.json({ ok: true, user: result.user });
});

module.exports = {
  registerSchool,
  login,
  logout,
  me,
  createUser,
  changeEmail,
  changePassword
};
