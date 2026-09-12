const mongoose = require("mongoose");
const { DAYS_OF_WEEK, WEEK_PATTERN, ASSIGNMENT_TYPE } = require("../config/constants");

const { Schema } = mongoose;

const timetableEntrySchema = new Schema(
  {
    timetableId: { type: Schema.Types.ObjectId, ref: "Timetable", required: true, index: true },
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: "AcademicSession",
      required: true,
      index: true
    },
    dayOfWeek: { type: String, enum: DAYS_OF_WEEK, required: true, index: true },
    period: { type: Number, required: true, min: 0 },
    assignmentType: {
      type: String,
      enum: Object.values(ASSIGNMENT_TYPE),
      default: ASSIGNMENT_TYPE.CLASS,
      index: true
    },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null, index: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null, index: true },
    room: { type: String, default: "", trim: true },
    weekPattern: {
      type: String,
      enum: Object.values(WEEK_PATTERN),
      default: WEEK_PATTERN.EVERY,
      index: true
    },
    comment: { type: String, default: "", trim: true },
    combinedLabel: { type: String, default: "", trim: true },
    assignmentGroupId: { type: Schema.Types.ObjectId, default: null, index: true },
    followLeadSection: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

timetableEntrySchema.index(
  { timetableId: 1, dayOfWeek: 1, period: 1, classId: 1, sectionId: 1, weekPattern: 1 },
  {
    unique: true,
    name: "uniq_slot_class_section_week",
    partialFilterExpression: { classId: { $type: "objectId" }, sectionId: { $type: "objectId" } }
  }
);
timetableEntrySchema.index(
  { timetableId: 1, dayOfWeek: 1, period: 1, teacherId: 1, weekPattern: 1 },
  { unique: true }
);
timetableEntrySchema.index({ schoolId: 1, teacherId: 1, dayOfWeek: 1, period: 1 });
timetableEntrySchema.index({ schoolId: 1, classId: 1, sectionId: 1, dayOfWeek: 1, period: 1 });
timetableEntrySchema.index({ schoolId: 1, subjectId: 1, dayOfWeek: 1 });
timetableEntrySchema.index({ schoolId: 1, academicSessionId: 1, timetableId: 1 });

module.exports = mongoose.model("TimetableEntry", timetableEntrySchema);
