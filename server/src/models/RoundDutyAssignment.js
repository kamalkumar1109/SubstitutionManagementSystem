const mongoose = require("mongoose");
const { SUBSTITUTION_SOURCE, SUBSTITUTION_STATUS } = require("../config/constants");

const { Schema } = mongoose;

const roundDutyAssignmentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    academicSessionId: { type: Schema.Types.ObjectId, ref: "AcademicSession", required: true, index: true },
    timetableId: { type: Schema.Types.ObjectId, ref: "Timetable", required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true
    },
    areaName: { type: String, required: true, trim: true },
    period: { type: Number, required: true, min: 0 },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null, index: true },
    source: {
      type: String,
      enum: Object.values(SUBSTITUTION_SOURCE),
      default: SUBSTITUTION_SOURCE.GENERATED
    },
    status: {
      type: String,
      enum: Object.values(SUBSTITUTION_STATUS),
      default: SUBSTITUTION_STATUS.UNASSIGNED
    }
  },
  { timestamps: true }
);

roundDutyAssignmentSchema.index(
  { schoolId: 1, timetableId: 1, dateKey: 1, areaName: 1, period: 1 },
  { unique: true }
);

module.exports = mongoose.model("RoundDutyAssignment", roundDutyAssignmentSchema);
