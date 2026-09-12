process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_prompt12_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "prompt12-test-secret";
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
  TimetableSwap
} = require("../models");
const { hashPassword } = require("../utils/password");
const { USER_ROLES, EMPLOYMENT_STATUS, TEACHER_CATEGORY, WEEK_PATTERN } = require("../config/constants");
const { academicWeekInfo, entryAppliesToWeek } = require("../utils/academicWeek");
const { generateAssignments } = require("../services/substitutionEngine");

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
  const group = await ClassGroup.create({ schoolId: school._id, name: "6-8", sortOrder: 1 });
  const class7 = await Class.create({ schoolId: school._id, classGroupId: group._id, name: "Class 7" });
  const secA = await Section.create({ schoolId: school._id, classId: class7._id, name: "7A" });
  const secB = await Section.create({ schoolId: school._id, classId: class7._id, name: "7B" });
  const math = await Subject.create({ schoolId: school._id, name: "Mathematics" });
  const art = await Subject.create({ schoolId: school._id, name: "Art" });
  const music = await Subject.create({ schoolId: school._id, name: "Music" });
  const rahul = await Teacher.create({
    schoolId: school._id,
    name: "Rahul",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    category: TEACHER_CATEGORY.REGULAR,
    subjects: [math._id],
    eligibleClassGroups: [group._id]
  });
  const artTeacher = await Teacher.create({
    schoolId: school._id,
    name: "Art Lead",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    category: TEACHER_CATEGORY.ACTIVITY,
    alternateWeekSchedule: true,
    subjects: [art._id],
    eligibleClassGroups: [group._id]
  });
  const musicTeacher = await Teacher.create({
    schoolId: school._id,
    name: "Music Lead",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    category: TEACHER_CATEGORY.ACTIVITY,
    alternateWeekSchedule: true,
    subjects: [music._id],
    eligibleClassGroups: [group._id]
  });
  return {
    school,
    admin,
    session,
    group,
    class7,
    secA,
    secB,
    math,
    art,
    music,
    rahul,
    artTeacher,
    musicTeacher
  };
}

