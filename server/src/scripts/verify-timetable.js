process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_timetable_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "timetable-test-secret";
process.env.NODE_ENV = "test";
process.env.SUBSCRIPTION_ENFORCEMENT = "false";

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
const {
  USER_ROLES,
  TIMETABLE_STATUS,
  DAILY_TEACHER_STATUS,
  EMPLOYMENT_STATUS
} = require("../config/constants");
const { findActiveTimetable } = require("../services/timetableService");
const { generateAssignments } = require("../services/substitutionEngine");
const { describeConstraints } = require("../services/timetableGenerator");

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
    schoolCode: `${prefix}${Date.now()}${Math.floor(Math.random() * 99)}`,
    email: `${prefix}@school.test`
  });
  const admin = await User.create({
    schoolId: school._id,
    name: `${prefix} Admin`,
    email: `${prefix}-admin-${Date.now()}@school.test`,
    passwordHash: await hashPassword("password123"),
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
  const gMid = await ClassGroup.create({ schoolId: school._id, name: "6-8", sortOrder: 1 });
  const gLow = await ClassGroup.create({ schoolId: school._id, name: "1-2", sortOrder: 2 });
  const class7 = await Class.create({ schoolId: school._id, classGroupId: gMid._id, name: "Class 7" });
  const class8 = await Class.create({ schoolId: school._id, classGroupId: gMid._id, name: "Class 8" });
  const class1 = await Class.create({ schoolId: school._id, classGroupId: gLow._id, name: "Class 1" });
  const sec7a = await Section.create({ schoolId: school._id, classId: class7._id, name: "7A" });
  const sec7b = await Section.create({ schoolId: school._id, classId: class7._id, name: "7B" });
  const sec8a = await Section.create({ schoolId: school._id, classId: class8._id, name: "8A" });
  const math = await Subject.create({ schoolId: school._id, name: "Mathematics" });
  const english = await Subject.create({ schoolId: school._id, name: "English" });
  const rahul = await Teacher.create({
    schoolId: school._id,
    name: "Rahul",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [math._id],
    eligibleClassGroups: [gMid._id]
  });
  const neha = await Teacher.create({
    schoolId: school._id,
    name: "Neha",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [english._id],
    eligibleClassGroups: [gMid._id]
  });
  return {
    school,
    admin,
    session,
    gMid,
    gLow,
    class7,
    class8,
    class1,
    sec7a,
    sec7b,
    sec8a,
    math,
    english,
    rahul,
    neha
  };
}

async function run() {
  await connectDb();
  await mongoose.connection.dropDatabase();

  assert(describeConstraints().implemented === false, "generator remains unimplemented");

  const a = await seedSchool("A");
  const b = await seedSchool("B");

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  async function login(email) {
    const res = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { loginId: email, password: "password123", expectedRole: USER_ROLES.SCHOOL_ADMIN }
    });
    assert(res.status === 200, `login ${email}`);
    return res.json.token;
  }

  const tokenA = await login(a.admin.email);
  const tokenB = await login(b.admin.email);

  const created = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token: tokenA,
    body: {
      academicSessionId: a.session._id,
      name: "Main timetable",
      periodCount: 6,
      status: TIMETABLE_STATUS.ACTIVE
    }
  });
  assert(created.status === 201 && created.json.timetable.periodCount === 6, "create timetable with 6 periods");
  const ttId = created.json.timetable._id;

  const listed = await request(server, { method: "GET", path: "/api/timetables", token: tokenA });
  assert(listed.status === 200 && listed.json.timetables.length >= 1, "list school timetables");

  const otherSchool = await request(server, {
    method: "GET",
    path: `/api/timetables/${ttId}/grid`,
    token: tokenB
  });
  assert(otherSchool.status === 404, "school B cannot open school A timetable");

  const lesson = {
    teacherId: a.rahul._id,
    subjectId: a.math._id,
    classId: a.class7._id,
    sectionId: a.sec7a._id,
    dayOfWeek: "MONDAY",
    period: 1,
    room: "R1"
  };
  const added = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: lesson
  });
  assert(added.status === 201 && added.json.entry.teacherName === "Rahul", "create entry");
  const entryId = added.json.entry._id;

  const teacherConflict = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: {
      ...lesson,
      classId: a.class8._id,
      sectionId: a.sec8a._id,
      room: "R2"
    }
  });
  assert(teacherConflict.status === 409, "teacher cannot teach two classes in the same period");

  const classConflict = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: {
      teacherId: a.neha._id,
      subjectId: a.english._id,
      classId: a.class7._id,
      sectionId: a.sec7a._id,
      dayOfWeek: "MONDAY",
      period: 1,
      room: "R3"
    }
  });
  assert(classConflict.status === 409, "class section cannot have two subjects in the same period");

  const roomConflict = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: {
      teacherId: a.neha._id,
      subjectId: a.english._id,
      classId: a.class8._id,
      sectionId: a.sec8a._id,
      dayOfWeek: "MONDAY",
      period: 1,
      room: "R1"
    }
  });
  assert(roomConflict.status === 409, "room cannot be used twice in the same period");

  const otherSection = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: {
      teacherId: a.neha._id,
      subjectId: a.english._id,
      classId: a.class7._id,
      sectionId: a.sec7b._id,
      dayOfWeek: "MONDAY",
      period: 1,
      room: "R4"
    }
  });
  assert(otherSection.status === 201, "another section of the same class can share the period");

  const sectionMismatch = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: {
      teacherId: a.rahul._id,
      subjectId: a.math._id,
      classId: a.class8._id,
      sectionId: a.sec7a._id,
      dayOfWeek: "TUESDAY",
      period: 1
    }
  });
  assert(sectionMismatch.status === 400, "section must belong to class");

  const foreignTeacher = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: {
      teacherId: b.rahul._id,
      subjectId: a.math._id,
      classId: a.class7._id,
      sectionId: a.sec7a._id,
      dayOfWeek: "TUESDAY",
      period: 1
    }
  });
  assert(foreignTeacher.status === 400, "teacher from another school is rejected");

  const eligibility = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: {
      teacherId: a.rahul._id,
      subjectId: a.english._id,
      classId: a.class7._id,
      sectionId: a.sec7a._id,
      dayOfWeek: "WEDNESDAY",
      period: 1
    }
  });
  assert(eligibility.status === 400, "teacher subject eligibility is enforced");

  const tooMany = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: { ...lesson, dayOfWeek: "THURSDAY", period: 9, room: "" }
  });
  assert(tooMany.status === 400, "period above configured count is rejected");

  const edited = await request(server, {
    method: "PATCH",
    path: `/api/timetables/${ttId}/entries/${entryId}`,
    token: tokenA,
    body: { period: 3, room: "Lab 1" }
  });
  assert(edited.status === 200 && edited.json.entry.period === 3, "edit entry");

  const p1again = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: { ...lesson, period: 1, room: "R5" }
  });
  assert(p1again.status === 201, "original period is free after the edit");

  const teacherView = await request(server, {
    method: "GET",
    path: `/api/timetables/${ttId}/teacher/${a.rahul._id}`,
    token: tokenA
  });
  assert(teacherView.status === 200, "teacher timetable");
  const monday = teacherView.json.daysSchedule.find((d) => d.dayOfWeek === "MONDAY");
  const p2 = monday.periods.find((p) => p.period === 2);
  const p3 = monday.periods.find((p) => p.period === 3);
  assert(p2.free === true, "teacher free period");
  assert(p3.free === false && p3.className === "Class 7", "teacher assigned period");

  const classView = await request(server, {
    method: "GET",
    path: `/api/timetables/${ttId}/class/${a.class7._id}?sectionId=${a.sec7a._id}`,
    token: tokenA
  });
  assert(classView.status === 200, "class timetable");
  const classMon = classView.json.daysSchedule.find((d) => d.dayOfWeek === "MONDAY");
  assert(classMon.periods.find((p) => p.period === 3).subjectName === "Mathematics", "class 7A Monday P3");

  const sectionView = await request(server, {
    method: "GET",
    path: `/api/timetables/${ttId}/section/${a.sec7a._id}`,
    token: tokenA
  });
  assert(sectionView.status === 200 && sectionView.json.section.name === "7A", "section timetable");

  const grid = await request(server, {
    method: "GET",
    path: `/api/timetables/${ttId}/grid`,
    token: tokenA
  });
  assert(grid.status === 200 && grid.json.periods.length === 6, "grid uses school period count");
  assert(grid.json.days[0] === "MONDAY" && grid.json.days[5] === "SATURDAY", "grid days Monday to Saturday");

  const oldEntries = await TimetableEntry.find({ timetableId: ttId });
  const oldSnapshot = oldEntries.map((e) => `${e.teacherId}:${e.period}`).sort().join("|");

  const { assignments } = generateAssignments({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    dateKey: "2026-09-01",
    dayOfWeek: "MONDAY",
    teachers: [a.rahul, a.neha],
    classesById: new Map([
      [String(a.class7._id), a.class7],
      [String(a.class8._id), a.class8]
    ]),
    statusByTeacherId: new Map([[String(a.rahul._id), DAILY_TEACHER_STATUS.ABSENT]]),
    timetableEntries: oldEntries,
    existingSubstitutions: []
  });
  assert(assignments.length >= 1, "substitution engine uses timetable slots");
  assert(
    String(assignments[0].academicSessionId) === String(a.session._id),
    "generated substitutions stay on the original academic session"
  );

  const newSession = await request(server, {
    method: "POST",
    path: "/api/academic-sessions",
    token: tokenA,
    body: {
      name: "2027-28",
      startDate: "2027-04-01",
      endDate: "2028-03-31",
      setCurrent: true,
      periodCount: 8
    }
  });
  assert(newSession.status === 201 && newSession.json.timetable, "new session creates a new timetable");
  const historic = await Timetable.findById(ttId);
  assert(historic, "historical timetable document remains");
  const stillEntries = await TimetableEntry.find({ timetableId: ttId });
  assert(stillEntries.length === oldEntries.length, "historical entries remain");
  assert(
    stillEntries.map((e) => `${e.teacherId}:${e.period}`).sort().join("|") === oldSnapshot,
    "substitution generation did not alter the timetable"
  );

  const activeOld = await findActiveTimetable({ schoolId: a.school._id, academicSessionId: a.session._id });
  const activeNew = await findActiveTimetable({
    schoolId: a.school._id,
    academicSessionId: newSession.json.session._id
  });
  assert(String(activeOld._id) === String(ttId), "old session still resolves its own active timetable");
  assert(!activeNew, "new session timetable is draft until activated");

  const activateNew = await request(server, {
    method: "PATCH",
    path: `/api/timetables/${newSession.json.timetable._id}`,
    token: tokenA,
    body: { status: TIMETABLE_STATUS.ACTIVE }
  });
  assert(activateNew.status === 200, "activate new session timetable");
  const stillOldActive = await findActiveTimetable({
    schoolId: a.school._id,
    academicSessionId: a.session._id
  });
  assert(String(stillOldActive._id) === String(ttId), "activating a new session timetable does not overwrite the old one");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[timetable] all checks passed");
}

run().catch(async (err) => {
  console.error("[timetable] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
