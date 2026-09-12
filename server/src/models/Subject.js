const mongoose = require("mongoose");

const { Schema } = mongoose;

const subjectSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, default: "", trim: true, uppercase: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

subjectSchema.index({ schoolId: 1, name: 1 }, { unique: true });
subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true, sparse: true });

subjectSchema.pre("validate", function normalizeEmptyCode() {
  if (this.code === "") this.code = undefined;
});

module.exports = mongoose.model("Subject", subjectSchema);
