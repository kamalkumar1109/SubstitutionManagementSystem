const express = require("express");
const { getTeachersWithAttendance, markAttendance } = require("../controllers/attendanceController");

const router = express.Router();

router.get("/teachers", getTeachersWithAttendance);
router.post("/mark-attendance", markAttendance);

module.exports = router;

