const { AuditLog } = require("../models");

async function writeAudit({ schoolId, actorId, action, entityType, entityId, metadata }) {
  await AuditLog.create({
    schoolId: schoolId || null,
    actorId: actorId || null,
    action,
    entityType,
    entityId: entityId || null,
    metadata: metadata || {}
  });
}

function presentLog(row) {
  return {
    _id: row._id,
    action: row.action,
    entityType: row.entityType,
    createdAt: row.createdAt,
    metadata: row.metadata || {}
  };
}

async function listSchoolLogs(schoolId) {
  const logs = await AuditLog.find({ schoolId }).sort({ createdAt: -1 }).limit(200);
  return logs.map(presentLog);
}

async function deleteSchoolLog({ schoolId, logId }) {
  const row = await AuditLog.findOne({ _id: logId, schoolId });
  if (!row) {
    const { AppError } = require("../utils/AppError");
    throw AppError.notFound("History item not found");
  }
  await AuditLog.deleteOne({ _id: row._id, schoolId });
  return { deleted: true };
}

async function clearSchoolLogs({ schoolId, actorId }) {
  const { AUDIT_ACTIONS } = require("../config/constants");
  await AuditLog.deleteMany({ schoolId });
  await writeAudit({
    schoolId,
    actorId,
    action: AUDIT_ACTIONS.AUDIT_CLEARED,
    entityType: "AuditLog",
    metadata: { cleared: true }
  });
  return { cleared: true };
}

module.exports = { writeAudit, listSchoolLogs, deleteSchoolLog, clearSchoolLogs };
