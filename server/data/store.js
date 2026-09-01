// In-memory store (resets when server restarts)
const attendanceByTeacherId = new Map();
const substitutionsByDay = new Map(); // day -> array of substitution rows

function resetDay(day) {
  substitutionsByDay.set(day, []);
}

module.exports = {
  attendanceByTeacherId,
  substitutionsByDay,
  resetDay
};

