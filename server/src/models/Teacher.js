const mongoose = require("mongoose");
const { EMPLOYMENT_STATUS, TEACHER_CATEGORY } = require("../config/constants");

const { Schema } = mongoose;

const teacherSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    employeeCode: { type: String, default: "", trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    phone: { type: String, default: "", trim: true },
    designation: { type: String, default: "", trim: true },
    category: {
      type: String,
      enum: Object.values(TEACHER_CATEGORY),
      default: TEACHER_CATEGORY.REGULAR,
      index: true
    },
    alternateWeekSchedule: { type: Boolean, default: false },
    subjects: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
    eligibleClassGroups: [{ type: Schema.Types.ObjectId, ref: "ClassGroup" }],
    homeWingTimetableId: {
      type: Schema.Types.ObjectId,
      ref: "Timetable",
      default: null,
      index: true
    },
    employmentStatus: {
      type: String,
      enum: Object.values(EMPLOYMENT_STATUS),
      default: EMPLOYMENT_STATUS.ACTIVE,
      index: true
    },
    joiningDate: { type: Date, default: null },
    leavingDate: { type: Date, default: null },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

teacherSchema.index({ schoolId: 1, name: 1 });
teacherSchema.index(
  { schoolId: 1, employeeCode: 1 },
  { unique: true, partialFilterExpression: { employeeCode: { $type: "string" } } }
);
teacherSchema.index(
  { schoolId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);
teacherSchema.index({ schoolId: 1, active: 1, employmentStatus: 1 });

teacherSchema.pre("validate", function normalizeEmptyUniques() {
  if (!this.employeeCode) this.employeeCode = undefined;
  if (!this.email) this.email = undefined;
});

module.exports = mongoose.model("Teacher", teacherSchema);
