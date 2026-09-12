const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function formatSheetDate(dateKey) {
  if (!dateKey) return "";
  const [y, m, d] = String(dateKey).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1].toUpperCase()} ${y}`;
}

function formatDayLabel(dayOfWeek) {
  if (!dayOfWeek) return "";
  return String(dayOfWeek).toUpperCase();
}

function statusLabel(row) {
  if (
    row.status === "UNASSIGNED" ||
    !row.finalSubstituteName ||
    row.finalSubstituteName === "No suitable substitute available"
  ) {
    return "Unassigned";
  }
  if (row.status === "OVERRIDDEN" || row.source === "MANUAL") return "Manually overridden";
  return "Generated";
}

/** Bell times from the attached school substitution sheet (period 0–8). */
const SAMPLE_PERIOD_BELLS = Object.freeze({
  0: { start: "8:25am", end: "9:05am" },
  1: { start: "9:05am", end: "9:40am" },
  2: { start: "9:40am", end: "10:15am" },
  3: { start: "10:15am", end: "10.50am" },
  4: { start: "10.50am", end: "11:25am" },
  5: { start: "11.45 am", end: "12:25pm" },
  6: { start: "12:25pm", end: "1.00pm" },
  7: { start: "1.00pm", end: "1:35pm" },
  8: { start: "1:35 pm", end: "2:10 pm" }
});

function bellForPeriod(period) {
  const n = Number(period);
  if (SAMPLE_PERIOD_BELLS[n]) return SAMPLE_PERIOD_BELLS[n];
  return { start: "", end: "" };
}

function classCode(className, sectionName) {
  const sec = String(sectionName || "").replace(/\s+/g, "");
  if (/^\d/.test(sec) && sec.length <= 4) return sec.toUpperCase();
  const num = String(className || "").replace(/[^0-9]/g, "");
  const joined = `${num}${sec}`.replace(/\s+/g, "");
  return (joined || className || "").toUpperCase();
}

function shortSubject(name) {
  return String(name || "")
    .replace(/Mathematics/i, "MATHS")
    .replace(/Science/i, "SCIENCE")
    .replace(/English/i, "ENGLISH")
    .replace(/Sports/i, "SPORTS")
    .toUpperCase();
}

function teacherSheetName(name) {
  return String(name || "").trim().toUpperCase();
}

const defaultSchoolSheetLayout = {
  id: "sample-school-sheet-v1",
  page: { orientation: "landscape", format: "a4", unit: "mm" },
  margin: 8,
  title: ({ dateKey, dayOfWeek }) =>
    `Date ${formatSheetDate(dateKey)} ${formatDayLabel(dayOfWeek)} Substitutions`,
  emptyMessage: "No substitutions recorded for this date.",
  columns: [
    { key: "period", header: "Period", width: 16 },
    { key: "className", header: "Class", width: 22 },
    { key: "sectionName", header: "Section", width: 18 },
    { key: "subjectName", header: "Subject", width: 28 },
    { key: "absentTeacherName", header: "Absent teacher", width: 36 },
    { key: "finalSubstituteName", header: "Substitute", width: 36 },
    { key: "statusLabel", header: "Status", width: 28 }
  ],
  mapRow(row) {
    return {
      period: String(row.period ?? ""),
      className: row.className || "—",
      sectionName: row.sectionName || "—",
      subjectName: row.subjectName || "—",
      absentTeacherName: row.absentTeacherName || "—",
      finalSubstituteName: row.finalSubstituteName || row.substituteTeacherName || "No suitable substitute available",
      statusLabel: statusLabel(row)
    };
  }
};

function buildFinalSheetRows(substitutions) {
  return (substitutions || [])
    .slice()
    .sort((a, b) => {
      if (Number(a.period) !== Number(b.period)) return Number(a.period) - Number(b.period);
      return String(a.className || "").localeCompare(String(b.className || ""));
    })
    .map((row) => defaultSchoolSheetLayout.mapRow(row));
}

function listPeriods({ substitutions = [], dayEntries = [], periodCount, periodStart }) {
  const count = Number(periodCount) || 0;
  if (count > 0) {
    const start = periodStart === 0 ? 0 : 1;
    return Array.from({ length: count }, (_, i) => start + i);
  }
  const set = new Set();
  (substitutions || []).forEach((row) => {
    if (row.period != null) set.add(Number(row.period));
  });
  (dayEntries || []).forEach((row) => {
    if (row.period != null) set.add(Number(row.period));
  });
  return [...set].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
}

module.exports = {
  defaultSchoolSheetLayout,
  buildFinalSheetRows,
  formatSheetDate,
  formatDayLabel,
  statusLabel,
  SAMPLE_PERIOD_BELLS,
  bellForPeriod,
  classCode,
  shortSubject,
  teacherSheetName,
  listPeriods
};
