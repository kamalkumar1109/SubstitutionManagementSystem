const { jsPDF } = require("jspdf");
const {
  defaultSchoolSheetLayout,
  buildFinalSheetRows,
  formatSheetDate,
  formatDayLabel,
  bellForPeriod,
  classCode,
  teacherSheetName,
  listPeriods
} = require("./substitutionSheetLayout");

function dutyRowsFrom(roundDuties) {
  return (roundDuties || [])
    .map((row) => ({
      label: String(row.label || "").trim(),
      byPeriod: row.byPeriod || {}
    }))
    .filter((row) => row.label);
}

function groupAbsentTeachers(substitutions) {
  const map = new Map();
  (substitutions || []).forEach((row) => {
    const key = String(row.absentTeacherId || row.absentTeacherName || "");
    if (!map.has(key)) {
      map.set(key, {
        name: teacherSheetName(row.absentTeacherName),
        byPeriod: {}
      });
    }
    map.get(key).byPeriod[Number(row.period)] = row;
  });
  return [...map.values()];
}

function slotClassLabel(slot) {
  if (!slot) return "";
  if (slot.displayLabel) return String(slot.displayLabel);
  const code = classCode(slot.className, slot.sectionName);
  if (code && code !== "—") return code;
  return "";
}

function periodColumns(periods) {
  const cols = [];
  periods.forEach((period, i) => {
    if (i > 0 && Number(periods[i - 1]) <= 4 && Number(period) >= 5) {
      cols.push({ type: "break" });
    }
    cols.push({ type: "period", period });
  });
  return cols;
}

function wrapName(doc, name, width) {
  return doc.splitTextToSize(String(name || ""), Math.max(width - 1.4, 8)).slice(0, 4);
}

