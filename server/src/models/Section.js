const mongoose = require("mongoose");

const { Schema } = mongoose;

const sectionSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

sectionSchema.index({ schoolId: 1, classId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Section", sectionSchema);
