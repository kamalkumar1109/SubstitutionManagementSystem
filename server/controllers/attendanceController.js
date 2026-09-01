const { teachers } = require("../data/teachers");
const { attendanceSeed } = require("../data/attendanceSeed");
const { attendanceByTeacherId } = require("../data/store");

function ensureSeeded() {
  if (attendanceByTeacherId.size > 0) return;
  for (const a of attendanceSeed) {
    attendanceByTeacherId.set(a.teacherId, a.status);
  }
}

function getTeachersWithAttendance(req, res) {
  ensureSeeded();
  const rows = teachers.map((t) => ({
    ...t,
    status: attendanceByTeacherId.get(t.id) || "present"
  }));
  res.json({ teachers: rows });
}

function markAttendance(req, res) {
  ensureSeeded();
  const { teacherId, status } = req.body || {};
  if (!teacherId || (status !== "present" && status !== "absent")) {
    return res.status(400).json({ error: "teacherId and valid status are required" });
  }
  attendanceByTeacherId.set(Number(teacherId), status);
  return res.json({ ok: true, teacherId: Number(teacherId), status });
}

module.exports = {
  getTeachersWithAttendance,
  markAttendance
};

