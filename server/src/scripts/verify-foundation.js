process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_foundation_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "foundation-test-secret";
process.env.NODE_ENV = "test";

const http = require("http");
const mongoose = require("mongoose");
const { connectDb, disconnectDb } = require("../config/db");
const { createApp } = require("../app");
const {
  School,
  User,
  Teacher,
  ClassGroup,
  Class,
  Section,
  Subject,
  AcademicSession,
  Timetable,
  TimetableEntry
} = require("../models");
const { hashPassword } = require("../utils/password");
const { USER_ROLES, TIMETABLE_STATUS, DAILY_TEACHER_STATUS, DAYS_OF_WEEK } = require("../config/constants");
const { generateAssignments, isEligibleForClassGroup } = require("../services/substitutionEngine");

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

async function seedSchoolBundle(prefix) {
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

  const gLow = await ClassGroup.create({ schoolId: school._id, name: "1-2", sortOrder: 1 });
  const gMid = await ClassGroup.create({ schoolId: school._id, name: "6-8", sortOrder: 3 });
  const class1 = await Class.create({
    schoolId: school._id,
    classGroupId: gLow._id,
    name: "Grade 1"
  });
  const class7 = await Class.create({
    schoolId: school._id,
    classGroupId: gMid._id,
    name: "Grade 7"
  });
  const sec1 = await Section.create({ schoolId: school._id, classId: class1._id, name: "1A" });
  const sec7 = await Section.create({ schoolId: school._id, classId: class7._id, name: "7A" });
  const math = await Subject.create({ schoolId: school._id, name: "Mathematics", code: "MATH" });

  return { school, admin, session, gLow, gMid, class1, class7, sec1, sec7, math };
}

