import { apiRequestBlob } from "./apiClient";
import { jsPDF } from "jspdf";

export async function downloadFinalSubstitutionPdf(filename, timetableId) {
  const qs = timetableId ? `?timetableId=${encodeURIComponent(timetableId)}` : "";
  const blob = await apiRequestBlob(`/api/substitutions/today/pdf${qs}`);
  const name = filename || "final-substitutions.pdf";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Legacy in-memory workspace PDF (not the school-scoped final sheet). */
export function downloadSubstitutionPdf({ substitutions = [] } = {}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(13);
  doc.text("Substitution sheet", 14, 16);
  let y = 26;
  doc.setFontSize(9);
  if (!substitutions.length) {
    doc.text("No substitutions recorded.", 14, y);
  } else {
    substitutions.forEach((row) => {
      const line = [
        `P${row.period ?? ""}`,
        row.className || row.class || "",
        row.subjectName || row.subject || "",
        row.absentTeacherName || row.absent || "",
        row.finalSubstituteName || row.substituteTeacherName || row.substitute || ""
      ].join(" · ");
      doc.text(String(line).slice(0, 95), 14, y);
      y += 7;
      if (y > 280) {
        doc.addPage();
        y = 16;
      }
    });
  }
  doc.save("substitutions.pdf");
}
