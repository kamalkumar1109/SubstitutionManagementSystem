process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_prompt13_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "prompt13-test-secret";
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
const { USER_ROLES, EMPLOYMENT_STATUS, TEACHER_CATEGORY } = require("../config/constants");
const { generateAssignments } = require("../services/substitutionEngine");
const { DAILY_TEACHER_STATUS } = require("../config/constants");

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
  const mid = await ClassGroup.create({ schoolId: school._id, name: "6-8", sortOrder: 1 });
  const low = await ClassGroup.create({ schoolId: school._id, name: "1-5", sortOrder: 2 });
  const class7 = await Class.create({ schoolId: school._id, classGroupId: mid._id, name: "Class 7" });
  const class8 = await Class.create({ schoolId: school._id, classGroupId: mid._id, name: "Class 8" });
  const class1 = await Class.create({ schoolId: school._id, classGroupId: low._id, name: "Class 1" });
  const sec7a = await Section.create({ schoolId: school._id, classId: class7._id, name: "7A" });
  const sec7b = await Section.create({ schoolId: school._id, classId: class7._id, name: "7B" });
  const sec8a = await Section.create({ schoolId: school._id, classId: class8._id, name: "8A" });
  const sec1a = await Section.create({ schoolId: school._id, classId: class1._id, name: "1A" });
  const shooting = await Subject.create({ schoolId: school._id, name: "Shooting" });
  const archery = await Subject.create({ schoolId: school._id, name: "Archery" });
  const math = await Subject.create({ schoolId: school._id, name: "Mathematics" });
  const kamal = await Teacher.create({
    schoolId: school._id,
    name: "Mr. Kamal",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    category: TEACHER_CATEGORY.SPORTS,
    alternateWeekSchedule: true,
    subjects: [shooting._id],
    eligibleClassGroups: [mid._id]
  });
  const santosh = await Teacher.create({
    schoolId: school._id,
    name: "Ms. Santosh",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    category: TEACHER_CATEGORY.SPORTS,
    alternateWeekSchedule: true,
    subjects: [archery._id],
    eligibleClassGroups: [mid._id]
  });
  const rahul = await Teacher.create({
    schoolId: school._id,
    name: "Rahul",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [math._id],
    eligibleClassGroups: [mid._id]
  });
  return {
    school,
    admin,
    session,
    mid,
    low,
    class7,
    class8,
    class1,
    sec7a,
    sec7b,
    sec8a,
    sec1a,
    shooting,
    archery,
    math,
    kamal,
    santosh,
    rahul
  };
}

