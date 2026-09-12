const mongoose = require("mongoose");

const { Schema } = mongoose;

const classGroupSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

classGroupSchema.index({ schoolId: 1, name: 1 }, { unique: true });
classGroupSchema.index({ schoolId: 1, sortOrder: 1 });

module.exports = mongoose.model("ClassGroup", classGroupSchema);
