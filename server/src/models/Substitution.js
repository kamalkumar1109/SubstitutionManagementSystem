const mongoose = require("mongoose");
const { SUBSTITUTION_SOURCE, SUBSTITUTION_STATUS } = require("../config/constants");

const { Schema } = mongoose;

const overrideSchema = new Schema(
  {
    overriddenBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    overriddenAt: { type: Date, default: null },
    previousSubstituteTeacherId: {
      type: Schema.Types.ObjectId,
      ref: "Teacher",
      default: null
    },
    newSubstituteTeacherId: {
      type: Schema.Types.ObjectId,
      ref: "Teacher",
      default: null
    },
    reason: { type: String, default: "", trim: true }
  },
  { _id: false }
);

const substitutionSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: "AcademicSession",
      required: true,
      index: true
    },
    substitutionRunId: {
      type: Schema.Types.ObjectId,
      ref: "SubstitutionRun",
      required: true,
      index: true
    },
    timetableId: { type: Schema.Types.ObjectId, ref: "Timetable", default: null, index: true },
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    period: { type: Number, required: true, min: 0 },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null, index: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null, index: true },
    absentTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true, index: true },
    substituteTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null, index: true },
    generatedSubstituteTeacherId: {
      type: Schema.Types.ObjectId,
      ref: "Teacher",
      default: null
    },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    slotKey: { type: String, default: "", trim: true },
    source: {
      type: String,
      enum: Object.values(SUBSTITUTION_SOURCE),
      default: SUBSTITUTION_SOURCE.GENERATED
    },
    status: {
      type: String,
      enum: Object.values(SUBSTITUTION_STATUS),
      default: SUBSTITUTION_STATUS.UNASSIGNED
    },
    score: { type: Number, default: null },
    reason: { type: String, default: "", trim: true },
    assignmentType: { type: String, default: "", trim: true },
    comment: { type: String, default: "", trim: true },
    informational: { type: Boolean, default: false },
    override: { type: overrideSchema, default: () => ({}) }
  },
  { timestamps: true }
);

substitutionSchema.index(
  { schoolId: 1, dateKey: 1, slotKey: 1 },
  { unique: true, partialFilterExpression: { slotKey: { $type: "string", $gt: "" } } }
);
substitutionSchema.index({ schoolId: 1, timetableId: 1, dateKey: 1 });
substitutionSchema.index({ schoolId: 1, dateKey: 1, period: 1, substituteTeacherId: 1 });
substitutionSchema.index({ schoolId: 1, academicSessionId: 1, dateKey: 1 });

module.exports = mongoose.model("Substitution", substitutionSchema);
