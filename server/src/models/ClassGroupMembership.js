const mongoose = require("mongoose");

const { Schema } = mongoose;

const classGroupMembershipSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    classGroupId: { type: Schema.Types.ObjectId, ref: "ClassGroup", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    sectionIds: [{ type: Schema.Types.ObjectId, ref: "Section" }]
  },
  { timestamps: true }
);

classGroupMembershipSchema.index({ schoolId: 1, classGroupId: 1, classId: 1 }, { unique: true });
classGroupMembershipSchema.index({ schoolId: 1, classId: 1 });

module.exports = mongoose.model("ClassGroupMembership", classGroupMembershipSchema);
