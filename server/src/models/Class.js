const mongoose = require("mongoose");

const { Schema } = mongoose;

const classSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    classGroupId: { type: Schema.Types.ObjectId, ref: "ClassGroup", required: true, index: true },
    name: { type: String, required: true, trim: true },
    gradeNumber: { type: Number, default: null },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

classSchema.index({ schoolId: 1, name: 1 }, { unique: true });
classSchema.index({ schoolId: 1, classGroupId: 1 });

module.exports = mongoose.model("Class", classSchema);