async function run() {
  console.log("[foundation] connecting to", process.env.MONGODB_URI);
  await connectDb();
  await mongoose.connection.dropDatabase();

  const nameOnly = await Teacher.create({
    schoolId: new mongoose.Types.ObjectId(),
    name: "Only Name"
  });
  assert(nameOnly.name === "Only Name", "teacher can be created with name only");

  let validationFailed = false;
  try {
    await Teacher.create({ schoolId: new mongoose.Types.ObjectId() });
  } catch {
    validationFailed = true;
  }
  assert(validationFailed, "teacher without name is rejected");

  const a = await seedSchoolBundle("A");
  const b = await seedSchoolBundle("B");

  const teacherB = await Teacher.create({
    schoolId: b.school._id,
    name: "School B Teacher",
    eligibleClassGroups: [b.gMid._id]
  });

  const leaked = await Teacher.find({ schoolId: a.school._id, _id: teacherB._id });
  assert(leaked.length === 0, "school A query cannot see school B teacher");

  const midTeacher = await Teacher.create({
    schoolId: a.school._id,
    name: "Middle Group Teacher",
    eligibleClassGroups: [a.gMid._id]
  });
  const lowTeacher = await Teacher.create({
    schoolId: a.school._id,
    name: "Primary Group Teacher",
    eligibleClassGroups: [a.gLow._id]
  });
  const absentLow = await Teacher.create({
    schoolId: a.school._id,
    name: "Absent Primary",
    eligibleClassGroups: [a.gLow._id]
  });

  assert(isEligibleForClassGroup(midTeacher, a.gMid._id), "eligible for 6-8");
  assert(!isEligibleForClassGroup(midTeacher, a.gLow._id), "not eligible for 1-2");

  const timetable = await Timetable.create({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    name: "Main",
    status: TIMETABLE_STATUS.ACTIVE,
    version: 1
  });
  midTeacher.homeWingTimetableId = timetable._id;
  lowTeacher.homeWingTimetableId = timetable._id;
  absentLow.homeWingTimetableId = timetable._id;

  await TimetableEntry.create({
    timetableId: timetable._id,
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    dayOfWeek: DAYS_OF_WEEK[2],
    period: 1,
    teacherId: absentLow._id,
    subjectId: a.math._id,
    classId: a.class1._id,
    sectionId: a.sec1._id
  });

  const { assignments } = generateAssignments({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    dateKey: "2026-09-01",
    dayOfWeek: "TUESDAY",
    teachers: [midTeacher, lowTeacher, absentLow],
    classesById: new Map([
      [String(a.class1._id), a.class1],
      [String(a.class7._id), a.class7]
    ]),
    statusByTeacherId: new Map([
      [String(absentLow._id), DAILY_TEACHER_STATUS.ABSENT],
      [String(midTeacher._id), DAILY_TEACHER_STATUS.PRESENT],
      [String(lowTeacher._id), DAILY_TEACHER_STATUS.PRESENT]
    ]),
    timetableEntries: await TimetableEntry.find({ timetableId: timetable._id }),
    existingSubstitutions: []
  });

  assert(assignments.length === 1, "one substitution slot generated");
  assert(
    String(assignments[0].substituteTeacherId) === String(lowTeacher._id),
    "only class-group-eligible teacher is assigned"
  );

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const health = await request(server, { method: "GET", path: "/api/health" });
  assert(health.status === 200 && health.json.db === "connected", "MongoDB health reports connected");

  const loginA = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { email: a.admin.email, password: "password123" }
  });
  assert(loginA.status === 200 && loginA.json.token, "school A login works");

  const loginB = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { email: b.admin.email, password: "password123" }
  });
  assert(loginB.status === 200 && loginB.json.token, "school B login works");

  const teachersA = await request(server, {
    method: "GET",
    path: "/api/teachers",
    token: loginA.json.token
  });
  assert(teachersA.status === 200, "school A can list own teachers");
  const namesA = (teachersA.json.teachers || []).map((t) => t.name);
  assert(!namesA.includes("School B Teacher"), "school A list does not include school B teachers");

  const cross = await request(server, {
    method: "GET",
    path: `/api/teachers/${teacherB._id}`,
    token: loginA.json.token
  });
  assert(cross.status === 404, "school A cannot fetch school B teacher by id");

  const spoof = await request(server, {
    method: "GET",
    path: "/api/teachers",
    token: loginA.json.token,
    schoolId: b.school._id
  });
  assert(spoof.status === 403, "school A cannot spoof X-School-Id for school B");

  const addNameOnly = await request(server, {
    method: "POST",
    path: "/api/teachers",
    token: loginA.json.token,
    body: { name: "Fresh Teacher" }
  });
  assert(addNameOnly.status === 201, "admin can add teacher with name only");

  const catalogB = await request(server, {
    method: "GET",
    path: "/api/catalog/class-groups",
    token: loginB.json.token
  });
  assert(catalogB.status === 200, "school B can list own class groups");
  const catalogAGroups = await request(server, {
    method: "GET",
    path: "/api/catalog/class-groups",
    token: loginA.json.token
  });
  const idsA = (catalogAGroups.json.classGroups || []).map((g) => String(g._id));
  const idsB = (catalogB.json.classGroups || []).map((g) => String(g._id));
  assert(idsA.every((id) => !idsB.includes(id)), "class groups are school-isolated");

  const upcoming = await AcademicSession.create({
    schoolId: a.school._id,
    name: "2027-28",
    startDate: new Date("2027-04-01"),
    endDate: new Date("2028-03-31"),
    isCurrent: false,
    status: "UPCOMING"
  });
  const { createSession } = require("../services/academicSessionService");
  const newer = await createSession({
    schoolId: a.school._id,
    actorId: a.admin._id,
    name: "2028-29",
    startDate: new Date("2028-04-01"),
    endDate: new Date("2029-03-31"),
    setCurrent: true
  });
  const stillUpcoming = await AcademicSession.findById(upcoming._id);
  assert(stillUpcoming.status === "UPCOMING", "setting a current session does not archive upcoming sessions");
  const previousCurrent = await AcademicSession.findById(a.session._id);
  assert(previousCurrent.status === "ARCHIVED", "previous current session is archived, not deleted");
  assert(String(newer.session._id) !== String(a.session._id), "new session is a new document");
  const oldTimetableStillThere = await Timetable.findById(timetable._id);
  assert(oldTimetableStillThere, "creating a new session does not delete the previous timetable");
  assert(
    String(newer.timetable.academicSessionId) === String(newer.session._id),
    "new session gets its own timetable"
  );

  const badLogin = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { email: a.admin.email, password: "wrong-password" }
  });
  assert(badLogin.status === 401, "invalid password is rejected");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[foundation] all checks passed");
}

run().catch(async (err) => {
  console.error("[foundation] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
