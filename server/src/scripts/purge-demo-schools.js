const { connectDb, disconnectDb } = require("../config/db");
const {
  School,
  User,
  Teacher,
  AcademicSession,
  DailyTeacherStatus,
  ClassGroup,
  ClassGroupMembership,
  Class,
  Section,
  Subject,
  Timetable,
  TimetableEntry,
  Substitution,
  SubstitutionRun,
  SchoolSubscription,
  Payment,
  AuditLog
} = require("../models");

const DEMO_CODES = ["GREENFIELD", "OAKRIDGE"];

async function purgeSchool(school) {
  const schoolId = school._id;
  await Promise.all([
    User.deleteMany({ schoolId, role: "SCHOOL_ADMIN" }),
    Teacher.deleteMany({ schoolId }),
    AcademicSession.deleteMany({ schoolId }),
    DailyTeacherStatus.deleteMany({ schoolId }),
    ClassGroup.deleteMany({ schoolId }),
    ClassGroupMembership.deleteMany({ schoolId }),
    Class.deleteMany({ schoolId }),
    Section.deleteMany({ schoolId }),
    Subject.deleteMany({ schoolId }),
    Timetable.deleteMany({ schoolId }),
    TimetableEntry.deleteMany({ schoolId }),
    Substitution.deleteMany({ schoolId }),
    SubstitutionRun.deleteMany({ schoolId }),
    SchoolSubscription.deleteMany({ schoolId }),
    Payment.deleteMany({ schoolId }),
    AuditLog.deleteMany({ schoolId })
  ]);
  await School.deleteOne({ _id: schoolId });
  console.log(`[purge] Removed ${school.name} (${school.schoolCode})`);
}

async function run() {
  await connectDb();
  const schools = await School.find({ schoolCode: { $in: DEMO_CODES } });
  if (!schools.length) {
    console.log("[purge] No GREENFIELD or OAKRIDGE schools found.");
  } else {
    for (const school of schools) {
      await purgeSchool(school);
    }
  }
  await disconnectDb();
}

run().catch(async (err) => {
  console.error("[purge] FAILED:", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
