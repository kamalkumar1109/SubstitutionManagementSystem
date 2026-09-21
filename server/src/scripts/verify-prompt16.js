process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_prompt16_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "prompt16-test-secret";
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

  const a = await seedSchool("P16A");
  const b = await seedSchool("P16B");
  const junior = await ClassGroup.create({ schoolId: a.school._id, name: "6-8", sortOrder: 1 });
  const senior = await ClassGroup.create({ schoolId: a.school._id, name: "9-12", sortOrder: 2 });
  const class8 = await Class.create({
    schoolId: a.school._id,
    classGroupId: junior._id,
    name: "Class 8"
  });
  const class11 = await Class.create({
    schoolId: a.school._id,
    classGroupId: senior._id,
    name: "Class 11"
  });
  const sec8a = await Section.create({ schoolId: a.school._id, classId: class8._id, name: "8A" });
  const sec8b = await Section.create({ schoolId: a.school._id, classId: class8._id, name: "8B" });
  const sec11a = await Section.create({ schoolId: a.school._id, classId: class11._id, name: "11A" });
  const math = await Subject.create({ schoolId: a.school._id, name: "Mathematics" });
  const anita = await Teacher.create({
    schoolId: a.school._id,
    name: "Anita",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [math._id],
    eligibleClassGroups: [junior._id]
  });
  const bala = await Teacher.create({
    schoolId: a.school._id,
    name: "Bala",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [math._id],
    eligibleClassGroups: [junior._id]
  });
  const chetan = await Teacher.create({
    schoolId: a.school._id,
    name: "Chetan",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [math._id],
    eligibleClassGroups: [senior._id]
  });
  const diya = await Teacher.create({
    schoolId: a.school._id,
    name: "Diya",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [math._id],
    eligibleClassGroups: [junior._id]
  });
  const esha = await Teacher.create({
    schoolId: a.school._id,
    name: "Esha",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [math._id],
    eligibleClassGroups: [senior._id]
  });
  const farid = await Teacher.create({
    schoolId: a.school._id,
    name: "Farid",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [math._id],
    eligibleClassGroups: [senior._id]
  });

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const tokenA = await login(server, a.admin.email);
  const tokenB = await login(server, b.admin.email);

  const publicPost = await request(server, {
    method: "PUT",
    path: "/api/reviews/mine",
    body: { rating: 5, reviewMessage: "Great product" }
  });
  assert(publicPost.status === 401, "public review submission is rejected");

  const emptyReview = await request(server, {
    method: "PUT",
    path: "/api/reviews/mine",
    token: tokenA,
    body: { rating: 5, reviewMessage: "   " }
  });
  assert(emptyReview.status === 400, "empty review message is rejected");

  const badRating = await request(server, {
    method: "PUT",
    path: "/api/reviews/mine",
    token: tokenA,
    body: { rating: 9, reviewMessage: "Too high" }
  });
  assert(badRating.status === 400, "rating above 5 is rejected");

  const saveA = await request(server, {
    method: "PUT",
    path: "/api/reviews/mine",
    token: tokenA,
    body: { rating: 5, reviewMessage: "Substitutions are faster in the morning." }
  });
  assert(saveA.status === 200, "school A can publish a review");

  const saveB = await request(server, {
    method: "PUT",
    path: "/api/reviews/mine",
    token: tokenB,
    body: { rating: 4, reviewMessage: "Clear substitution table." }
  });
  assert(saveB.status === 200, "school B can publish its own review");

  const mineB = await request(server, { method: "GET", path: "/api/reviews/mine", token: tokenB });
  assert(mineB.json.review.reviewMessage === "Clear substitution table.", "school B only sees its review");

  const published = await request(server, { method: "GET", path: "/api/reviews/public" });
  assert(published.status === 200 && published.json.reviews.length >= 2, "public list returns published reviews");
  assert(
    published.json.reviews.every((row) => !row.schoolId && !row.passwordHash),
    "public reviews omit internal ids"
  );

  const ttJunior = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token: tokenA,
    body: {
      academicSessionId: a.session._id,
      name: "Junior Wing",
      periodCount: 8,
      periodStart: 1,
      weekDays: 6,
      status: "ACTIVE",
      firstHalfStart: 1,
      firstHalfEnd: 4,
      secondHalfStart: 5,
      secondHalfEnd: 8,
      classIds: [class8._id],
      roundDuties: [{ label: "Senior Block" }, { label: "Primary Area" }]
    }
  });
  assert(ttJunior.status === 201, "create junior timetable");
  const juniorId = ttJunior.json.timetable._id;

  const ttSenior = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token: tokenA,
    body: {
      academicSessionId: a.session._id,
      name: "Senior Wing",
      periodCount: 8,
      periodStart: 1,
      weekDays: 6,
      status: "ACTIVE",
      firstHalfStart: 1,
      firstHalfEnd: 4,
      secondHalfStart: 5,
      secondHalfEnd: 8,
      classIds: [class11._id]
    }
  });
  assert(ttSenior.status === 201, "create second active timetable");
  const seniorId = ttSenior.json.timetable._id;
  assert(ttSenior.json.timetable.status === "ACTIVE", "second timetable stays active");
  await Teacher.updateMany(
    { _id: { $in: [anita._id, bala._id, diya._id] } },
    { $set: { homeWingTimetableId: juniorId } }
  );
  await Teacher.updateMany(
    { _id: { $in: [chetan._id, esha._id, farid._id] } },
    { $set: { homeWingTimetableId: seniorId } }
  );

  const listed = await request(server, {
    method: "GET",
    path: `/api/timetables?academicSessionId=${a.session._id}`,
    token: tokenA
  });
  const active = (listed.json.timetables || []).filter((tt) => tt.status === "ACTIVE");
  assert(active.length >= 2, "multiple active timetables can exist");

  for (const period of [1, 2, 3, 4, 5, 6]) {
    const created = await request(server, {
      method: "POST",
      path: `/api/timetables/${juniorId}/entries`,
      token: tokenA,
      body: {
        teacherId: anita._id,
        classId: class8._id,
        sectionId: sec8a._id,
        subjectId: math._id,
        dayOfWeek,
        period
      }
    });
    assert(created.status === 201, `anita period ${period}`);
  }
  const diyaLesson = await request(server, {
    method: "POST",
    path: `/api/timetables/${juniorId}/entries`,
    token: tokenA,
    body: {
      teacherId: diya._id,
      classId: class8._id,
      sectionId: sec8b._id,
      subjectId: math._id,
      dayOfWeek,
      period: 3
    }
  });
  assert(diyaLesson.status === 201, "diya busy in period 3");

  const otherDay = dayOfWeek === "TUESDAY" ? "WEDNESDAY" : "TUESDAY";
  for (const [teacher, period] of [
    [chetan, 1],
    [esha, 2],
    [farid, 3]
  ]) {
    const placed = await request(server, {
      method: "POST",
      path: `/api/timetables/${juniorId}/entries`,
      token: tokenA,
      body: {
        teacherId: teacher._id,
        assignmentType: "MEETING",
        dayOfWeek: otherDay,
        period,
        comment: "Staff meeting"
      }
    });
    assert(placed.status === 201, `${teacher.name} belongs to junior timetable without a junior class group`);
  }

  const seniorLesson = await request(server, {
    method: "POST",
    path: `/api/timetables/${seniorId}/entries`,
    token: tokenA,
    body: {
      teacherId: chetan._id,
      classId: class11._id,
      sectionId: sec11a._id,
      subjectId: math._id,
      dayOfWeek,
      period: 2
    }
  });
  assert(seniorLesson.status === 201, "senior timetable has its own lesson");

  await request(server, {
    method: "POST",
    path: "/api/daily-status",
    token: tokenA,
    body: { teacherId: anita._id, status: DAILY_TEACHER_STATUS.FIRST_HALF_OFF }
  });

  const gen1 = await request(server, {
    method: "POST",
    path: "/api/substitutions/generate",
    token: tokenA,
    body: { timetableId: juniorId }
  });
  assert(gen1.status === 201, "first generation succeeds");
  const firstRows = await Substitution.find({
    schoolId: a.school._id,
    timetableId: juniorId,
    absentTeacherId: anita._id
  });
  assert(
    firstRows.every((row) => Number(row.period) <= 4),
    "1st half off only covers first-half periods"
  );
  assert(firstRows.length >= 4, "first-half classes were substituted");
  const firstIds = firstRows.map((row) => String(row._id)).sort();
  const firstSubs = Object.fromEntries(
    firstRows.map((row) => [row.period, String(row.substituteTeacherId || "")])
  );

  await request(server, {
    method: "POST",
    path: "/api/daily-status",
    token: tokenA,
    body: { teacherId: anita._id, status: DAILY_TEACHER_STATUS.ABSENT }
  });
  const gen2 = await request(server, {
    method: "POST",
    path: "/api/substitutions/generate",
    token: tokenA,
    body: { timetableId: juniorId }
  });
  assert(gen2.status === 201, "merge generation succeeds");
  const merged = await Substitution.find({
    schoolId: a.school._id,
    timetableId: juniorId,
    absentTeacherId: anita._id
  });
  const stillFirst = merged.filter((row) => Number(row.period) <= 4);
  assert(
    stillFirst.map((row) => String(row._id)).sort().join(",") === firstIds.join(","),
    "existing first-half substitution records are preserved"
  );
  stillFirst.forEach((row) => {
    assert(String(row.substituteTeacherId || "") === firstSubs[row.period], "first-half substitutes unchanged");
  });
  assert(
    merged.some((row) => Number(row.period) >= 5),
    "second-half classes are added after changing to absent"
  );

  const seniorBoard = await request(server, {
    method: "GET",
    path: `/api/substitutions/today?timetableId=${seniorId}`,
    token: tokenA
  });
  assert(
    !(seniorBoard.json.substitutions || []).some((row) => String(row.absentTeacherId) === String(anita._id)),
    "junior substitutions do not leak into the senior timetable"
  );
  assert(
    (seniorBoard.json.roundDuties || []).length === 0,
    "senior timetable has no forced floor rows"
  );

  const juniorBoard = await request(server, {
    method: "GET",
    path: `/api/substitutions/today?timetableId=${juniorId}`,
    token: tokenA
  });
  assert(
    (juniorBoard.json.roundDuties || []).some((row) => row.label === "Senior Block") &&
      (juniorBoard.json.roundDuties || []).some((row) => row.label === "Primary Area"),
    "configured round duty areas appear on the junior board"
  );
  const periodOneDuty = (juniorBoard.json.roundDuties || []).map(
    (row) => row.byPeriod?.[1] || row.byPeriod?.["1"]
  );
  const assignedDuty = periodOneDuty.filter((name) => name && name !== "UNASSIGNED");
  assert(new Set(assignedDuty).size === assignedDuty.length, "round duty areas do not share a teacher in the same period");
  assert(juniorBoard.json.periodCount === 8 && juniorBoard.json.periodStart === 1, "configured period shape is returned");

  const p3 = merged.find((row) => Number(row.period) === 3 && String(row.absentTeacherId) === String(anita._id));
  assert(p3, "period 3 substitution exists for override");
  const cands = await request(server, {
    method: "GET",
    path: `/api/substitutions/${p3._id}/candidates`,
    token: tokenA
  });
  const candIds = (cands.json.candidates || []).map((t) => String(t._id));
  assert(
    candIds.includes(String(chetan._id)) || candIds.includes(String(esha._id)) || candIds.includes(String(farid._id)),
    "override can select a free teacher from this timetable outside the class group"
  );
  assert(!candIds.includes(String(diya._id)), "override does not list a busy teacher");
  assert(!candIds.includes(String(anita._id)), "absent teacher is not an override candidate");

  const busyOverride = await request(server, {
    method: "POST",
    path: `/api/substitutions/${p3._id}/override`,
    token: tokenA,
    body: { substituteTeacherId: diya._id }
  });
  assert(busyOverride.status === 400, "backend rejects a busy override");

  const outsider = (cands.json.candidates || []).find((t) =>
    [chetan._id, esha._id, farid._id].map(String).includes(String(t._id))
  );
  const okOverride = await request(server, {
    method: "POST",
    path: `/api/substitutions/${p3._id}/override`,
    token: tokenA,
    body: { substituteTeacherId: outsider._id, reason: "manual" }
  });
  assert(okOverride.status === 200, "override of a free out-of-group teacher is saved");

  const swap = await request(server, {
    method: "POST",
    path: "/api/timetables/swaps",
    token: tokenA,
    body: {
      date: dateKey,
      period: 6,
      classId: class8._id,
      sectionId: sec8a._id,
      replacementTeacherId: chetan._id,
      timetableId: juniorId
    }
  });
  assert(swap.status === 201, "class-based swap is saved");
  const afterSwap = await Substitution.find({
    schoolId: a.school._id,
    timetableId: juniorId,
    period: 3,
    source: "MANUAL"
  });
  assert(afterSwap.length >= 1, "generate-then-swap preserves the manual override");
  const swapRow = await Substitution.findOne({
    schoolId: a.school._id,
    timetableId: juniorId,
    period: 6,
    source: "SWAP"
  });
  assert(swapRow, "swap is represented on the substitution chart");
  assert(String(swapRow.substituteTeacherId) === String(chetan._id), "replacement teacher covers the swapped class");

  const gen3 = await request(server, {
    method: "POST",
    path: "/api/substitutions/generate",
    token: tokenA,
    body: { timetableId: juniorId }
  });
  assert(gen3.status === 201, "generation after swap succeeds");
  const overrideStill = await Substitution.findById(p3._id);
  assert(overrideStill && overrideStill.status === "OVERRIDDEN", "manual override survives regeneration");

  const history = await request(server, { method: "GET", path: "/api/audit-logs", token: tokenA });
  assert(history.status === 200 && (history.json.logs || []).length > 0, "history is available");
  const oneId = history.json.logs[0]._id;
  const delOne = await request(server, {
    method: "DELETE",
    path: `/api/audit-logs/${oneId}`,
    token: tokenA
  });
  assert(delOne.status === 200, "individual history can be deleted");
  const clear = await request(server, { method: "DELETE", path: "/api/audit-logs", token: tokenA });
  assert(clear.status === 200, "history can be cleared");

  const otherReview = await request(server, {
    method: "DELETE",
    path: "/api/reviews/mine",
    token: tokenB
  });
  assert(otherReview.status === 200, "school B deletes only its review");
  const stillA = await request(server, { method: "GET", path: "/api/reviews/mine", token: tokenA });
  assert(stillA.json.review, "school A review is untouched");

  const owner = await User.create({
    name: "Owner",
    email: `owner-${Date.now()}@sms.test`,
    passwordHash: await hashPassword("password123"),
    role: USER_ROLES.SUPER_ADMIN
  });
  const tokenOwner = await request(server, {
    method: "POST",
    path: "/api/auth/login",
    body: { loginId: owner.email, password: "password123", expectedRole: USER_ROLES.SUPER_ADMIN }
  });
  assert(tokenOwner.status === 200, "super admin login");
  const adminReviews = await request(server, {
    method: "GET",
    path: "/api/admin/reviews",
    token: tokenOwner.json.token
  });
  assert(adminReviews.status === 200 && (adminReviews.json.reviews || []).length >= 1, "super admin can list reviews");
  const aReview = (adminReviews.json.reviews || []).find((row) => row.reviewMessage.includes("Substitutions are faster"));
  assert(aReview, "school A review is visible to super admin");
  const hidden = await request(server, {
    method: "PATCH",
    path: `/api/admin/reviews/${aReview._id}`,
    token: tokenOwner.json.token,
    body: { published: false }
  });
  assert(hidden.status === 200 && hidden.json.review.published === false, "super admin can hide a review");
  const publicAfter = await request(server, { method: "GET", path: "/api/reviews/public" });
  assert(
    !(publicAfter.json.reviews || []).some((row) => row.reviewMessage.includes("Substitutions are faster")),
    "hidden reviews do not appear on the public list"
  );

  server.close();
  await disconnectDb();
  console.log("verify-prompt16: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