function buildSubstitutionPdfBuffer({
  schoolName,
  dateKey,
  dayOfWeek,
  substitutions,
  dayEntries = [],
  periodCount,
  periodStart,
  roundDuties = [],
  layout = defaultSchoolSheetLayout
}) {
  const doc = new jsPDF({
    orientation: layout.page.orientation,
    unit: layout.page.unit,
    format: layout.page.format
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const periods = listPeriods({ substitutions, dayEntries, periodCount, periodStart });
  const teacherRows = groupAbsentTeachers(substitutions);
  const cols = periodColumns(periods.length ? periods : [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const title = `Date: ${formatSheetDate(dateKey)} ${formatDayLabel(dayOfWeek)} Substitutions`;
  const gridLeft = margin;
  const gridRight = pageW - margin;
  const gridWidth = gridRight - gridLeft;
  const nameCol = 42;
  const breakWidth = 3.2;
  const periodCols = cols.filter((c) => c.type === "period").length || 1;
  const breakCount = cols.filter((c) => c.type === "break").length;
  const periodWidth = (gridWidth - nameCol - breakCount * breakWidth) / periodCols;
  const headerBlock = 18;
  const titleH = 8;
  const footerH = 6;
  const dutyRows = dutyRowsFrom(roundDuties);
  const dutyH = 12;
  const gridTop = margin + titleH;
  const gridBottom = pageH - margin - footerH;
  const bodyHeight = gridBottom - gridTop - headerBlock - dutyRows.length * dutyH;
  const minRow = 11;
  const rows = teacherRows.length ? teacherRows : [{ name: "", byPeriod: {}, empty: true }];
  const rowsPerPage = Math.max(1, Math.floor(bodyHeight / minRow));
  const pages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  function colX(index) {
    let x = gridLeft + nameCol;
    for (let i = 0; i < index; i += 1) {
      x += cols[i].type === "break" ? breakWidth : periodWidth;
    }
    return x;
  }

  function drawPage(pageIndex) {
    if (pageIndex > 0) doc.addPage();
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(gridLeft, gridTop, gridWidth, gridBottom - gridTop);
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.text(title, margin, margin + 5);

    const slice = rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    const lastPage = pageIndex === pages - 1;
    const teacherBand = lastPage ? bodyHeight : gridBottom - gridTop - headerBlock;
    const rowH = slice.length ? teacherBand / Math.max(slice.length, 1) : teacherBand;

    doc.setLineWidth(0.25);
    doc.rect(gridLeft, gridTop, gridWidth, headerBlock);
    doc.line(gridLeft + nameCol, gridTop, gridLeft + nameCol, gridBottom);
    cols.forEach((col, i) => {
      const x = colX(i);
      doc.line(x, gridTop, x, gridBottom);
    });
    doc.line(gridLeft, gridTop + headerBlock, gridRight, gridTop + headerBlock);

    doc.setFont("times", "bold");
    doc.setFontSize(7.2);
    const headerLines = wrapName(doc, "Name of Teacher being Substituted", nameCol);
    let hy = gridTop + 5;
    headerLines.forEach((line) => {
      doc.text(line, gridLeft + 1.2, hy);
      hy += 3.1;
    });

    cols.forEach((col, i) => {
      if (col.type === "break") return;
      const x = colX(i) + periodWidth / 2;
      doc.setFont("times", "bold");
      doc.setFontSize(11);
      doc.text(String(col.period), x, gridTop + 5.2, { align: "center" });
      const bell = bellForPeriod(col.period);
      doc.setFont("times", "normal");
      doc.setFontSize(6);
      if (bell.start) doc.text(bell.start, x, gridTop + 9.6, { align: "center" });
      doc.text("-", x, gridTop + 12, { align: "center" });
      if (bell.end) doc.text(bell.end, x, gridTop + 14.6, { align: "center" });
    });

    let y = gridTop + headerBlock;
    slice.forEach((teacher) => {
      const nextY = y + rowH;
      doc.line(gridLeft, nextY, gridRight, nextY);
      if (!teacher.empty) {
        doc.setFont("times", "bold");
        doc.setFontSize(8);
        const lines = wrapName(doc, teacher.name, nameCol);
        let ty = y + 4.4;
        lines.forEach((line) => {
          doc.text(line, gridLeft + 1.2, ty);
          ty += 3.2;
        });
        cols.forEach((col, i) => {
          if (col.type === "break") return;
          const slot = teacher.byPeriod[col.period];
          if (!slot) return;
          const x = colX(i) + 1;
          const code = slotClassLabel(slot);
          const unassigned =
            !slot.informational &&
            (slot.status === "UNASSIGNED" ||
              !slot.finalSubstituteName ||
              slot.finalSubstituteName === "No suitable substitute available" ||
              slot.finalSubstituteName === "—");
          const sub = unassigned ? "UNASSIGNED" : teacherSheetName(slot.finalSubstituteName || "");
          doc.setFont("times", "bold");
          doc.setFontSize(7);
          if (code) doc.text(doc.splitTextToSize(code, periodWidth - 2).slice(0, 2), x, y + 4.2);
          doc.setFont("times", "normal");
          doc.setFontSize(6);
          if (sub) doc.text(doc.splitTextToSize(sub, periodWidth - 2).slice(0, 3), x, y + 8.2);
        });
      } else {
        doc.setFont("times", "italic");
        doc.setFontSize(9);
        doc.text(layout.emptyMessage, gridLeft + 4, y + 8);
      }
      y = nextY;
    });

    if (lastPage) {
      dutyRows.forEach((duty) => {
        const nextY = y + dutyH;
        doc.line(gridLeft, nextY, gridRight, nextY);
        doc.setFont("times", "bold");
        doc.setFontSize(7.5);
        const labelLines = wrapName(doc, `${duty.label} Round Duty`, nameCol);
        let ly = y + 4;
        labelLines.forEach((line) => {
          doc.text(line, gridLeft + 1.2, ly);
          ly += 3;
        });
        cols.forEach((col, i) => {
          if (col.type === "break") return;
          const name = duty.byPeriod[col.period] || duty.byPeriod[String(col.period)] || "";
          if (!name) return;
          doc.setFont("times", "normal");
          doc.setFontSize(6);
          doc.text(
            doc.splitTextToSize(teacherSheetName(name), periodWidth - 2).slice(0, 3),
            colX(i) + 1,
            y + 5
          );
        });
        y = nextY;
      });
    } else {
      doc.line(gridLeft, gridBottom, gridRight, gridBottom);
    }

    doc.setFont("times", "normal");
    doc.setFontSize(8);
    doc.text(`-- ${pageIndex + 1} of ${pages} --`, pageW / 2, pageH - 3.2, { align: "center" });
    if (schoolName) {
      doc.setFontSize(6);
      doc.text(String(schoolName), margin, pageH - 3.2);
    }
  }

  for (let i = 0; i < pages; i += 1) drawPage(i);
  return Buffer.from(doc.output("arraybuffer"));
}

function pdfFilename({ dateKey }) {
  return `${dateKey || "today"}-final-substitutions.pdf`;
}

module.exports = { buildSubstitutionPdfBuffer, pdfFilename, buildFinalSheetRows };
