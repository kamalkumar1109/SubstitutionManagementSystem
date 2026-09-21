process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_substitution_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "substitution-test-secret";
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
  Timetable,
  TimetableEntry,
  DailyTeacherStatus,
  Substitution,
  SubstitutionRun,
  AuditLog
} = require("../models");
const { hashPassword } = require("../utils/password");
const {
  USER_ROLES,
  TIMETABLE_STATUS,
  DAILY_TEACHER_STATUS,
  DAYS_OF_WEEK,
  SUBSTITUTION_STATUS,
  EMPLOYMENT_STATUS,
  AUDIT_ACTIONS
} = require("../config/constants");
const { generateAssignments, NO_SUBSTITUTE_REASON } = require("../services/substitutionEngine");
const { buildFinalSheetRows } = require("../services/pdf/substitutionSheetLayout");
const { buildSubstitutionPdfBuffer } = require("../services/pdf/substitutionPdfService");
const { todayDateKey, dayOfWeekFromDateKey } = require("../utils/dates");

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

  const gLow = await ClassGroup.create({ schoolId: school._id, name: "1-2", sortOrder: 1 });
  const gMid = await ClassGroup.create({ schoolId: school._id, name: "6-8", sortOrder: 3 });
  const class1 = await Class.create({ schoolId: school._id, classGroupId: gLow._id, name: "Class 1" });
  const class7 = await Class.create({ schoolId: school._id, classGroupId: gMid._id, name: "Class 7" });
  const class8 = await Class.create({ schoolId: school._id, classGroupId: gMid._id, name: "Class 8" });
  const sec1 = await Section.create({ schoolId: school._id, classId: class1._id, name: "1A" });
  const sec7a = await Section.create({ schoolId: school._id, classId: class7._id, name: "7A" });
  const sec7b = await Section.create({ schoolId: school._id, classId: class7._id, name: "7B" });
  const sec8b = await Section.create({ schoolId: school._id, classId: class8._id, name: "8B" });
  const math = await Subject.create({ schoolId: school._id, name: "Mathematics" });
  const science = await Subject.create({ schoolId: school._id, name: "Science" });
  const sports = await Subject.create({ schoolId: school._id, name: "Sports" });
  const english = await Subject.create({ schoolId: school._id, name: "English" });

  const timetable = await Timetable.create({
    schoolId: school._id,
    academicSessionId: session._id,
    name: "Main",
    status: TIMETABLE_STATUS.ACTIVE,
    version: 1
  });

  return {
    school,
    admin,
    session,
    gLow,
    gMid,
    class1,
    class7,
    class8,
    sec1,
    sec7a,
    sec7b,
    sec8b,
    math,
    science,
    sports,
    english,
    timetable
  };
}

async function addEntry(bundle, slot) {
  return TimetableEntry.create({
    timetableId: slot.timetableId || bundle.timetable._id,
    schoolId: bundle.school._id,
    academicSessionId: bundle.session._id,
    dayOfWeek: slot.dayOfWeek || "TUESDAY",
    period: slot.period,
    teacherId: slot.teacherId,
    subjectId: slot.subjectId,
    classId: slot.classId,
    sectionId: slot.sectionId,
    active: true
  });
}

function runEngine({ bundle, teachers, statusByTeacherId, dayOfWeek = "TUESDAY" }) {
  const classesById = new Map([
    [String(bundle.class1._id), bundle.class1],
    [String(bundle.class7._id), bundle.class7],
    [String(bundle.class8._id), bundle.class8]
  ]);
  return generateAssignments({
    schoolId: bundle.school._id,
    academicSessionId: bundle.session._id,
    dateKey: "2026-09-01",
    dayOfWeek,
    teachers,
    classesById,
    statusByTeacherId,
    timetableEntries: bundle.entries,
    existingSubstitutions: []
  });
}

