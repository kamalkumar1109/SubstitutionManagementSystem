process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_catalog_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "catalog-test-secret";
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
  ClassGroup,
  Class,
  Section,
  Subject,
  AuditLog,
  Substitution,
  SubstitutionRun
} = require("../models");
const { hashPassword } = require("../utils/password");
const { USER_ROLES, EMPLOYMENT_STATUS, AUDIT_ACTIONS } = require("../config/constants");
const { isEligibleForClassGroup } = require("../services/substitutionEngine");

function assert(cond, message) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

function request(server, { method, path, body, token }) {
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
          ...(token ? { Authorization: `Bearer ${token}` } : {})
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

async function seedSchool(prefix) {
  const school = await School.create({
    name: `${prefix} School`,
    schoolCode: `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`,
    email: `${prefix}@school.test`
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

async function login(server, email) {
  const res = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: email, password: "password123", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(res.status === 200 && res.json.token, `login for ${email}`);
  return res.json.token;
}

async function run() {
  await connectDb();
  await mongoose.connection.dropDatabase();

  const a = await seedSchool("A");
  const b = await seedSchool("B");

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const tokenA = await login(server, a.admin.email);
  const tokenB = await login(server, b.admin.email);

  const nameless = await request(server, {
    method: "POST",
    path: "/api/teachers",
    token: tokenA,
    body: { designation: "Sports" }
  });
  assert(nameless.status === 400, "teacher name is required");

  const created = await request(server, {
    method: "POST",
    path: "/api/teachers",
    token: tokenA,
    body: { name: "Amit", schoolId: String(b.school._id) }
  });
  assert(created.status === 403, "spoofed schoolId on teacher create is rejected");

  const amit = await request(server, {
    method: "POST",
    path: "/api/teachers",
    token: tokenA,
    body: { name: "Amit" }
  });
  assert(amit.status === 201, "name-only teacher create works");
  assert(String(amit.json.teacher.schoolId) === String(a.school._id), "teacher schoolId comes from auth");

  const auditAdd = await AuditLog.findOne({
    schoolId: a.school._id,
    action: AUDIT_ACTIONS.TEACHER_ADDED,
    entityId: amit.json.teacher._id
  });
  assert(Boolean(auditAdd), "adding a teacher writes an audit log");

  const groupA = await request(server, {
    method: "POST",
    path: "/api/catalog/class-groups",
    token: tokenA,
    body: { name: "6-8", sortOrder: 3 }
  });
  assert(groupA.status === 201, "class group create");

  const groupB = await request(server, {
    method: "POST",
    path: "/api/catalog/class-groups",
    token: tokenB,
    body: { name: "6-8", sortOrder: 3 }
  });
  assert(groupB.status === 201, "school B can create its own 6-8 group");

  const stealGroup = await request(server, {
    method: "POST",
    path: "/api/catalog/classes",
    token: tokenA,
    body: { name: "Class 7", classGroupId: groupB.json.classGroup._id }
  });
  assert(stealGroup.status === 400, "cannot attach a class to another school's group");

  const classA = await request(server, {
    method: "POST",
    path: "/api/catalog/classes",
    token: tokenA,
    body: { name: "Class 7", classGroupId: groupA.json.classGroup._id, gradeNumber: 7 }
  });
  assert(classA.status === 201, "class create");

  const sectionA = await request(server, {
    method: "POST",
    path: "/api/catalog/sections",
    token: tokenA,
    body: { name: "7A", classId: classA.json.class._id }
  });
  assert(sectionA.status === 201, "section create");

  const subjectA = await request(server, {
    method: "POST",
    path: "/api/catalog/subjects",
    token: tokenA,
    body: { name: "Mathematics" }
  });
  assert(subjectA.status === 201, "subject create");

  const listsB = await request(server, {
    method: "GET",
    path: "/api/catalog/classes?includeInactive=true",
    token: tokenB
  });
  assert((listsB.json.classes || []).length === 0, "school B does not see school A classes");

  const edit = await request(server, {
    method: "PATCH",
    path: `/api/teachers/${amit.json.teacher._id}`,
    token: tokenA,
    body: {
      employeeCode: "GF-01",
      designation: "PGT",
      subjects: [subjectA.json.subject._id],
      eligibleClassGroups: [groupA.json.classGroup._id],
      schoolId: String(b.school._id)
    }
  });
  assert(edit.status === 403, "cannot move a teacher to another school");

  const editOk = await request(server, {
    method: "PATCH",
    path: `/api/teachers/${amit.json.teacher._id}`,
    token: tokenA,
    body: {
      employeeCode: "GF-01",
      designation: "PGT",
      subjects: [subjectA.json.subject._id],
      eligibleClassGroups: [groupA.json.classGroup._id]
    }
  });
  assert(editOk.status === 200, "teacher edit works");
  assert(editOk.json.teacher.employeeCode === "GF-01", "employee code saved");
  assert((editOk.json.teacher.eligibleClassGroups || []).some((g) => g.name === "6-8"), "class group assigned");

  const teacherDoc = await Teacher.findById(amit.json.teacher._id);
  assert(isEligibleForClassGroup(teacherDoc, groupA.json.classGroup._id), "engine accepts eligible group");
  assert(!isEligibleForClassGroup(teacherDoc, groupB.json.classGroup._id), "engine rejects other school group id");

  const search = await request(server, {
    method: "GET",
    path: "/api/teachers?includeInactive=true&q=Mathematics",
    token: tokenA
  });
  assert((search.json.teachers || []).some((t) => t.name === "Amit"), "search by subject finds teacher");

  const steal = await request(server, {
    method: "PATCH",
    path: `/api/teachers/${amit.json.teacher._id}`,
    token: tokenB,
    body: { name: "Hijacked" }
  });
  assert(steal.status === 404, "school B cannot edit school A teacher");

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
    classId: classA.json.class._id,
    sectionId: sectionA.json.section._id,
    absentTeacherId: amit.json.teacher._id,
    substituteTeacherId: amit.json.teacher._id,
    subjectId: subjectA.json.subject._id,
    source: "GENERATED",
    status: "ASSIGNED"
  });

  const deactivated = await request(server, {
    method: "POST",
    path: `/api/teachers/${amit.json.teacher._id}/deactivate`,
    token: tokenA,
    body: { asResigned: true }
  });
  assert(deactivated.status === 200, "deactivate/resigned works");
  assert(deactivated.json.teacher.active === false, "teacher is inactive");
  assert(deactivated.json.teacher.employmentStatus === EMPLOYMENT_STATUS.RESIGNED, "status is resigned");

  const stillThere = await Teacher.findById(amit.json.teacher._id);
  assert(Boolean(stillThere), "teacher is not hard-deleted");
  assert(stillThere.active === false, "inactive/resigned teacher cannot take new substitutions");

  const hist = await Substitution.countDocuments({ schoolId: a.school._id });
  assert(hist === 1, "historical substitutions remain");

  const del = await request(server, {
    method: "DELETE",
    path: `/api/teachers/${amit.json.teacher._id}`,
    token: tokenA
  });
  assert(del.status === 409, "DELETE is refused when substitution history exists");
  assert(await Teacher.findById(amit.json.teacher._id), "historical teacher is preserved");

  const activated = await request(server, {
    method: "POST",
    path: `/api/teachers/${amit.json.teacher._id}/activate`,
    token: tokenA
  });
  assert(activated.status === 200 && activated.json.teacher.active === true, "teacher can be activated again");

  const stray = await request(server, {
    method: "POST",
    path: "/api/teachers",
    token: tokenA,
    body: { name: "Wrong Entry" }
  });
  const strayDel = await request(server, {
    method: "DELETE",
    path: `/api/teachers/${stray.json.teacher._id}`,
    token: tokenA
  });
  assert(strayDel.status === 200, "unreferenced teacher can be deleted");
  assert(!(await Teacher.findById(stray.json.teacher._id)), "deleted teacher is removed");

  const subjectOff = await request(server, {
    method: "POST",
    path: `/api/catalog/subjects/${subjectA.json.subject._id}/deactivate`,
    token: tokenA
  });
  assert(subjectOff.status === 200 && subjectOff.json.subject.active === false, "subject deactivate");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[catalog] all checks passed");
}

run().catch(async (err) => {
  console.error("[catalog] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
