const mongoose = require("mongoose");
const { env } = require("./env");

async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI);
  await repairTeacherUniqueIndexes();
  await repairTimetableEntryIndexes();
  await repairSubstitutionIndexes();
  return mongoose.connection;
}

async function repairTeacherUniqueIndexes() {
  const Teacher = require("../models/Teacher");
  for (const name of ["schoolId_1_employeeCode_1", "schoolId_1_email_1"]) {
    try {
      await Teacher.collection.dropIndex(name);
    } catch (err) {
      if (err.code !== 27 && err.code !== 26 && err.codeName !== "IndexNotFound" && err.codeName !== "NamespaceNotFound") {
        throw err;
      }
    }
  }
  await Teacher.syncIndexes();
}

async function repairTimetableEntryIndexes() {
  const TimetableEntry = require("../models/TimetableEntry");
  const { WEEK_PATTERN } = require("./constants");
  try {
    await TimetableEntry.updateMany(
      { $or: [{ weekPattern: { $exists: false } }, { weekPattern: null }, { weekPattern: "" }] },
      { $set: { weekPattern: WEEK_PATTERN.EVERY } }
    );
  } catch (err) {
    if (err.codeName !== "NamespaceNotFound" && err.code !== 26) throw err;
    return;
  }
  for (const name of [
    "timetableId_1_dayOfWeek_1_period_1_classId_1_sectionId_1",
    "timetableId_1_dayOfWeek_1_period_1_classId_1_sectionId_1_weekPattern_1",
    "timetableId_1_dayOfWeek_1_period_1_teacherId_1"
  ]) {
    try {
      await TimetableEntry.collection.dropIndex(name);
    } catch (err) {
      if (
        err.code !== 27 &&
        err.code !== 26 &&
        err.codeName !== "IndexNotFound" &&
        err.codeName !== "NamespaceNotFound"
      ) {
        throw err;
      }
    }
  }
  await TimetableEntry.syncIndexes();
}

async function repairSubstitutionIndexes() {
  const Substitution = require("../models/Substitution");
  for (const name of [
    "schoolId_1_dateKey_1_period_1_classId_1_sectionId_1",
    "schoolId_1_dateKey_1_period_1_absentTeacherId_1"
  ]) {
    try {
      await Substitution.collection.dropIndex(name);
    } catch (err) {
      if (err.code !== 27 && err.code !== 26 && err.codeName !== "IndexNotFound" && err.codeName !== "NamespaceNotFound") {
        throw err;
      }
    }
  }
  try {
    await Substitution.syncIndexes();
  } catch (err) {
    if (err.codeName !== "NamespaceNotFound" && err.code !== 26) throw err;
  }
}

async function disconnectDb() {
  await mongoose.disconnect();
}

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDb, disconnectDb, isDbConnected };
