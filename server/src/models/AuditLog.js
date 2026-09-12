const mongoose = require("mongoose");
const { AUDIT_ACTIONS } = require("../config/constants");

const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", default: null, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    action: { type: String, enum: Object.values(AUDIT_ACTIONS), required: true, index: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

auditLogSchema.index({ schoolId: 1, createdAt: -1 });
auditLogSchema.index({ schoolId: 1, action: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
