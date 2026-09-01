/**
 * School substitution sheet layout.
 * Period times appear only in the main table (Period | Time | …).
 * Header date/day always use the present calendar day (not the app’s timetable day).
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/** Period index 0–9 → time range string (school schedule). */
export const SCHOOL_PERIOD_TIMES = {
  0: "8:25am-9:05am",
  1: "9:05am -9:40am",
  2: "9:40am-10:15am",
  3: "10:15am-10.50am",
  4: "10.50am -11:25am",
  5: "11.45 am-12:25pm",
  6: "12:25pm-1.00pm",
  7: "1.00pm -1:35pm",
  8: "1:35 pm-2:15pm",
  9: "2:15pm-3:00pm"
};

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

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

/**
 * @param {Date} d — use “today” for live PDF header
 * @returns e.g. "Date 08 April-2026 Wednesday Substitutions"
 */
export function formatPdfTitleLine(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mon = MONTHS[d.getMonth()];
  const y = d.getFullYear();
  const wd = WEEKDAYS[d.getDay()];
  return `Date ${dd} ${mon}-${y} ${wd} Substitutions`;
}

function timeForPeriod(period) {
  const p = Number(period);
  return SCHOOL_PERIOD_TIMES[p] ?? "—";
}

function todayDate() {
  return new Date();
}

/**
 * @param {object} opts
 * @param {Array} opts.substitutions - rows from API
 */
export function buildSubstitutionPdfBlob({ substitutions }) {
  const today = todayDate();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  const title = formatPdfTitleLine(today);
  doc.text(title, margin, 18);

  const rows = (substitutions || [])
    .slice()
    .sort((a, b) => {
      if (a.period !== b.period) return a.period - b.period;
      return String(a.absentTeacherName).localeCompare(String(b.absentTeacherName));
    })
    .map((r) => [
      String(r.period),
      timeForPeriod(r.period),
      String(r.className ?? ""),
      String(r.absentTeacherName ?? ""),
      String(r.substituteTeacherName ?? "")
    ]);

  autoTable(doc, {
    startY: 26,
    head: [["Period", "Time", "Class", "Absent Teacher", "Substitute Teacher"]],
    body:
      rows.length > 0
        ? rows
        : [["—", "—", "—", "No substitutions recorded", "—"]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 32 },
      2: { cellWidth: 22 },
      3: { cellWidth: 38 },
      4: { cellWidth: 38 }
    },
    margin: { left: margin, right: margin }
  });

  const pageH = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`-- ${i} of ${total} --`, pageW / 2, pageH - 8, { align: "center" });
  }

  return doc.output("blob");
}

/**
 * @param {object} opts
 * @param {Array} opts.substitutions
 * @param {string} [opts.filename] — optional; default uses today’s date
 */
export function downloadSubstitutionPdf({ substitutions, filename }) {
  const today = todayDate();
  const blob = buildSubstitutionPdfBlob({ substitutions });
  const dd = String(today.getDate()).padStart(2, "0");
  const mon = MONTHS[today.getMonth()];
  const y = today.getFullYear();
  const name = filename || `${dd} ${mon} ${y} Substitutions.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
