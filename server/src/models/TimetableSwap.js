const mongoose = require("mongoose");

const { Schema } = mongoose;

const assignmentSnapshotSchema = new Schema(
  {
    entryId: { type: Schema.Types.ObjectId, ref: "TimetableEntry", default: null },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    room: { type: String, default: "" },
    weekPattern: { type: String, default: "" },
    combinedLabel: { type: String, default: "" },
    free: { type: Boolean, default: false }
  },
  { _id: false }
);

const timetableSwapSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: "AcademicSession",
      required: true,
      index: true
    },
    timetableId: { type: Schema.Types.ObjectId, ref: "Timetable", required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true
    },
    period: { type: Number, required: true, min: 0 },
    weekCount: { type: Number, required: true, min: 1 },
    teacherAId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    teacherBId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    originalTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
    replacementTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    status: { type: String, default: "ACTIVE", trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    previousA: { type: assignmentSnapshotSchema, required: true },
    previousB: { type: assignmentSnapshotSchema, required: true },
    newA: { type: assignmentSnapshotSchema, required: true },
    newB: { type: assignmentSnapshotSchema, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    changedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

timetableSwapSchema.index({ schoolId: 1, dateKey: 1, period: 1, createdAt: 1 });

module.exports = mongoose.model("TimetableSwap", timetableSwapSchema);
