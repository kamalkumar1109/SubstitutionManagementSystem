const mongoose = require("mongoose");
const { TIMETABLE_STATUS } = require("../config/constants");

const { Schema } = mongoose;

const timetableSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: "AcademicSession",
      required: true,
      index: true
    },
    name: { type: String, required: true, trim: true },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
    status: {
      type: String,
      enum: Object.values(TIMETABLE_STATUS),
      default: TIMETABLE_STATUS.DRAFT,
      index: true
    },
    version: { type: Number, default: 1, min: 1 },
    periodCount: { type: Number, default: 8, min: 1, max: 16 },
    periodStart: { type: Number, default: 1, min: 0, max: 1 },
    weekDays: { type: Number, default: 6, min: 5, max: 6 },
    roomConflictsEnabled: { type: Boolean, default: true },
    firstHalfStart: { type: Number, default: null, min: 0 },
    firstHalfEnd: { type: Number, default: null, min: 0 },
    secondHalfStart: { type: Number, default: null, min: 0 },
    secondHalfEnd: { type: Number, default: null, min: 0 },
    staybackEnabled: { type: Boolean, default: false },
    staybackDay: { type: String, default: null, trim: true, uppercase: true },
    staybackFirstHalfStart: { type: Number, default: null, min: 0 },
    staybackFirstHalfEnd: { type: Number, default: null, min: 0 },
    staybackSecondHalfStart: { type: Number, default: null, min: 0 },
    staybackSecondHalfEnd: { type: Number, default: null, min: 0 },
    classIds: [{ type: Schema.Types.ObjectId, ref: "Class" }],
    roundDuties: [
      {
        label: { type: String, required: true, trim: true },
        classGroupIds: [{ type: Schema.Types.ObjectId, ref: "ClassGroup" }],
        slots: [
          {
            period: { type: Number, required: true, min: 0 },
            teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null }
          }
        ]
      }
    ]
  },
  { timestamps: true }
);

timetableSchema.index({ schoolId: 1, academicSessionId: 1, version: 1 }, { unique: true });
timetableSchema.index({ schoolId: 1, academicSessionId: 1, status: 1 });

module.exports = mongoose.model("Timetable", timetableSchema);
