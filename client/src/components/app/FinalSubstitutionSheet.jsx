import React from "react";
import { formatDay, formatLongDate } from "../app/Ui.jsx";

function classCode(className, sectionName) {
  const sec = String(sectionName || "").replace(/\s+/g, "");
  if (/^\d/.test(sec) && sec.length <= 4) return sec.toUpperCase();
  const num = String(className || "").replace(/[^0-9]/g, "");
  return `${num}${sec}`.toUpperCase() || className || "";
}

const BELLS = {
  0: ["8:25am", "9:05am"],
  1: ["9:05am", "9:40am"],
  2: ["9:40am", "10:15am"],
  3: ["10:15am", "10.50am"],
  4: ["10.50am", "11:25am"],
  5: ["11.45 am", "12:25pm"],
  6: ["12:25pm", "1.00pm"],
  7: ["1.00pm", "1:35pm"],
  8: ["1:35 pm", "2:10 pm"]
};

function periodsFrom(substitutions, dayEntries, periodCount, periodStart) {
  const count = Number(periodCount) || 0;
  if (count > 0) {
    const start = periodStart === 0 ? 0 : 1;
    return Array.from({ length: count }, (_, i) => start + i);
  }
  const set = new Set();
  (substitutions || []).forEach((row) => set.add(Number(row.period)));
  (dayEntries || []).forEach((row) => set.add(Number(row.period)));
  return [...set].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
}

export default function FinalSubstitutionSheet({
  dateKey,
  dayOfWeek,
  schoolName,
  substitutions = [],
  dayEntries = [],
  periodCount = 8,
  periodStart = 1,
  roundDuties = [],
  onOverride
}) {
  const periods = periodsFrom(substitutions, dayEntries, periodCount, periodStart);
  const teachers = [];
  const seen = new Set();
  substitutions.forEach((row) => {
    const key = String(row.absentTeacherId || row.absentTeacherName);
    if (seen.has(key)) return;
    seen.add(key);
    teachers.push({
      key,
      name: String(row.absentTeacherName || "").toUpperCase(),
      byPeriod: {}
    });
  });
  const byTeacher = new Map(teachers.map((t) => [t.key, t]));
  substitutions.forEach((row) => {
    const key = String(row.absentTeacherId || row.absentTeacherName);
    const t = byTeacher.get(key);
    if (t) t.byPeriod[Number(row.period)] = row;
  });

  const dateLabel = formatLongDate(dateKey).toUpperCase();

  return (
    <section className="sub-print-sheet">
      <header className="sub-sample-head">
        <span>Date {dateLabel}</span>
        <span>{formatDay(dayOfWeek).toUpperCase()}</span>
        <span>Substitutions</span>
      </header>
      <table className="sub-sample-grid">
        <thead>
          <tr>
            <th className="sub-sample-name">Teacher</th>
            {periods.map((period) => (
              <th key={period}>
                <strong>{period}</strong>
                <em>
                  {BELLS[period] ? (
                    <>
                      {BELLS[period][0]}
                      <br />-<br />
                      {BELLS[period][1]}
                    </>
                  ) : null}
                </em>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teachers.length === 0 ? (
            <tr>
              <td colSpan={periods.length + 1}>No substitutions recorded for this date.</td>
            </tr>
          ) : (
            teachers.map((teacher) => (
              <tr key={teacher.key}>
                <th className="sub-sample-name">{teacher.name}</th>
                {periods.map((period) => {
                  const slot = teacher.byPeriod[period];
                  if (!slot) return <td key={period} />;
          const unassigned =
            !slot.informational &&
            (slot.status === "UNASSIGNED" ||
              !slot.finalSubstituteName ||
              slot.finalSubstituteName === "No suitable substitute available");
          const code = slot.displayLabel || classCode(slot.className, slot.sectionName);
          return (
            <td key={period}>
              {onOverride && !slot.informational ? (
                        <button
                          type="button"
                          className="site-btn site-btn-text no-print"
                          onClick={() => onOverride(slot)}
                        >
                          Edit
                        </button>
                      ) : null}
                      <strong>{code}</strong>
                      <span>{unassigned ? "UNASSIGNED" : String(slot.finalSubstituteName).toUpperCase()}</span>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
          {(roundDuties || []).map((duty) => (
            <tr key={duty.label} className="sub-sample-duty">
              <th className="sub-sample-name">{duty.label} Round Duty</th>
              {periods.map((period) => {
                const slot = duty.slots?.[period] || duty.slots?.[String(period)];
                const name = duty.byPeriod?.[period] || duty.byPeriod?.[String(period)] || "";
                return (
                  <td key={period}>
                    {onOverride && slot?._id ? (
                      <button
                        type="button"
                        className="site-btn site-btn-text no-print"
                        onClick={() =>
                          onOverride({
                            ...slot,
                            kind: "ROUND_DUTY",
                            period,
                            className: `${duty.label} Round Duty`,
                            sectionName: "",
                            subjectName: "",
                            absentTeacherName: "Round duty",
                            finalSubstituteName: slot.finalSubstituteName || name
                          })
                        }
                      >
                        Edit
                      </button>
                    ) : null}
                    <span>{name}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {schoolName ? <p className="sub-sample-school">{schoolName}</p> : null}
    </section>
  );
}
