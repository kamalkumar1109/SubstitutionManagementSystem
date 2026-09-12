const express = require("express");
const { isDbConnected } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { schoolScope } = require("../middleware/schoolScope");
const asyncHandler = require("../utils/asyncHandler");
const auditService = require("../services/auditService");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    db: isDbConnected() ? "connected" : "disconnected"
  });
});

router.get(
  "/audit-logs",
  authenticate,
  schoolScope,
  asyncHandler(async (req, res) => {
    const logs = await auditService.listSchoolLogs(req.schoolId);
    res.json({ ok: true, logs });
  })
);

router.delete(
  "/audit-logs/:logId",
  authenticate,
  schoolScope,
  asyncHandler(async (req, res) => {
    const result = await auditService.deleteSchoolLog({
      schoolId: req.schoolId,
      logId: req.params.logId
    });
    res.json({ ok: true, ...result });
  })
);

router.delete(
  "/audit-logs",
  authenticate,
  schoolScope,
  asyncHandler(async (req, res) => {
    const result = await auditService.clearSchoolLogs({
      schoolId: req.schoolId,
      actorId: req.user._id
    });
    res.json({ ok: true, ...result });
  })
);

module.exports = router;