async function run() {
  await connectDb();
  await mongoose.connection.dropDatabase();
  const a = await seedSchool("P13A");
  const b = await seedSchool("P13B");

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

  const tt0 = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token: tokenA,
    body: {
      academicSessionId: a.session._id,
      name: "Start at 0",
      periodCount: 8,
      periodStart: 0,
      status: "ACTIVE"
    }
  });
  assert(tt0.status === 201 && tt0.json.timetable.periodStart === 0, "create timetable starting at period 0");
  const id0 = tt0.json.timetable._id;
  const grid0 = await request(server, { method: "GET", path: `/api/timetables/${id0}/grid`, token: tokenA });
  assert(
    JSON.stringify(grid0.json.periods) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7]),
    "8 periods starting at 0"
  );

  const p0ok = await request(server, {
    method: "POST",
    path: `/api/timetables/${id0}/entries`,
    token: tokenA,
    body: {
      teacherId: a.rahul._id,
      classId: a.class8._id,
      sectionId: a.sec8a._id,
      dayOfWeek: "MONDAY",
      period: 0
    }
  });
  assert(p0ok.status === 201 && p0ok.json.entry.period === 0, "period 0 lesson allowed");
  assert(String(p0ok.json.entry.subjectId) === String(a.math._id), "teacher subject auto-resolved");

  const p8bad = await request(server, {
    method: "POST",
    path: `/api/timetables/${id0}/entries`,
    token: tokenA,
    body: {
      teacherId: a.rahul._id,
      subjectId: a.math._id,
      classId: a.class8._id,
      sectionId: a.sec8a._id,
      dayOfWeek: "TUESDAY",
      period: 8
    }
  });
  assert(p8bad.status === 400, "period 8 rejected when numbering starts at 0");

  const shrink = await request(server, {
    method: "PATCH",
    path: `/api/timetables/${id0}`,
    token: tokenA,
    body: { periodCount: 8, periodStart: 1 }
  });
  assert(shrink.status === 409, "changing numbering that would drop lessons is blocked");

  const loaded = await request(server, { method: "GET", path: `/api/timetables/${id0}`, token: tokenA });
  assert(loaded.json.timetable.periodCount === 8 && loaded.json.timetable.periodStart === 0, "edit loads existing period config");

  const tt1 = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token: tokenA,
    body: {
      academicSessionId: a.session._id,
      name: "Start at 1",
      periodCount: 8,
      periodStart: 1,
      status: "DRAFT"
    }
  });
  assert(tt1.status === 201 && tt1.json.timetable.periodStart === 1, "create timetable starting at period 1");
  const id1 = tt1.json.timetable._id;
  const grid1 = await request(server, { method: "GET", path: `/api/timetables/${id1}/grid`, token: tokenA });
  assert(
    JSON.stringify(grid1.json.periods) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]),
    "8 periods starting at 1"
  );

  const wrongSubject = await request(server, {
    method: "POST",
    path: `/api/timetables/${id0}/entries`,
    token: tokenA,
    body: {
      teacherId: a.kamal._id,
      subjectId: a.archery._id,
      classId: a.class7._id,
      sectionId: a.sec7a._id,
      dayOfWeek: "WEDNESDAY",
      period: 1
    }
  });
  assert(wrongSubject.status === 400, "teacher cannot be assigned another teacher's subject");

  const wrongClass = await request(server, {
    method: "POST",
    path: `/api/timetables/${id0}/entries`,
    token: tokenA,
    body: {
      teacherId: a.kamal._id,
      subjectId: a.shooting._id,
      classId: a.class1._id,
      dayOfWeek: "WEDNESDAY",
      period: 1,
      sectionId: a.sec1a._id
    }
  });
  assert(wrongClass.status === 400, "ineligible class group rejected");

  const combined = await request(server, {
    method: "POST",
    path: `/api/timetables/${id0}/entries`,
    token: tokenA,
    body: {
      teacherId: a.kamal._id,
      partnerTeacherId: a.santosh._id,
      classId: a.class7._id,
      dayOfWeek: "THURSDAY",
      period: 2,
      alternateWeek: true,
      combinedLabel: "7AB"
    }
  });
  assert(combined.status === 201 && (combined.json.entries || []).length === 4, "combined 7AB without sectionId");
  const oddA = combined.json.entries.find(
    (e) => e.weekPattern === "ODD" && String(e.sectionId) === String(a.sec7a._id)
  );
  const evenA = combined.json.entries.find(
    (e) => e.weekPattern === "EVEN" && String(e.sectionId) === String(a.sec7a._id)
  );
  assert(String(oddA.teacherId) === String(a.kamal._id) && oddA.subjectName === "Shooting", "odd 7A Kamal Shooting");
  assert(String(evenA.teacherId) === String(a.santosh._id) && evenA.subjectName === "Archery", "even 7A Santosh Archery");

  const teacherLesson = await request(server, {
    method: "POST",
    path: `/api/timetables/${id0}/entries`,
    token: tokenA,
    body: {
      teacherId: a.kamal._id,
      classId: a.class8._id,
      sectionId: a.sec8a._id,
      dayOfWeek: "FRIDAY",
      period: 3
    }
  });
  assert(teacherLesson.status === 201, "add from teacher context");
  const lessonId = teacherLesson.json.entry._id;

  const tView = await request(server, {
    method: "GET",
    path: `/api/timetables/${id0}/teacher/${a.kamal._id}`,
    token: tokenA
  });
  const gView = await request(server, { method: "GET", path: `/api/timetables/${id0}/grid`, token: tokenA });
  const cView = await request(server, {
    method: "GET",
    path: `/api/timetables/${id0}/class/${a.class8._id}?sectionId=${a.sec8a._id}`,
    token: tokenA
  });
  const tFri = tView.json.daysSchedule.find((d) => d.dayOfWeek === "FRIDAY").periods.find((p) => p.period === 3);
  const gCell = (gView.json.cells["FRIDAY:3"] || []).find((e) => String(e._id) === String(lessonId));
  const cFri = cView.json.daysSchedule.find((d) => d.dayOfWeek === "FRIDAY").periods.find((p) => p.period === 3);
  assert(String(tFri._id) === String(lessonId), "teacher view uses same entry id");
  assert(gCell && String(gCell.teacherId) === String(a.kamal._id), "grid shows the same entry");
  assert(String(cFri._id) === String(lessonId), "class view uses same entry id");

  const edited = await request(server, {
    method: "PATCH",
    path: `/api/timetables/${id0}/entries/${lessonId}`,
    token: tokenA,
    body: { room: "Gym" }
  });
  assert(edited.status === 200 && edited.json.entry.room === "Gym", "edit lesson");
  const tAfter = await request(server, {
    method: "GET",
    path: `/api/timetables/${id0}/teacher/${a.kamal._id}`,
    token: tokenA
  });
  const tSlot = tAfter.json.daysSchedule.find((d) => d.dayOfWeek === "FRIDAY").periods.find((p) => p.period === 3);
  assert(tSlot.room === "Gym", "edit appears on teacher view");

  const removed = await request(server, {
    method: "DELETE",
    path: `/api/timetables/${id0}/entries/${lessonId}`,
    token: tokenA
  });
  assert(removed.status === 200, "delete lesson");
  const tGone = await request(server, {
    method: "GET",
    path: `/api/timetables/${id0}/teacher/${a.kamal._id}`,
    token: tokenA
  });
  const goneSlot = tGone.json.daysSchedule.find((d) => d.dayOfWeek === "FRIDAY").periods.find((p) => p.period === 3);
  assert(goneSlot.free === true, "deleted lesson gone from teacher view");

  const steal = await request(server, {
    method: "DELETE",
    path: `/api/timetables/${id0}`,
    token: tokenB
  });
  assert(steal.status === 404, "cannot delete another school's timetable");

  const entriesBefore = await TimetableEntry.countDocuments({ timetableId: id1, schoolId: a.school._id });
  const dummy = await request(server, {
    method: "POST",
    path: `/api/timetables/${id1}/entries`,
    token: tokenA,
    body: {
      teacherId: a.rahul._id,
      classId: a.class8._id,
      sectionId: a.sec8a._id,
      dayOfWeek: "MONDAY",
      period: 1
    }
  });
  assert(dummy.status === 201, "lesson on draft timetable");
  const del = await request(server, { method: "DELETE", path: `/api/timetables/${id1}`, token: tokenA });
  assert(del.status === 200 && del.json.deleted === true, "delete timetable");
  assert(!(await Timetable.findById(id1)), "timetable document removed");
  assert((await TimetableEntry.countDocuments({ timetableId: id1 })) === 0, "entries removed with timetable");
  assert(entriesBefore === 0, "started empty");

  const remaining = await TimetableEntry.find({ timetableId: id0 });
  const { assignments } = generateAssignments({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    dateKey: "2026-09-07",
    dayOfWeek: "MONDAY",
    teachers: [a.rahul, a.kamal, a.santosh],
    classesById: new Map([
      [String(a.class7._id), a.class7],
      [String(a.class8._id), a.class8]
    ]),
    statusByTeacherId: new Map([[String(a.rahul._id), DAILY_TEACHER_STATUS.ABSENT]]),
    timetableEntries: remaining,
    existingSubstitutions: []
  });
  assert(assignments.length >= 1, "substitution engine still reads timetable after prompt 13 changes");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[prompt13] all checks passed");
}

run().catch(async (err) => {
  console.error("[prompt13] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