async function run() {
  await connectDb();
  await mongoose.connection.dropDatabase();
  const a = await seedSchool("P12A");
  const b = await seedSchool("P12B");

  const week1 = academicWeekInfo(a.session.startDate, "2026-04-01");
  const week2 = academicWeekInfo(a.session.startDate, "2026-04-08");
  assert(week1.weekCount === 1 && week1.weekParity === WEEK_PATTERN.ODD, "Week 1 is Odd");
  assert(week2.weekCount === 2 && week2.weekParity === WEEK_PATTERN.EVEN, "Week 2 is Even");

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

  const offGroup = await request(server, {
    method: "POST",
    path: `/api/catalog/class-groups/${a.group._id}/deactivate`,
    token: tokenA
  });
  assert(offGroup.status === 200 && offGroup.json.classGroup.active === false, "deactivate class group");
  const onGroup = await request(server, {
    method: "POST",
    path: `/api/catalog/class-groups/${a.group._id}/activate`,
    token: tokenA
  });
  assert(onGroup.status === 200 && onGroup.json.classGroup.active === true, "activate class group");

  const offClass = await request(server, {
    method: "POST",
    path: `/api/catalog/classes/${a.class7._id}/deactivate`,
    token: tokenA
  });
  assert(offClass.status === 200 && offClass.json.class.active === false, "deactivate class");
  const onClass = await request(server, {
    method: "POST",
    path: `/api/catalog/classes/${a.class7._id}/activate`,
    token: tokenA
  });
  assert(onClass.status === 200 && onClass.json.class.active === true, "activate class");

  const offSection = await request(server, {
    method: "POST",
    path: `/api/catalog/sections/${a.secA._id}/deactivate`,
    token: tokenA
  });
  assert(offSection.status === 200 && offSection.json.section.active === false, "deactivate section");
  const onSection = await request(server, {
    method: "POST",
    path: `/api/catalog/sections/${a.secA._id}/activate`,
    token: tokenA
  });
  assert(onSection.status === 200 && onSection.json.section.active === true, "activate section");

  const offTeacher = await request(server, {
    method: "POST",
    path: `/api/teachers/${a.rahul._id}/deactivate`,
    token: tokenA
  });
  assert(offTeacher.status === 200 && offTeacher.json.teacher.active === false, "deactivate teacher");
  const onTeacher = await request(server, {
    method: "POST",
    path: `/api/teachers/${a.rahul._id}/activate`,
    token: tokenA
  });
  assert(onTeacher.status === 200 && onTeacher.json.teacher.active === true, "activate teacher");

  const stray = await request(server, {
    method: "POST",
    path: "/api/teachers",
    token: tokenA,
    body: { name: "Wrong Teacher", category: "REGULAR", alternateWeekSchedule: false }
  });
  const strayDel = await request(server, {
    method: "DELETE",
    path: `/api/teachers/${stray.json.teacher._id}`,
    token: tokenA
  });
  assert(strayDel.status === 200, "incorrect teacher without history can be deleted");

  const tt = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token: tokenA,
    body: {
      academicSessionId: a.session._id,
      name: "P12 TT",
      periodCount: 6,
      status: "ACTIVE"
    }
  });
  assert(tt.status === 201, "create timetable");
  const ttId = tt.json.timetable._id;

  const regular = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: {
      teacherId: a.rahul._id,
      subjectId: a.math._id,
      classId: a.class7._id,
      sectionId: a.secA._id,
      dayOfWeek: "WEDNESDAY",
      period: 2,
      weekPattern: "EVERY"
    }
  });
  assert(regular.status === 201 && regular.json.entry.weekPattern === "EVERY", "normal entry is every week");

  const combined = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: {
      teacherId: a.artTeacher._id,
      partnerTeacherId: a.musicTeacher._id,
      subjectId: a.art._id,
      partnerSubjectId: a.music._id,
      classId: a.class7._id,
      sectionIds: [a.secA._id, a.secB._id],
      dayOfWeek: "MONDAY",
      period: 1,
      alternateWeek: true,
      combinedLabel: "7AB"
    }
  });
  assert(combined.status === 201 && (combined.json.entries || []).length === 4, "alternate-week combined 7AB creates 4 entries");

  const oddArt = (combined.json.entries || []).find(
    (e) => e.weekPattern === "ODD" && String(e.sectionId) === String(a.secA._id)
  );
  const evenArt = (combined.json.entries || []).find(
    (e) => e.weekPattern === "EVEN" && String(e.sectionId) === String(a.secA._id)
  );
  assert(String(oddArt.teacherId) === String(a.artTeacher._id), "odd week 7A is Art");
  assert(String(evenArt.teacherId) === String(a.musicTeacher._id), "even week 7A is Music");

  assert(
    entryAppliesToWeek(oddArt, a.artTeacher, WEEK_PATTERN.ODD) &&
      !entryAppliesToWeek(oddArt, a.artTeacher, WEEK_PATTERN.EVEN),
    "alternate-week entry appears only in its week"
  );
  assert(
    entryAppliesToWeek(regular.json.entry, a.rahul, WEEK_PATTERN.ODD) &&
      entryAppliesToWeek(regular.json.entry, a.rahul, WEEK_PATTERN.EVEN),
    "regular teachers are unaffected by alternate-week filtering"
  );

  const neha = await Teacher.create({
    schoolId: a.school._id,
    name: "Neha",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [a.math._id],
    eligibleClassGroups: [a.group._id]
  });
  const nehaLesson = await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token: tokenA,
    body: {
      teacherId: neha._id,
      subjectId: a.math._id,
      classId: a.class7._id,
      sectionId: a.secB._id,
      dayOfWeek: "WEDNESDAY",
      period: 3
    }
  });
  assert(nehaLesson.status === 201, "second teacher period for swap");

  const preview = await request(server, {
    method: "POST",
    path: "/api/timetables/swaps/preview",
    token: tokenA,
    body: {
      teacherAId: a.rahul._id,
      teacherBId: neha._id,
      date: "2026-04-01",
      period: 2
    }
  });
  assert(preview.status === 200, "valid swap preview when B is free");
  const swapped = await request(server, {
    method: "POST",
    path: "/api/timetables/swaps",
    token: tokenA,
    body: {
      teacherAId: a.rahul._id,
      teacherBId: neha._id,
      date: "2026-04-01",
      period: 2
    }
  });
  assert(swapped.status === 201, "valid teacher period swap is saved");
  assert(await TimetableSwap.countDocuments({ schoolId: a.school._id }) === 1, "swap is recorded");

  const conflict = await request(server, {
    method: "POST",
    path: "/api/timetables/swaps",
    token: tokenA,
    body: {
      teacherAId: a.rahul._id,
      teacherBId: b.rahul._id,
      date: "2026-04-01",
      period: 2
    }
  });
  assert(conflict.status === 400, "swap with another school's teacher is rejected");

  const steal = await request(server, {
    method: "POST",
    path: "/api/timetables/swaps",
    token: tokenB,
    body: {
      teacherAId: a.rahul._id,
      teacherBId: a.artTeacher._id,
      date: "2026-04-01",
      period: 1
    }
  });
  assert(steal.status === 400 || steal.status === 404, "school B cannot swap school A teachers");

  const weekApi = await request(server, {
    method: "GET",
    path: "/api/timetables/week?date=2026-04-08",
    token: tokenA
  });
  assert(weekApi.status === 200 && weekApi.json.weekCount === 2 && weekApi.json.weekParity === "EVEN", "week API uses session start");

  const oddEntries = [oddArt, regular.json.entry].filter(Boolean);
  const result = generateAssignments({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    dateKey: "2026-04-01",
    dayOfWeek: "MONDAY",
    teachers: [a.artTeacher, a.musicTeacher, a.rahul],
    classesById: new Map([[String(a.class7._id), a.class7]]),
    statusByTeacherId: new Map([[String(a.artTeacher._id), "ABSENT"]]),
    timetableEntries: oddEntries.map((e) => ({
      ...e,
      schoolId: a.school._id,
      academicSessionId: a.session._id,
      teacherId: e.teacherId,
      classId: e.classId,
      sectionId: e.sectionId,
      subjectId: e.subjectId,
      period: e.period,
      active: true
    })),
    existingSubstitutions: []
  });
  const cover = result.assignments.find((row) => String(row.absentTeacherId) === String(a.artTeacher._id));
  assert(Boolean(cover), "substitution covers the odd-week art assignment");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[prompt12] all checks passed");
}

run().catch(async (err) => {
  console.error("[prompt12] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
