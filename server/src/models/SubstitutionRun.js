const mongoose = require("mongoose");
const { SUBSTITUTION_RUN_STATUS } = require("../config/constants");

const { Schema } = mongoose;

const substitutionRunSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    academicSessionId: {
      type: Schema.Types.ObjectId,
      ref: "AcademicSession",
      required: true,
      index: true
    },
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    generatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    generatedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: Object.values(SUBSTITUTION_RUN_STATUS),
      default: SUBSTITUTION_RUN_STATUS.PENDING
    },
    generationVersion: { type: String, required: true },
    weekCount: { type: Number, default: null, min: 1 },
    summary: { type: Schema.Types.Mixed, default: {} },
    snapshot: { type: Schema.Types.Mixed, default: [] }
  },
  { timestamps: true }
);

substitutionRunSchema.index({ schoolId: 1, academicSessionId: 1, dateKey: 1, generatedAt: -1 });

module.exports = mongoose.model("SubstitutionRun", substitutionRunSchema);
