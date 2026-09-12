process.env.MONGODB_URI =
  process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/sms_prompt15_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "prompt15-test-secret";
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
  Class,
  Section,
  Subject,
  AcademicSession,
  ClassGroupMembership
} = require("../models");
const { hashPassword } = require("../utils/password");
const { USER_ROLES, EMPLOYMENT_STATUS } = require("../config/constants");

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

  const a = await seedSchool("P15");
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const token = await login(server, a.admin.email);

  const group68 = await request(server, {
    method: "POST",
    path: "/api/catalog/class-groups",
    token,
    body: { name: "6-8", sortOrder: 1 }
  });
  assert(group68.status === 201, "create 6-8");

  const class8 = await request(server, {
    method: "POST",
    path: "/api/catalog/classes",
    token,
    body: { name: "Class 8", classGroupId: group68.json.classGroup._id, gradeNumber: 8 }
  });
  assert(class8.status === 201, "create class 8");
  const class8Id = class8.json.class._id;

  const class9 = await request(server, {
    method: "POST",
    path: "/api/catalog/classes",
    token,
    body: { name: "Class 9", classGroupId: group68.json.classGroup._id, gradeNumber: 9 }
  });
  assert(class9.status === 201, "create class 9");
  const class9Id = class9.json.class._id;

  const sections = {};
  for (const name of ["8A", "8B", "8C", "8D"]) {
    const created = await request(server, {
      method: "POST",
      path: "/api/catalog/sections",
      token,
      body: { name, classId: class8Id }
    });
    assert(created.status === 201, `section ${name}`);
    sections[name] = created.json.section._id;
  }
  for (const name of ["9A", "9B", "9C"]) {
    const created = await request(server, {
      method: "POST",
      path: "/api/catalog/sections",
      token,
      body: { name, classId: class9Id }
    });
    assert(created.status === 201, `section ${name}`);
    sections[name] = created.json.section._id;
  }

  const dupClass = await request(server, {
    method: "POST",
    path: "/api/catalog/classes",
    token,
    body: { name: "Class 8", classGroupId: group68.json.classGroup._id }
  });
  assert(dupClass.status === 409, "duplicate class name is rejected");

  const group89 = await request(server, {
    method: "POST",
    path: "/api/catalog/class-groups",
    token,
    body: {
      name: "8-9",
      members: [
        { classId: class8Id, sectionIds: [sections["8A"], sections["8B"]] },
        { classId: class9Id, sectionIds: [sections["9A"], sections["9B"]] }
      ]
    }
  });
  assert(group89.status === 201, "create 8-9 with existing classes");
  assert((group89.json.classGroup.members || []).length === 2, "8-9 has two class memberships");

  const groupSpecial = await request(server, {
    method: "POST",
    path: "/api/catalog/class-groups",
    token,
    body: {
      name: "8-9 Special",
      members: [
        { classId: class8Id, sectionIds: [sections["8C"], sections["8D"]] },
        { classId: class9Id, sectionIds: [sections["9C"]] }
      ]
    }
  });
  assert(groupSpecial.status === 201, "second group reuses same classes");

  const classCount = await Class.countDocuments({ schoolId: a.school._id, name: "Class 8" });
  assert(classCount === 1, "Class 8 exists once");
  const memberships = await ClassGroupMembership.countDocuments({ schoolId: a.school._id, classId: class8Id });
  assert(memberships >= 2, "Class 8 belongs to multiple groups");

  const listed = await request(server, { method: "GET", path: "/api/catalog/classes", token });
  const listed8 = (listed.json.classes || []).find((row) => String(row._id) === String(class8Id));
  assert(listed8.classGroups.length >= 2, "class list shows multiple groups");

  const subject = await request(server, {
    method: "POST",
    path: "/api/catalog/subjects",
    token,
    body: { name: "Mathematics" }
  });
  const teacher = await Teacher.create({
    schoolId: a.school._id,
    name: "Anita",
    employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    subjects: [subject.json.subject._id],
    eligibleClassGroups: [group68.json.classGroup._id, group89.json.classGroup._id]
  });

  const tt = await request(server, {
    method: "POST",
    path: "/api/timetables",
    token,
    body: { academicSessionId: a.session._id, name: "2026-27", periodCount: 8, periodStart: 0, weekDays: 6 }
  });
  assert(tt.status === 201, "timetable created");
  const timetableId = tt.json.timetable._id;

  const club = await request(server, {
    method: "POST",
    path: `/api/timetables/${timetableId}/entries`,
    token,
    body: {
      assignmentType: "CLUB",
      teacherId: teacher._id,
      dayOfWeek: "MONDAY",
      period: 7
    }
  });
  assert(club.status === 201, "CLUB without class/section");
  assert(club.json.entry.displayLabel === "CLUB", "CLUB display label");
  assert(!club.json.entry.classId && !club.json.entry.sectionId, "CLUB stores no class or section");
  assert(club.json.entry.assignmentType === "CLUB", "assignment type persisted");

  const clubNeedsClass = await request(server, {
    method: "POST",
    path: `/api/timetables/${timetableId}/entries`,
    token,
    body: {
      assignmentType: "CLASS",
      teacherId: teacher._id,
      dayOfWeek: "TUESDAY",
      period: 1
    }
  });
  assert(clubNeedsClass.status === 400, "Class lesson still requires class/section");

  const kb = await request(server, {
    method: "POST",
    path: `/api/timetables/${timetableId}/entries`,
    token,
    body: {
      assignmentType: "KB",
      teacherId: teacher._id,
      classId: class9Id,
      sectionId: sections["9C"],
      dayOfWeek: "WEDNESDAY",
      period: 2
    }
  });
  assert(kb.status === 201, "KB with class and section");
  assert(kb.json.entry.displayLabel === "9C-KB", "KB compact label");
  assert(String(kb.json.entry.teacherId) === String(teacher._id), "KB keeps teacher");

  const kbNoSection = await request(server, {
    method: "POST",
    path: `/api/timetables/${timetableId}/entries`,
    token,
    body: {
      assignmentType: "CM",
      teacherId: teacher._id,
      classId: class8Id,
      dayOfWeek: "THURSDAY",
      period: 3
    }
  });
  assert(kbNoSection.status === 201, "activity may omit section");

  const dmNone = await request(server, {
    method: "POST",
    path: `/api/timetables/${timetableId}/entries`,
    token,
    body: {
      assignmentType: "DM",
      teacherId: teacher._id,
      dayOfWeek: "THURSDAY",
      period: 4
    }
  });
  assert(dmNone.status === 201 && dmNone.json.entry.displayLabel === "DM", "DM without class/section");

  const clubClass = await request(server, {
    method: "POST",
    path: `/api/timetables/${timetableId}/entries`,
    token,
    body: {
      assignmentType: "CLUB",
      teacherId: teacher._id,
      classId: class8Id,
      sectionId: sections["8A"],
      dayOfWeek: "FRIDAY",
      period: 5
    }
  });
  assert(clubClass.status === 201 && clubClass.json.entry.displayLabel === "8A-CLUB", "CLUB with class/section");

  const grid = await request(server, { method: "GET", path: `/api/timetables/${timetableId}/grid`, token });
  const clubCell = (grid.json.cells["MONDAY:7"] || []).find((row) => row.assignmentType === "CLUB");
  const kbCell = (grid.json.cells["WEDNESDAY:2"] || []).find((row) => row.assignmentType === "KB");
  assert(clubCell && clubCell.displayLabel === "CLUB", "grid shows CLUB");
  assert(kbCell && kbCell.displayLabel === "9C-KB", "grid shows 9C-KB");

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await disconnectDb();
  console.log("[prompt15] all checks passed");
}

run().catch(async (err) => {
  console.error("[prompt15] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
