const mongoose = require("mongoose");
const { SESSION_STATUS } = require("../config/constants");

const { Schema } = mongoose;

const academicSessionSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(SESSION_STATUS),
      default: SESSION_STATUS.UPCOMING
    },
    isCurrent: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

academicSessionSchema.index({ schoolId: 1, name: 1 }, { unique: true });
academicSessionSchema.index({ schoolId: 1, isCurrent: 1 });

academicSessionSchema.pre("validate", function validateDates() {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    throw new Error("endDate must be after startDate");
  }
});

module.exports = mongoose.model("AcademicSession", academicSessionSchema);
