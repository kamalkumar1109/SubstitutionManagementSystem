process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_prompt17_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "prompt17-test-secret";
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
  Substitution
} = require("../models");
const { hashPassword } = require("../utils/password");
const { USER_ROLES, EMPLOYMENT_STATUS, DAILY_TEACHER_STATUS } = require("../config/constants");
const { todayDateKey, dayOfWeekFromDateKey } = require("../utils/dates");

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
    email: `${prefix}@school.test`,
    timezone: "Asia/Kolkata"
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

  const dateKey = todayDateKey("Asia/Kolkata");
  const dayOfWeek = dayOfWeekFromDateKey(dateKey, "Asia/Kolkata");
  const schoolDays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const staybackToday = schoolDays.includes(dayOfWeek) ? dayOfWeek : "MONDAY";

  const a = await seedSchool("P17A");
  const group = await ClassGroup.create({ schoolId: a.school._id, name: "6-8", sortOrder: 1 });
  const class8 = await Class.create({ schoolId: a.school._id, classGroupId: group._id, name: "Class 8" });
  const class9 = await Class.create({ schoolId: a.school._id, classGroupId: group._id, name: "Class 9" });
  const class4 = await Class.create({ schoolId: a.school._id, classGroupId: group._id, name: "Class 4" });
  const sec8a = await Section.create({ schoolId: a.school._id, classId: class8._id, name: "8A" });
  const sec9a = await Section.create({ schoolId: a.school._id, classId: class9._id, name: "9A" });
  const math = await Subject.create({ schoolId: a.school._id, name: "Mathematics" });
  const science = await Subject.create({ schoolId: a.school._id, name: "Science" });
  const anita = await Teacher.create({
    schoolId: a.school._id,
    name: "Anita",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [math._id],
    eligibleClassGroups: [group._id]
  });
  const bala = await Teacher.create({
    schoolId: a.school._id,
    name: "Bala",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [math._id, science._id],
    eligibleClassGroups: [group._id]
  });
  const chetan = await Teacher.create({
    schoolId: a.school._id,
    name: "Chetan",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [math._id],
    eligibleClassGroups: [group._id]
  });
  const diya = await Teacher.create({
    schoolId: a.school._id,
    name: "Diya",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [science._id],
    eligibleClassGroups: [group._id]
  });

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const tokenA = await login(server, a.admin.email);

  const fiveDay = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token: tokenA,
    body: {
      academicSessionId: a.session._id,
      name: "Five Day",
      periodCount: 8,
      periodStart: 1,
      weekDays: 5,
      status: "ACTIVE",
      firstHalfStart: 1,
      firstHalfEnd: 4,
      secondHalfStart: 5,
      secondHalfEnd: 8,
      staybackEnabled: false
    }
  });
  assert(fiveDay.status === 201, "create 5-day timetable");
  assert(fiveDay.json.timetable.staybackEnabled === false, "stayback defaults off");

  const overlap = await request(server, {
    method: "PATCH",
    path: `/api/timetables/${fiveDay.json.timetable._id}`,
    token: tokenA,
    body: {
      firstHalfStart: 1,
      firstHalfEnd: 5,
      secondHalfStart: 5,
      secondHalfEnd: 8,
      staybackEnabled: true,
      staybackDay: "WEDNESDAY",
      staybackFirstHalfStart: 1,
      staybackFirstHalfEnd: 5,
      staybackSecondHalfStart: 4,
      staybackSecondHalfEnd: 6
    }
  });
  assert(overlap.status === 200, "overlapping half-day ranges are allowed");
  assert(overlap.json.timetable.firstHalfEnd === 5 && overlap.json.timetable.secondHalfStart === 5, "regular overlap saved");
  assert(overlap.json.timetable.staybackSecondHalfStart === 4, "stayback overlap saved");

  const satOnFive = await request(server, {
    method: "PATCH",
    path: `/api/timetables/${fiveDay.json.timetable._id}`,
    token: tokenA,
    body: {
      staybackEnabled: true,
      staybackDay: "SATURDAY",
      staybackFirstHalfStart: 1,
      staybackFirstHalfEnd: 3,
      staybackSecondHalfStart: 4,
      staybackSecondHalfEnd: 6
    }
  });
  assert(satOnFive.status === 400, "Saturday cannot be stayback on a Monday-Friday timetable");

  const noDay = await request(server, {
    method: "PATCH",
    path: `/api/timetables/${fiveDay.json.timetable._id}`,
    token: tokenA,
    body: { staybackEnabled: true }
  });
  assert(noDay.status === 400, "stayback yes without a day is rejected");

  const sixDay = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token: tokenA,
    body: {
      academicSessionId: a.session._id,
      name: "Stayback Wing",
      periodCount: 8,
      periodStart: 1,
      weekDays: 6,
      status: "ACTIVE",
      firstHalfStart: 1,
      firstHalfEnd: 4,
      secondHalfStart: 5,
      secondHalfEnd: 8,
      staybackEnabled: true,
      staybackDay: staybackToday === "SUNDAY" ? "SATURDAY" : staybackToday,
      staybackFirstHalfStart: 1,
      staybackFirstHalfEnd: 3,
      staybackSecondHalfStart: 4,
      staybackSecondHalfEnd: 6,
      classIds: [class8._id]
    }
  });
  assert(sixDay.status === 201, "create 6-day stayback timetable");
  assert(sixDay.json.timetable.staybackEnabled === true, "stayback saved");
  assert(sixDay.json.timetable.staybackDay === (staybackToday === "SUNDAY" ? "SATURDAY" : staybackToday), "stayback day saved");
  const staybackId = sixDay.json.timetable._id;

  const zeroBased = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token: tokenA,
    body: {
      academicSessionId: a.session._id,
      name: "Zero Based",
      periodCount: 9,
      periodStart: 0,
      weekDays: 5,
      status: "ACTIVE",
      firstHalfStart: 0,
      firstHalfEnd: 4,
      secondHalfStart: 5,
      secondHalfEnd: 8,
      staybackEnabled: true,
      staybackDay: "WEDNESDAY",
      staybackFirstHalfStart: 0,
      staybackFirstHalfEnd: 3,
      staybackSecondHalfStart: 4,
      staybackSecondHalfEnd: 6
    }
  });
  assert(zeroBased.status === 201, "0-8 period stayback is accepted");
  assert(zeroBased.json.timetable.staybackFirstHalfStart === 0, "stayback can start at period 0");

  const otherTt = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token: tokenA,
    body: {
      academicSessionId: a.session._id,
      name: "Other Wing",
      periodCount: 8,
      periodStart: 1,
      weekDays: 6,
      status: "ACTIVE",
      firstHalfStart: 1,
      firstHalfEnd: 4,
      secondHalfStart: 5,
      secondHalfEnd: 8,
      classIds: [class9._id]
    }
  });
  assert(otherTt.status === 201, "create other timetable");
  const otherId = otherTt.json.timetable._id;

  for (const period of [1, 2, 3, 4, 5, 6]) {
    const created = await request(server, {
      method: "POST",
      path: `/api/timetables/${staybackId}/entries`,
      token: tokenA,
      body: {
        teacherId: anita._id,
        classId: class8._id,
        sectionId: sec8a._id,
        subjectId: math._id,
        dayOfWeek: staybackToday,
        period,
        comment: `P${period} chapter`
      }
    });
    assert(created.status === 201, `anita stayback period ${period}`);
    assert(created.json.entry.comment === `P${period} chapter`, "comment is persisted");
  }

  const meeting = await request(server, {
    method: "POST",
    path: `/api/timetables/${staybackId}/entries`,
    token: tokenA,
    body: {
      teacherId: bala._id,
      assignmentType: "MEETING",
      dayOfWeek: staybackToday,
      period: 7,
      comment: "Department meeting"
    }
  });
  assert(meeting.status === 201, "meeting lesson created");
  assert(meeting.json.entry.assignmentType === "MEETING", "meeting type stored");
  assert(!meeting.json.entry.classId, "meeting has no class");

  const activity = await request(server, {
    method: "POST",
    path: `/api/timetables/${staybackId}/entries`,
    token: tokenA,
    body: {
      teacherId: bala._id,
      assignmentType: "ACTIVITY",
      dayOfWeek: staybackToday,
      period: 8,
      comment: "Sports activity"
    }
  });
  assert(activity.status === 201, "activity without class is allowed");

  const otherLesson = await request(server, {
    method: "POST",
    path: `/api/timetables/${otherId}/entries`,
    token: tokenA,
    body: {
      teacherId: chetan._id,
      classId: class9._id,
      sectionId: sec9a._id,
      subjectId: math._id,
      dayOfWeek: staybackToday,
      period: 1
    }
  });
  assert(otherLesson.status === 201, "other timetable has its own teacher");

  const freeOnStayback = await request(server, {
    method: "POST",
    path: `/api/timetables/${staybackId}/entries`,
    token: tokenA,
    body: {
      teacherId: diya._id,
      classId: class8._id,
      sectionId: sec8a._id,
      subjectId: science._id,
      dayOfWeek: staybackToday === "TUESDAY" ? "WEDNESDAY" : "TUESDAY",
      period: 1
    }
  });
  assert(freeOnStayback.status === 201, "diya is on this timetable but free on stayback day period 1");

  const grid = await request(server, {
    method: "GET",
    path: `/api/timetables/${staybackId}/grid`,
    token: tokenA
  });
  assert(grid.status === 200, "grid loads");
  const usedNames = (grid.json.usedClasses || []).map((row) => row.name);
  assert(usedNames.includes("Class 8"), "grid class filter includes classes used on this timetable");
  assert(!usedNames.includes("Class 4"), "unused school class is omitted from grid class filter");
  assert(!usedNames.includes("Class 9"), "classes from another timetable are omitted");

  const unselected = await request(server, {
    method: "GET",
    path: "/api/substitutions/today",
    token: tokenA
  });
  assert(unselected.status === 200, "today board loads without a timetable");
  assert(!unselected.json.timetable, "board does not auto-select a timetable");
  assert((unselected.json.teachers || []).length === 0, "teachers are hidden until a timetable is selected");
  assert((unselected.json.timetables || []).length >= 3, "timetable list is still returned");

  const noGen = await request(server, {
    method: "POST",
    path: "/api/substitutions/generate",
    token: tokenA,
    body: {}
  });
  assert(noGen.status === 400, "generation is blocked without a timetable");

  if (schoolDays.includes(dayOfWeek)) {
    await request(server, {
      method: "POST",
      path: "/api/daily-status",
      token: tokenA,
      body: { teacherId: anita._id, status: DAILY_TEACHER_STATUS.FIRST_HALF_OFF }
    });
    const genFirst = await request(server, {
      method: "POST",
      path: "/api/substitutions/generate",
      token: tokenA,
      body: { timetableId: staybackId }
    });
    assert(genFirst.status === 201, "stayback first-half generation succeeds");
    const firstRows = await Substitution.find({
      schoolId: a.school._id,
      timetableId: staybackId,
      absentTeacherId: anita._id
    });
    assert(
      firstRows.length && firstRows.every((row) => Number(row.period) >= 1 && Number(row.period) <= 3),
      "1st half off on stayback day only covers stayback first-half periods"
    );

    await request(server, {
      method: "POST",
      path: "/api/daily-status",
      token: tokenA,
      body: { teacherId: anita._id, status: DAILY_TEACHER_STATUS.SECOND_HALF_OFF }
    });
    const genSecond = await request(server, {
      method: "POST",
      path: "/api/substitutions/generate",
      token: tokenA,
      body: { timetableId: staybackId }
    });
    assert(genSecond.status === 201, "stayback second-half generation succeeds");
    const secondRows = await Substitution.find({
      schoolId: a.school._id,
      timetableId: staybackId,
      absentTeacherId: anita._id
    });
    assert(
      secondRows.length && secondRows.every((row) => Number(row.period) >= 4 && Number(row.period) <= 6),
      "2nd half off on stayback day only covers stayback second-half periods"
    );

    await request(server, {
      method: "POST",
      path: "/api/daily-status",
      token: tokenA,
      body: { teacherId: bala._id, status: DAILY_TEACHER_STATUS.ABSENT }
    });
    const genMeeting = await request(server, {
      method: "POST",
      path: "/api/substitutions/generate",
      token: tokenA,
      body: { timetableId: staybackId }
    });
    assert(genMeeting.status === 201, "meeting/activity generation succeeds");
    const meetingRow = (genMeeting.json.substitutions || []).find(
      (row) => Number(row.period) === 7 && String(row.absentTeacherId) === String(bala._id)
    );
    assert(!meetingRow, "meeting period does not appear on the substitution board");
    const meetingStored = await Substitution.findOne({
      schoolId: a.school._id,
      timetableId: staybackId,
      absentTeacherId: bala._id,
      period: 7
    });
    assert(!meetingStored, "no substitution record is created for a meeting");

    const activityRow = (genMeeting.json.substitutions || []).find(
      (row) => Number(row.period) === 8 && String(row.absentTeacherId) === String(bala._id)
    );
    assert(activityRow, "activity is eligible for substitution");
    assert(activityRow.informational !== true, "activity is a normal substitution slot");
  }

  const staybackBoard = await request(server, {
    method: "GET",
    path: `/api/substitutions/today?timetableId=${staybackId}`,
    token: tokenA
  });
  assert(staybackBoard.status === 200, "selected timetable board loads");
  const staybackNames = (staybackBoard.json.teachers || []).map((row) => row.teacher.name);
  assert(staybackNames.includes("Anita"), "selected timetable teachers are listed");
  assert(staybackNames.includes("Bala"), "teachers used by the selected timetable are listed");
  assert(!staybackNames.includes("Chetan"), "teachers from another timetable are omitted");

  const otherBoard = await request(server, {
    method: "GET",
    path: `/api/substitutions/today?timetableId=${otherId}`,
    token: tokenA
  });
  const otherNames = (otherBoard.json.teachers || []).map((row) => row.teacher.name);
  assert(otherNames.includes("Chetan"), "switching timetable shows that timetable's teachers");
  assert(!otherNames.includes("Anita"), "previous timetable teachers are not mixed in");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[prompt17] all checks passed");
}

run().catch(async (err) => {
  console.error("[prompt17] failed:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
