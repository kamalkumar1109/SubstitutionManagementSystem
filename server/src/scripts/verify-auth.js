process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_auth_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "auth-test-secret";
process.env.NODE_ENV = "test";

const http = require("http");
const mongoose = require("mongoose");
const { connectDb, disconnectDb } = require("../config/db");
const { createApp } = require("../app");
const {
  School,
  User,
  Teacher,
  AcademicSession,
  DailyTeacherStatus,
  Substitution,
  SubstitutionRun,
  Payment,
  Enquiry
} = require("../models");
const { hashPassword } = require("../utils/password");
const {
  USER_ROLES,
  DAILY_TEACHER_STATUS,
  SUBSTITUTION_STATUS,
  SUBSTITUTION_SOURCE,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS
} = require("../config/constants");

function assert(cond, message) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

function request(server, { method, path, body, token, schoolId }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: addr.port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(schoolId ? { "X-School-Id": String(schoolId) } : {})
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          let json = {};
          try {
            json = data ? JSON.parse(data) : {};
          } catch {
            json = { raw: data };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function seedSchool(prefix, extras = {}) {
  const school = await School.create({
    name: `${prefix} School`,
    schoolCode: `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`,
    email: `${prefix}@school.test`,
    active: extras.active !== false,
    subscription: extras.subscription || {}
  });
  const passwordHash = await hashPassword("password123");
  const admin = await User.create({
    schoolId: school._id,
    name: `${prefix} Admin`,
    email: `${prefix}-admin-${Date.now()}@school.test`,
    passwordHash,
    role: USER_ROLES.SCHOOL_ADMIN
  });
  const session = await AcademicSession.create({
    schoolId: school._id,
    name: "2026-27",
    startDate: new Date("2026-04-01"),
    endDate: new Date("2027-03-31"),
    isCurrent: true,
    status: "CURRENT"
  });
  school.currentAcademicSession = session._id;
  await school.save();
  return { school, admin, session };
}

async function run() {
  await connectDb();
  await mongoose.connection.dropDatabase();

  const a = await seedSchool("A", {
    subscription: { status: SUBSCRIPTION_STATUS.ACTIVE }
  });
  const b = await seedSchool("B");

  const teacherA = await Teacher.create({ schoolId: a.school._id, name: "Teacher A1" });
  const teacherA2 = await Teacher.create({ schoolId: a.school._id, name: "Teacher A2" });
  const teacherB = await Teacher.create({ schoolId: b.school._id, name: "Teacher B1" });

  await DailyTeacherStatus.create({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    teacherId: teacherA._id,
    dateKey: "2026-09-01",
    status: DAILY_TEACHER_STATUS.ABSENT
  });

  const runDoc = await SubstitutionRun.create({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    dateKey: "2026-09-01",
    generationVersion: "1",
    status: "COMPLETED"
  });
  await Substitution.create({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    substitutionRunId: runDoc._id,
    dateKey: "2026-09-01",
    period: 1,
    classId: new mongoose.Types.ObjectId(),
    sectionId: new mongoose.Types.ObjectId(),
    absentTeacherId: teacherA._id,
    substituteTeacherId: teacherA2._id,
    subjectId: new mongoose.Types.ObjectId(),
    source: SUBSTITUTION_SOURCE.GENERATED,
    status: SUBSTITUTION_STATUS.ASSIGNED
  });

  await Payment.create({
    schoolId: a.school._id,
    amount: 12000,
    currency: "INR",
    status: PAYMENT_STATUS.SUCCEEDED
  });
  await Enquiry.create({
    email: "office@a.test",
    schoolName: "A School",
    message: "Demo request"
  });

  const superHash = await hashPassword("password123");
  await User.create({
    schoolId: null,
    name: "Owner",
    email: "owner-auth@test.com",
    passwordHash: superHash,
    role: USER_ROLES.SUPER_ADMIN
  });

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const noToken = await request(server, { method: "GET", path: "/api/schools/current/dashboard" });
  assert(noToken.status === 401, "dashboard requires authentication");

  const bad = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { email: a.admin.email, password: "wrong-password", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(bad.status === 401, "invalid school password is rejected");
  assert(!JSON.stringify(bad.json).toLowerCase().includes("hash"), "errors do not leak password hashes");

  const crossRole = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { email: "owner-auth@test.com", password: "password123", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(crossRole.status === 401, "super admin cannot use school login");

  const loginA = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: a.admin.email, password: "password123", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(loginA.status === 200 && loginA.json.token, "school A login works");
  assert(loginA.json.user.role === USER_ROLES.SCHOOL_ADMIN, "school A role is SCHOOL_ADMIN");
  assert(!loginA.json.user.passwordHash, "login payload has no password hash");

  const loginByCode = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: a.school.schoolCode, password: "password123", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(loginByCode.status === 200, "school login ID (school code) works");

  const loginB = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { email: b.admin.email, password: "password123", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(loginB.status === 200, "school B login works");

  const loginOwner = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { email: "owner-auth@test.com", password: "password123", expectedRole: USER_ROLES.SUPER_ADMIN }
  });
  assert(loginOwner.status === 200 && loginOwner.json.user.role === USER_ROLES.SUPER_ADMIN, "super admin login works");

  const { ensureSuperAdmin } = require("../services/authService");
  await ensureSuperAdmin({
    email: "owner-auth@test.com",
    password: "rotated-pass-99",
    name: "Rotated Owner"
  });
  const rotated = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: {
      loginId: "owner-auth@test.com",
      password: "rotated-pass-99",
      expectedRole: USER_ROLES.SUPER_ADMIN
    }
  });
  assert(rotated.status === 200, "super admin password from setup/env sync works");
  const stale = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: {
      loginId: "owner-auth@test.com",
      password: "password123",
      expectedRole: USER_ROLES.SUPER_ADMIN
    }
  });
  assert(stale.status === 401, "old super admin password is no longer valid after sync");

  const dashA = await request(server, {
    method: "GET",
    path: "/api/schools/current/dashboard",
    token: loginA.json.token
  });
  assert(dashA.status === 200, "school A dashboard loads");
  assert(dashA.json.dashboard.school.name === a.school.name, "dashboard is for school A");
  assert(dashA.json.dashboard.summary.totalTeachers === 2, "school A teacher count is isolated");

  const dashB = await request(server, {
    method: "GET",
    path: "/api/schools/current/dashboard",
    token: loginB.json.token
  });
  assert(dashB.json.dashboard.summary.totalTeachers === 1, "school B teacher count is isolated");
  assert(dashA.json.dashboard.summary.totalTeachers !== dashB.json.dashboard.summary.totalTeachers, "A and B stats differ");

  const spoofDash = await request(server, {
    method: "GET",
    path: "/api/schools/current/dashboard",
    token: loginA.json.token,
    schoolId: b.school._id
  });
  assert(spoofDash.status === 403, "school A cannot spoof dashboard schoolId");

  const teachersA = await request(server, {
    method: "GET",
    path: "/api/teachers",
    token: loginA.json.token
  });
  const namesA = (teachersA.json.teachers || []).map((t) => t.name);
  assert(!namesA.includes("Teacher B1"), "school A teacher list excludes school B");

  const stealTeacher = await request(server, {
    method: "GET",
    path: `/api/teachers/${teacherB._id}`,
    token: loginA.json.token
  });
  assert(stealTeacher.status === 404, "school A cannot fetch school B teacher by id");

  const stealSubs = await request(server, {
    method: "GET",
    path: `/api/substitutions?date=2026-09-01&academicSessionId=${b.session._id}`,
    token: loginA.json.token
  });
  assert(stealSubs.status === 404, "school A cannot query school B academic session substitutions");

  const subsA = await request(server, {
    method: "GET",
    path: `/api/substitutions?date=2026-09-01`,
    token: loginA.json.token
  });
  assert(subsA.status === 200 && (subsA.json.substitutions || []).length === 1, "school A sees own substitutions");

  const subsB = await request(server, {
    method: "GET",
    path: `/api/substitutions?date=2026-09-01`,
    token: loginB.json.token
  });
  assert((subsB.json.substitutions || []).length === 0, "school B does not see school A substitutions");

  const adminFromSchool = await request(server, {
    method: "GET",
    path: "/api/admin/overview",
    token: loginA.json.token
  });
  assert(adminFromSchool.status === 403, "school user cannot open platform overview");

  const schoolDashFromOwner = await request(server, {
    method: "GET",
    path: "/api/schools/current/dashboard",
    token: loginOwner.json.token,
    schoolId: a.school._id
  });
  assert(schoolDashFromOwner.status === 200, "super admin can open a school dashboard with X-School-Id");
  const ownerNoSchool = await request(server, {
    method: "GET",
    path: "/api/schools/current/dashboard",
    token: loginOwner.json.token
  });
  assert(ownerNoSchool.status === 400, "super admin still needs a school id for school endpoints");

  const overview = await request(server, {
    method: "GET",
    path: "/api/admin/overview",
    token: loginOwner.json.token
  });
  assert(overview.status === 200, "super admin overview loads");
  assert(overview.json.overview.metrics.totalSchools === 2, "overview school count is from the database");
  assert(overview.json.overview.metrics.totalEnquiries === 1, "overview enquiry count is from the database");
  assert(overview.json.overview.metrics.successfulPayments === 1, "paid subscription metric is from payments");

  const payments = await request(server, {
    method: "GET",
    path: "/api/billing/payments",
    token: loginA.json.token
  });
  assert(payments.status === 403, "school user cannot list platform payments");

  const ownerEmailChange = await request(server, {
    method: "PATCH",
    path: "/api/auth/email",
    token: loginOwner.json.token,
    body: { email: "owner-new@test.com" }
  });
  assert(ownerEmailChange.status === 403, "super admin cannot change a school login email here");

  const badEmail = await request(server, {
    method: "PATCH",
    path: "/api/auth/email",
    token: loginA.json.token,
    body: { email: "not-an-email" }
  });
  assert(badEmail.status === 400, "invalid email format is rejected");

  const dupEmail = await request(server, {
    method: "PATCH",
    path: "/api/auth/email",
    token: loginA.json.token,
    body: { email: b.admin.email }
  });
  assert(dupEmail.status === 409, "duplicate email is rejected");

  const wrongOld = await request(server, {
    method: "PATCH",
    path: "/api/auth/password",
    token: loginA.json.token,
    body: { oldPassword: "wrong-old-pass", newPassword: "newpass12", confirmPassword: "newpass12" }
  });
  assert(wrongOld.status === 400, "incorrect old password is rejected");
  assert(wrongOld.status !== 401, "wrong old password does not expire the session");

  const mismatch = await request(server, {
    method: "PATCH",
    path: "/api/auth/password",
    token: loginA.json.token,
    body: { oldPassword: "password123", newPassword: "newpass12", confirmPassword: "otherpass" }
  });
  assert(mismatch.status === 400, "mismatched new passwords are rejected");

  const newEmail = "a-login-new@school.test";
  const emailChanged = await request(server, {
    method: "PATCH",
    path: "/api/auth/email",
    token: loginA.json.token,
    body: { email: newEmail }
  });
  assert(emailChanged.status === 200 && emailChanged.json.user.email === newEmail, "school login email is updated");
  assert(!emailChanged.json.user.passwordHash, "email change does not return a password");
  const schoolAfterEmail = await School.findById(a.school._id);
  assert(schoolAfterEmail.email === newEmail, "school contact email stays in sync with login email");

  const oldEmailLogin = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: a.admin.email, password: "password123", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(oldEmailLogin.status === 401, "previous email no longer signs in");

  const newEmailLogin = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: newEmail, password: "password123", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(newEmailLogin.status === 200, "new email signs in immediately");

  const passwordChanged = await request(server, {
    method: "PATCH",
    path: "/api/auth/password",
    token: newEmailLogin.json.token,
    body: { oldPassword: "password123", newPassword: "newpass12", confirmPassword: "newpass12" }
  });
  assert(passwordChanged.status === 200, "password is updated");
  assert(!JSON.stringify(passwordChanged.json).toLowerCase().includes("newpass12"), "new password is not returned");

  const oldPassLogin = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: newEmail, password: "password123", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(oldPassLogin.status === 401, "previous password no longer signs in");

  const newPassLogin = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: newEmail, password: "newpass12", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(newPassLogin.status === 200, "new password signs in");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[auth] all checks passed");
}

run().catch(async (err) => {
  console.error("[auth] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