async function run() {
  await connectDb();
  await mongoose.connection.dropDatabase();

  const a = await seedSchool("A");
  const b = await seedSchool("B");

  const rahul = await Teacher.create({
    schoolId: a.school._id,
    name: "Rahul",
    subjects: [a.math._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: a.timetable._id
  });
  const amit = await Teacher.create({
    schoolId: a.school._id,
    name: "Amit",
    subjects: [a.math._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: a.timetable._id
  });
  const kiran = await Teacher.create({
    schoolId: a.school._id,
    name: "Kiran",
    subjects: [a.science._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: a.timetable._id
  });
  const primaryOnly = await Teacher.create({
    schoolId: a.school._id,
    name: "Primary Only",
    subjects: [a.math._id],
    eligibleClassGroups: [a.gLow._id],
    homeWingTimetableId: a.timetable._id
  });
  const sportsLow = await Teacher.create({
    schoolId: a.school._id,
    name: "Sports Low",
    designation: "Sports Teacher",
    subjects: [a.sports._id],
    eligibleClassGroups: [a.gLow._id],
    homeWingTimetableId: a.timetable._id
  });
  const sportsMid = await Teacher.create({
    schoolId: a.school._id,
    name: "Sports Mid",
    designation: "Sports Teacher",
    subjects: [a.sports._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: a.timetable._id
  });
  const occupied = await Teacher.create({
    schoolId: a.school._id,
    name: "Occupied Maya",
    subjects: [a.english._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: a.timetable._id
  });
  const onDuty = await Teacher.create({
    schoolId: a.school._id,
    name: "Duty Desk",
    subjects: [a.english._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: a.timetable._id
  });
  const inactive = await Teacher.create({
    schoolId: a.school._id,
    name: "Resigned",
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: a.timetable._id,
    active: false,
    employmentStatus: EMPLOYMENT_STATUS.RESIGNED
  });
  const otherSchool = await Teacher.create({
    schoolId: b.school._id,
    name: "Other School",
    eligibleClassGroups: [b.gMid._id],
    homeWingTimetableId: b.timetable._id
  });

  a.entries = [
    await addEntry(a, {
      period: 1,
      teacherId: rahul._id,
      subjectId: a.math._id,
      classId: a.class7._id,
      sectionId: a.sec7a._id
    }),
    await addEntry(a, {
      period: 2,
      teacherId: rahul._id,
      subjectId: a.science._id,
      classId: a.class8._id,
      sectionId: a.sec8b._id
    }),
    await addEntry(a, {
      period: 1,
      teacherId: occupied._id,
      subjectId: a.english._id,
      classId: a.class7._id,
      sectionId: a.sec7b._id
    }),
    await addEntry(a, {
      period: 3,
      teacherId: sportsMid._id,
      subjectId: a.sports._id,
      classId: a.class7._id,
      sectionId: a.sec7a._id
    }),
    await addEntry(a, {
      period: 4,
      teacherId: amit._id,
      subjectId: a.math._id,
      classId: a.class7._id,
      sectionId: a.sec7a._id,
      dayOfWeek: "FRIDAY"
    }),
    await addEntry(a, {
      period: 5,
      teacherId: kiran._id,
      subjectId: a.science._id,
      classId: a.class8._id,
      sectionId: a.sec8b._id,
      dayOfWeek: "FRIDAY"
    })
  ];

  const present = (ids) => {
    const map = new Map();
    for (const t of ids) map.set(String(t._id), DAILY_TEACHER_STATUS.PRESENT);
    return map;
  };

  const oneAbsent = runEngine({
    bundle: a,
    teachers: [rahul, amit, primaryOnly, otherSchool, inactive],
    statusByTeacherId: new Map([
      ...present([amit, primaryOnly, otherSchool, inactive]),
      [String(rahul._id), DAILY_TEACHER_STATUS.ABSENT]
    ])
  });
  assert(oneAbsent.assignments.length === 2, "one absent teacher covers both periods");
  assert(
    oneAbsent.assignments.every((row) => String(row.substituteTeacherId) === String(amit._id)),
    "only eligible present teacher in 6-8 is assigned"
  );
  assert(
    oneAbsent.assignments.every((row) => String(row.substituteTeacherId) !== String(primaryOnly._id)),
    "class-group mismatch is rejected"
  );
  assert(
    oneAbsent.assignments.every((row) => String(row.substituteTeacherId) !== String(otherSchool._id)),
    "other school teacher is never assigned"
  );
  assert(
    oneAbsent.assignments.every((row) => String(row.substituteTeacherId) !== String(inactive._id)),
    "inactive/resigned teacher is never assigned"
  );

  const multiAbsent = runEngine({
    bundle: a,
    teachers: [rahul, occupied, amit, kiran],
    statusByTeacherId: new Map([
      [String(rahul._id), DAILY_TEACHER_STATUS.ABSENT],
      [String(occupied._id), DAILY_TEACHER_STATUS.ABSENT],
      [String(amit._id), DAILY_TEACHER_STATUS.PRESENT],
      [String(kiran._id), DAILY_TEACHER_STATUS.PRESENT]
    ])
  });
  const period1 = multiAbsent.assignments.filter((row) => row.period === 1);
  assert(period1.length === 2, "two absences in the same period create two rows");
  const subsP1 = period1.map((row) => String(row.substituteTeacherId)).sort();
  assert(new Set(subsP1).size === 2, "two substitutions in the same period use different teachers");

  const duty = runEngine({
    bundle: a,
    teachers: [rahul, amit, onDuty],
    statusByTeacherId: new Map([
      [String(rahul._id), DAILY_TEACHER_STATUS.ABSENT],
      [String(amit._id), DAILY_TEACHER_STATUS.PRESENT],
      [String(onDuty._id), DAILY_TEACHER_STATUS.ON_DUTY]
    ])
  });
  assert(
    duty.assignments.every((row) => String(row.substituteTeacherId) === String(amit._id)),
    "on-duty teacher is excluded from substituting"
  );

  const busy = runEngine({
    bundle: a,
    teachers: [rahul, occupied, primaryOnly],
    statusByTeacherId: new Map([
      [String(rahul._id), DAILY_TEACHER_STATUS.ABSENT],
      [String(occupied._id), DAILY_TEACHER_STATUS.PRESENT],
      [String(primaryOnly._id), DAILY_TEACHER_STATUS.PRESENT]
    ])
  });
  const p1Busy = busy.assignments.find((row) => row.period === 1);
  assert(p1Busy.status === SUBSTITUTION_STATUS.UNASSIGNED, "occupied teacher cannot take period 1");
  assert(p1Busy.reason === NO_SUBSTITUTE_REASON, "unassigned uses the public reason");
  assert(!p1Busy.substituteTeacherId, "no invalid teacher is assigned");

  const sportsCase = runEngine({
    bundle: a,
    teachers: [sportsMid, sportsLow, amit],
    statusByTeacherId: new Map([
      [String(sportsMid._id), DAILY_TEACHER_STATUS.ABSENT],
      [String(sportsLow._id), DAILY_TEACHER_STATUS.PRESENT],
      [String(amit._id), DAILY_TEACHER_STATUS.PRESENT]
    ])
  });
  const sportsRow = sportsCase.assignments.find((row) => row.period === 3);
  assert(sportsRow, "sports period is generated");
  assert(
    String(sportsRow.substituteTeacherId) === String(amit._id),
    "sports designation is not a free pass; eligibility still applies"
  );
  assert(String(sportsRow.substituteTeacherId) !== String(sportsLow._id), "sports teacher limited to 1-2 cannot cover 6-8");

  const fair = runEngine({
    bundle: a,
    teachers: [rahul, amit, kiran],
    statusByTeacherId: new Map([
      [String(rahul._id), DAILY_TEACHER_STATUS.ABSENT],
      [String(amit._id), DAILY_TEACHER_STATUS.PRESENT],
      [String(kiran._id), DAILY_TEACHER_STATUS.PRESENT]
    ])
  });
  const fairIds = [...new Set(fair.assignments.map((row) => String(row.substituteTeacherId)))];
  assert(fairIds.length === 2, "fair allocation spreads two periods across two eligible teachers");

  const primaryWing = await Timetable.create({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    name: "Primary",
    status: TIMETABLE_STATUS.ACTIVE,
    version: 2
  });
  const secondaryWing = await Timetable.create({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    name: "Secondary",
    status: TIMETABLE_STATUS.ACTIVE,
    version: 3
  });
  const wingA = await Teacher.create({
    schoolId: a.school._id,
    name: "Wing A",
    subjects: [a.math._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: primaryWing._id
  });
  const wingB = await Teacher.create({
    schoolId: a.school._id,
    name: "Wing B",
    subjects: [a.math._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: secondaryWing._id
  });
  const sumit = await Teacher.create({
    schoolId: a.school._id,
    name: "Sumit",
    subjects: [a.math._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: primaryWing._id
  });
  const noWing = await Teacher.create({
    schoolId: a.school._id,
    name: "No Wing",
    subjects: [a.math._id],
    eligibleClassGroups: [a.gMid._id]
  });
  const absentPrimary = await Teacher.create({
    schoolId: a.school._id,
    name: "Absent Primary",
    subjects: [a.math._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: primaryWing._id
  });
  const absentSecondary = await Teacher.create({
    schoolId: a.school._id,
    name: "Absent Secondary",
    subjects: [a.math._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: secondaryWing._id
  });

  const wingEntries = [
    await addEntry(a, {
      timetableId: primaryWing._id,
      period: 4,
      teacherId: absentPrimary._id,
      subjectId: a.math._id,
      classId: a.class7._id,
      sectionId: a.sec7a._id
    }),
    await addEntry(a, {
      timetableId: secondaryWing._id,
      period: 4,
      teacherId: absentSecondary._id,
      subjectId: a.math._id,
      classId: a.class8._id,
      sectionId: a.sec8b._id
    }),
    await addEntry(a, {
      timetableId: primaryWing._id,
      period: 5,
      teacherId: sumit._id,
      subjectId: a.math._id,
      classId: a.class7._id,
      sectionId: a.sec7a._id
    }),
    await addEntry(a, {
      timetableId: secondaryWing._id,
      period: 6,
      teacherId: sumit._id,
      subjectId: a.math._id,
      classId: a.class8._id,
      sectionId: a.sec8b._id
    })
  ];
  const wingTeachers = [wingA, wingB, sumit, absentPrimary, absentSecondary];
  const wingClasses = new Map([
    [String(a.class7._id), a.class7],
    [String(a.class8._id), a.class8]
  ]);

  const primaryNeed = generateAssignments({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    dateKey: "2026-09-01",
    dayOfWeek: "TUESDAY",
    teachers: wingTeachers,
    classesById: wingClasses,
    statusByTeacherId: new Map([
      [String(absentPrimary._id), DAILY_TEACHER_STATUS.ABSENT],
      ...present([wingA, wingB, sumit, absentSecondary])
    ]),
    timetableEntries: wingEntries,
    existingSubstitutions: []
  });
  const primaryRow = primaryNeed.assignments.find((row) => String(row.absentTeacherId) === String(absentPrimary._id));
  assert(primaryRow, "primary class creates a substitution slot");
  assert(
    [String(wingA._id), String(sumit._id)].includes(String(primaryRow.substituteTeacherId)),
    "primary substitution stays inside Primary Home Wing"
  );
  assert(String(primaryRow.substituteTeacherId) !== String(wingB._id), "Secondary Home Wing teacher is excluded from Primary");

  const missingWingPool = generateAssignments({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    dateKey: "2026-09-01",
    dayOfWeek: "TUESDAY",
    teachers: [noWing, wingB, absentPrimary],
    classesById: wingClasses,
    statusByTeacherId: new Map([
      [String(absentPrimary._id), DAILY_TEACHER_STATUS.ABSENT],
      ...present([noWing, wingB])
    ]),
    timetableEntries: [wingEntries[0]],
    existingSubstitutions: []
  });
  const missingWingRow = missingWingPool.assignments.find(
    (row) => String(row.absentTeacherId) === String(absentPrimary._id)
  );
  assert(String(missingWingRow.substituteTeacherId) === String(noWing._id), "teacher without Home Wing stays in the automatic pool");
  assert(String(missingWingRow.substituteTeacherId) !== String(wingB._id), "set Home Wing still excludes the other wing");

  const secondaryNeed = generateAssignments({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    dateKey: "2026-09-01",
    dayOfWeek: "TUESDAY",
    teachers: wingTeachers,
    classesById: wingClasses,
    statusByTeacherId: new Map([
      [String(absentSecondary._id), DAILY_TEACHER_STATUS.ABSENT],
      ...present([wingA, wingB, sumit, absentPrimary])
    ]),
    timetableEntries: wingEntries,
    existingSubstitutions: []
  });
  const secondaryRow = secondaryNeed.assignments.find(
    (row) => String(row.absentTeacherId) === String(absentSecondary._id)
  );
  assert(String(secondaryRow.substituteTeacherId) === String(wingB._id), "secondary substitution stays inside Secondary Home Wing");
  assert(String(secondaryRow.substituteTeacherId) !== String(wingA._id), "Primary Home Wing teacher is excluded from Secondary");
  assert(String(secondaryRow.substituteTeacherId) !== String(sumit._id), "Sumit is not a Secondary candidate just because he teaches 6I");

  const sumitAbsent = generateAssignments({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    dateKey: "2026-09-01",
    dayOfWeek: "TUESDAY",
    teachers: wingTeachers,
    classesById: wingClasses,
    statusByTeacherId: new Map([
      [String(sumit._id), DAILY_TEACHER_STATUS.ABSENT],
      ...present([wingA, wingB, absentPrimary, absentSecondary])
    ]),
    timetableEntries: wingEntries,
    existingSubstitutions: []
  });
  const sumitPrimarySlot = sumitAbsent.assignments.find(
    (row) => String(row.absentTeacherId) === String(sumit._id) && Number(row.period) === 5
  );
  const sumitSecondarySlot = sumitAbsent.assignments.find(
    (row) => String(row.absentTeacherId) === String(sumit._id) && Number(row.period) === 6
  );
  assert(String(sumitPrimarySlot.timetableId) === String(primaryWing._id), "Sumit's Primary class uses the Primary timetable");
  assert(String(sumitSecondarySlot.timetableId) === String(secondaryWing._id), "Sumit's Secondary class uses the Secondary timetable");
  assert(
    [String(wingA._id), String(absentPrimary._id)].includes(String(sumitPrimarySlot.substituteTeacherId)),
    "Primary slot is covered from Primary Home Wing"
  );
  assert(
    [String(wingB._id), String(absentSecondary._id)].includes(String(sumitSecondarySlot.substituteTeacherId)),
    "Secondary slot is covered from Secondary Home Wing"
  );

  const numbered = [];
  for (const [index, name] of ["1", "2", "3"].entries()) {
    numbered.push(
      await Timetable.create({
        schoolId: a.school._id,
        academicSessionId: a.session._id,
        name,
        status: TIMETABLE_STATUS.ACTIVE,
        version: 4 + index
      })
    );
  }
  const numberedTeacher = await Teacher.create({
    schoolId: a.school._id,
    name: "Numbered Wing",
    subjects: [a.math._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: numbered[1]._id
  });
  const numberedAbsent = await Teacher.create({
    schoolId: a.school._id,
    name: "Numbered Absent",
    subjects: [a.math._id],
    eligibleClassGroups: [a.gMid._id],
    homeWingTimetableId: numbered[1]._id
  });
  const numberedEntry = await addEntry(a, {
    timetableId: numbered[1]._id,
    period: 7,
    teacherId: numberedAbsent._id,
    subjectId: a.math._id,
    classId: a.class7._id,
    sectionId: a.sec7a._id
  });
  const numberedResult = generateAssignments({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    dateKey: "2026-09-01",
    dayOfWeek: "TUESDAY",
    teachers: [numberedTeacher, numberedAbsent, wingA],
    classesById: wingClasses,
    statusByTeacherId: new Map([
      [String(numberedAbsent._id), DAILY_TEACHER_STATUS.ABSENT],
      ...present([numberedTeacher, wingA])
    ]),
    timetableEntries: [numberedEntry],
    existingSubstitutions: []
  });
  assert(
    String(numberedResult.assignments[0].substituteTeacherId) === String(numberedTeacher._id),
    "Home Wing matching uses timetable ids, not hard-coded Primary/Secondary names"
  );
  assert(
    String(numberedResult.assignments[0].substituteTeacherId) !== String(wingA._id),
    "Primary-named Home Wing is not used for timetable 2"
  );
  assert(
    !(await TimetableEntry.findOne({ teacherId: numberedTeacher._id, timetableId: numbered[1]._id })),
    "automatic candidate did not need a class on the affected timetable"
  );

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
  const dateKey = todayDateKey("Asia/Kolkata");
  const dayOfWeek = dayOfWeekFromDateKey(dateKey, "Asia/Kolkata");

  for (const day of DAYS_OF_WEEK) {
    if (day === "TUESDAY") continue;
    await addEntry(a, {
      dayOfWeek: day,
      period: 1,
      teacherId: rahul._id,
      subjectId: a.math._id,
      classId: a.class7._id,
      sectionId: a.sec7a._id
    });
    await addEntry(a, {
      dayOfWeek: day,
      period: 1,
      teacherId: occupied._id,
      subjectId: a.english._id,
      classId: a.class7._id,
      sectionId: a.sec7b._id
    });
  }

  await DailyTeacherStatus.create({
    schoolId: a.school._id,
    academicSessionId: a.session._id,
    teacherId: rahul._id,
    dateKey,
    status: DAILY_TEACHER_STATUS.ABSENT
  });

  const wrongDay = await request(server, {
    method: "POST",
    path: "/api/substitutions/generate",
    token: tokenA,
    body: { date: "1999-01-01", timetableId: a.timetable._id }
  });
  assert(wrongDay.status === 400, "cannot generate for a date other than today");

  const setStatus = await request(server, {
    method: "POST",
    path: "/api/daily-status",
    token: tokenA,
    body: { teacherId: amit._id, status: DAILY_TEACHER_STATUS.PRESENT, date: "1999-01-01" }
  });
  assert(setStatus.status === 400, "cannot save daily status for another date");

  const saved = await request(server, {
    method: "POST",
    path: "/api/daily-status",
    token: tokenA,
    body: { teacherId: rahul._id, status: DAILY_TEACHER_STATUS.ABSENT }
  });
  assert(saved.status === 200, "daily status for today is saved");
  const stillRahul = await Teacher.findById(rahul._id);
  assert(stillRahul.active === true, "daily status does not deactivate the teacher record");

  const generated = await request(server, {
    method: "POST",
    path: "/api/substitutions/generate",
    token: tokenA,
    body: { timetableId: a.timetable._id }
  });
  assert(generated.status === 201, "today's substitutions generate");
  assert(generated.json.dateKey === dateKey, "generated date is today in the school timezone");
  assert(generated.json.dayOfWeek === dayOfWeek, "generated day matches school timezone");
  const todayRows = generated.json.substitutions || [];
  assert(todayRows.length >= 1, "at least one substitution row for today");
  const originalEntry = await TimetableEntry.findOne({ teacherId: rahul._id, period: 1, dayOfWeek });
  assert(originalEntry && String(originalEntry.teacherId) === String(rahul._id), "permanent timetable is unchanged");

  const board = await request(server, { method: "GET", path: `/api/substitutions/today?timetableId=${a.timetable._id}`, token: tokenA });
  assert(board.status === 200, "today board loads");
  assert(board.json.dateKey === dateKey, "board uses school today");
  assert((board.json.teachers || []).some((row) => row.teacher.name === "Rahul"), "active teachers listed");

  const steal = await request(server, {
    method: "GET",
    path: "/api/substitutions/today",
    token: tokenB
  });
  assert((steal.json.substitutions || []).length === 0, "school B does not see school A substitutions");

  const spoof = await request(server, {
    method: "POST",
    path: "/api/substitutions/generate",
    token: tokenA,
    schoolId: b.school._id,
    body: { timetableId: a.timetable._id }
  });
  assert(spoof.status === 403, "cannot generate for another school via header");

  const leftover = await Substitution.countDocuments({ schoolId: a.school._id });
  const otherCount = await Substitution.countDocuments({ schoolId: b.school._id });
  assert(leftover >= 1 && otherCount === 0, "substitutions are school-isolated");

  const firstRow = todayRows.find((row) => row.status === "ASSIGNED" && Number(row.period) === 1) || todayRows.find((row) => row.status === "ASSIGNED");
  assert(firstRow, "there is an assigned row to override");
  const cands = await request(server, {
    method: "GET",
    path: `/api/substitutions/${firstRow._id}/candidates`,
    token: tokenA
  });
  assert(cands.status === 200, "candidate list loads");
  assert(
    !(cands.json.candidates || []).some((t) => String(t._id) === String(rahul._id)),
    "absent teacher is not a valid override candidate"
  );
  const nextTeacher = (cands.json.candidates || []).find(
    (t) => String(t._id) !== String(firstRow.substituteTeacherId)
  );
  assert(nextTeacher, "another valid candidate exists");

  const badOverride = await request(server, {
    method: "POST",
    path: `/api/substitutions/${firstRow._id}/override`,
    token: tokenA,
    body: { substituteTeacherId: otherSchool._id, reason: "spoof" }
  });
  assert(badOverride.status === 400, "override cannot assign a teacher from another school");

  const occupiedOverride = await request(server, {
    method: "POST",
    path: `/api/substitutions/${firstRow._id}/override`,
    token: tokenA,
    body: { substituteTeacherId: occupied._id }
  });
  assert(occupiedOverride.status === 400, "override cannot assign a teacher already teaching that period");

  const okOverride = await request(server, {
    method: "POST",
    path: `/api/substitutions/${firstRow._id}/override`,
    token: tokenA,
    body: { substituteTeacherId: nextTeacher._id, reason: "Cover requested by coordinator" }
  });
  assert(okOverride.status === 200, "valid override is saved");
  assert(okOverride.json.substitution.statusLabel === "Manually overridden", "status is manually overridden");
  assert(okOverride.json.substitution.finalSubstituteName === nextTeacher.name, "final substitute is the override");
  assert(
    okOverride.json.substitution.originalSubstituteName === firstRow.finalSubstituteName ||
      okOverride.json.substitution.override.previousSubstituteName === firstRow.finalSubstituteName,
    "original generated substitute is preserved"
  );
  const audit = await AuditLog.findOne({
    schoolId: a.school._id,
    action: AUDIT_ACTIONS.SUBSTITUTION_OVERRIDDEN,
    entityId: firstRow._id
  });
  assert(audit, "override writes an audit log");

  const searched = await request(server, {
    method: "GET",
    path: `/api/substitutions/${firstRow._id}/candidates?q=${encodeURIComponent(nextTeacher.name.slice(0, 3))}`,
    token: tokenA
  });
  assert(searched.status === 200, "candidate search works");
  assert(
    (searched.json.candidates || []).some((t) => String(t._id) === String(nextTeacher._id)),
    "search returns matching valid teachers"
  );

  const emptyRows = buildFinalSheetRows([]);
  assert(emptyRows.length === 0, "empty sheet has no body rows");
  const longNameRows = buildFinalSheetRows([
    {
      period: 9,
      className: "Class 11",
      sectionName: "11C",
      subjectName: "Political Science",
      absentTeacherName: "Annamalai Venkataraghavan Subramaniam",
      finalSubstituteName: "Meenakshi Sundaram Pillai Rajasekaran",
      status: "OVERRIDDEN",
      source: "MANUAL"
    },
    {
      period: 1,
      className: "Class 7",
      sectionName: "7A",
      subjectName: "Mathematics",
      absentTeacherName: "Rahul",
      finalSubstituteName: nextTeacher.name,
      status: "OVERRIDDEN",
      source: "MANUAL"
    },
    {
      period: 2,
      className: "Class 8",
      sectionName: "8B",
      subjectName: "Science",
      absentTeacherName: "Neha",
      finalSubstituteName: "Amit",
      status: "ASSIGNED",
      source: "GENERATED"
    }
  ]);
  assert(longNameRows.length === 3, "multiple classes and periods appear in the sheet");
  assert(
    longNameRows.some((row) => row.finalSubstituteName === nextTeacher.name),
    "PDF sheet rows use the overridden substitute, not the original generated name"
  );
  assert(
    longNameRows.some((row) => row.absentTeacherName.includes("Annamalai")),
    "long teacher names are kept on the sheet"
  );

  const emptyPdf = buildSubstitutionPdfBuffer({
    schoolName: "Empty School",
    dateKey,
    dayOfWeek,
    substitutions: []
  });
  assert(emptyPdf.slice(0, 4).toString() === "%PDF", "empty list still produces a PDF");

  const finalPdf = buildSubstitutionPdfBuffer({
    schoolName: "A School",
    dateKey,
    dayOfWeek,
    substitutions: [okOverride.json.substitution]
  });
  assert(finalPdf.slice(0, 4).toString() === "%PDF", "overridden sheet produces a PDF");
  assert(finalPdf.length > 200, "PDF has content");

  const pdfHttp = await new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: addr.port,
        path: `/api/substitutions/today/pdf?timetableId=${a.timetable._id}`,
        method: "GET",
        headers: { Authorization: `Bearer ${tokenA}` }
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
      }
    );
    req.on("error", reject);
    req.end();
  });
  assert(pdfHttp.status === 200 && pdfHttp.buf.slice(0, 4).toString() === "%PDF", "download endpoint returns a PDF");
  assert(
    pdfHttp.buf.toString("latin1").toUpperCase().includes(String(nextTeacher.name).toUpperCase()),
    "PDF is built from the final overridden substitute, not only the original algorithm result"
  );

  const firstRunCount = await SubstitutionRun.countDocuments({ schoolId: a.school._id });
  const generatedAgain = await request(server, {
    method: "POST",
    path: "/api/substitutions/generate",
    token: tokenA,
    body: { timetableId: a.timetable._id }
  });
  assert(generatedAgain.status === 201, "regenerate still works");
  const secondRunCount = await SubstitutionRun.countDocuments({ schoolId: a.school._id });
  assert(secondRunCount === firstRunCount + 1, "regenerate creates a new historical run");
  const oldest = await SubstitutionRun.find({ schoolId: a.school._id }).sort({ generatedAt: 1 });
  assert(Array.isArray(oldest[0].snapshot), "previous run snapshot is preserved");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[substitution] all checks passed");
}

run().catch(async (err) => {
  console.error("[substitution] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
