process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_prompt14_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "prompt14-test-secret";
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
  TimetableEntry,
  Substitution
} = require("../models");
const { hashPassword } = require("../utils/password");
const { USER_ROLES, EMPLOYMENT_STATUS } = require("../config/constants");
const { periodNumbers, gridDaysOf } = require("../services/timetableValidationService");

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
  const class8 = await Class.create({ schoolId: school._id, classGroupId: group._id, name: "Class 8" });
  const secA = await Section.create({ schoolId: school._id, classId: class7._id, name: "7A" });
  const secB = await Section.create({ schoolId: school._id, classId: class7._id, name: "7B" });
  const sec8a = await Section.create({ schoolId: school._id, classId: class8._id, name: "8A" });
  const math = await Subject.create({ schoolId: school._id, name: "Mathematics" });
  const eng = await Subject.create({ schoolId: school._id, name: "English" });
  const sci = await Subject.create({ schoolId: school._id, name: "Science" });
  const hist = await Subject.create({ schoolId: school._id, name: "History" });
  const teachers = {};
  for (const [key, name, subject] of [
    ["a", "Anita", math],
    ["b", "Bala", eng],
    ["c", "Chetan", sci],
    ["d", "Diya", hist]
  ]) {
    teachers[key] = await Teacher.create({
      schoolId: school._id,
      name,
      employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
      subjects: [subject._id],
      eligibleClassGroups: [group._id]
    });
  }
  return { school, admin, session, class7, class8, secA, secB, sec8a, math, eng, sci, hist, ...teachers };
}

async function run() {
  await connectDb();
  await mongoose.connection.dropDatabase();
  const a = await seedSchool("P14A");

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const login = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: a.admin.email, password: "password123", expectedRole: USER_ROLES.SCHOOL_ADMIN }
  });
  assert(login.status === 200, "login");
  const token = login.json.token;

  const tt = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token,
    body: {
      academicSessionId: a.session._id,
      name: "P14 TT",
      periodCount: 9,
      periodStart: 0,
      weekDays: 6,
      status: "ACTIVE"
    }
  });
  assert(tt.status === 201, "create 9-period timetable starting at 0");
  const ttId = tt.json.timetable._id;
  assert(
    JSON.stringify(periodNumbers(tt.json.timetable)) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8]),
    "period 0 through 8"
  );

  const grid = await request(server, { method: "GET", path: `/api/timetables/${ttId}/grid`, token });
  assert(JSON.stringify(grid.json.periods) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8]), "grid uses 0-8");
  assert(grid.json.days.includes("SATURDAY") && grid.json.days.length === 6, "6-day grid includes Saturday");

  const week = await request(server, { method: "GET", path: "/api/timetables/week?date=2026-04-01", token });
  assert(JSON.stringify(week.json.periods) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8]), "swap week API uses 0-8");

  await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token,
    body: {
      teacherId: a.a._id,
      classId: a.class7._id,
      sectionId: a.secA._id,
      dayOfWeek: "WEDNESDAY",
      period: 2
    }
  });
  await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token,
    body: {
      teacherId: a.b._id,
      classId: a.class7._id,
      sectionId: a.secB._id,
      dayOfWeek: "WEDNESDAY",
      period: 2
    }
  });
  await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token,
    body: {
      teacherId: a.c._id,
      classId: a.class8._id,
      sectionId: a.sec8a._id,
      dayOfWeek: "WEDNESDAY",
      period: 3
    }
  });
  await request(server, {
    method: "POST",
    path: `/api/timetables/${ttId}/entries`,
    token,
    body: {
      teacherId: a.d._id,
      classId: a.class7._id,
      sectionId: a.secA._id,
      dayOfWeek: "WEDNESDAY",
      period: 3
    }
  });

  const swap1 = await request(server, {
    method: "POST",
    path: "/api/timetables/swaps",
    token,
    body: { teacherAId: a.a._id, teacherBId: a.b._id, date: "2026-04-01", period: 2 }
  });
  assert(swap1.status === 201, "first swap saved");
  const swap2 = await request(server, {
    method: "POST",
    path: "/api/timetables/swaps",
    token,
    body: { teacherAId: a.c._id, teacherBId: a.d._id, date: "2026-04-01", period: 3 }
  });
  assert(swap2.status === 201, "second swap same day saved");

  const listed = await request(server, {
    method: "GET",
    path: "/api/substitutions?date=2026-04-01",
    token
  });
  const swaps = (listed.json.substitutions || []).filter((row) => row.source === "SWAP");
  assert(swaps.length >= 3, "multiple swap substitution rows are kept");
  assert(swaps.every((row) => row.statusLabel === "Swap"), "swap rows are labelled SWAP");
  assert(
    swaps.some((row) => String(row.finalSubstituteName).startsWith("SWAP ")),
    "swap substitute names are marked SWAP for the sheet/PDF"
  );

  const same = await request(server, {
    method: "POST",
    path: "/api/timetables/swaps/preview",
    token,
    body: { teacherAId: a.a._id, teacherBId: a.a._id, date: "2026-04-01", period: 2 }
  });
  assert(same.status === 400, "same teacher cannot be swapped with themselves");

  const five = await request(server, {
    method: "PATCH",
    path: `/api/timetables/${ttId}`,
    token,
    body: { weekDays: 5 }
  });
  assert(five.status === 200 && five.json.timetable.weekDays === 5, "switch to 5-day week");
  const grid5 = await request(server, { method: "GET", path: `/api/timetables/${ttId}/grid`, token });
  assert(!grid5.json.days.includes("SATURDAY") && grid5.json.days.length === 5, "5-day grid hides Saturday");
  assert(gridDaysOf(grid5.json.timetable).join() === "MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY", "gridDays helper");

  const sat = await request(server, {
    method: "POST",
    path: "/api/timetables/swaps/preview",
    token,
    body: { teacherAId: a.a._id, teacherBId: a.b._id, date: "2026-04-04", period: 2 }
  });
  assert(sat.status === 400, "Saturday swap rejected on a 5-day timetable");

  const after = await TimetableEntry.countDocuments({ timetableId: ttId });
  assert(after === 4, "swaps did not rewrite master timetable entries");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[prompt14] all checks passed");
}

run().catch(async (err) => {
  console.error("[prompt14] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
