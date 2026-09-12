const mongoose = require("mongoose");
const { DAILY_TEACHER_STATUS } = require("../config/constants");

const { Schema } = mongoose;

const dailyTeacherStatusSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: "AcademicSession",
      required: true,
      index: true
    },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    status: {
      type: String,
      enum: Object.values(DAILY_TEACHER_STATUS),
      required: true
    },
    note: { type: String, default: "", trim: true }
  },
  { timestamps: true }
);

dailyTeacherStatusSchema.index(
  { schoolId: 1, teacherId: 1, dateKey: 1 },
  { unique: true }
);
dailyTeacherStatusSchema.index({ schoolId: 1, academicSessionId: 1, dateKey: 1, status: 1 });

module.exports = mongoose.model("DailyTeacherStatus", dailyTeacherStatusSchema);
