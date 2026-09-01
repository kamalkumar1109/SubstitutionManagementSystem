import React, { useMemo } from "react";
import { PERIODS } from "../data/constants";

function buildTeacherOptions(teachers) {
  return [
    { id: null, label: "NO SUBSTITUTE" },
    ...teachers.map((t) => ({ id: t.id, label: t.name }))
  ];
}

export default function SubstitutionTable({
  day,
  substitutions,
  teachers,
  substitutionCountByTeacherId,
  onOverride
}) {
  const options = useMemo(() => buildTeacherOptions(teachers), [teachers]);

  const rowsByPeriod = useMemo(() => {
    const map = new Map();
    for (const p of PERIODS) map.set(p, []);
    for (const r of substitutions || []) {
      if (!map.has(r.period)) map.set(r.period, []);
      map.get(r.period).push(r);
    }
    return map;
  }, [substitutions]);

  return (
    <div className="card">
      <div className="cardHeader">
        <div>
          <div className="cardTitle">Substitution Sheet</div>
          <div className="cardSub">
            Day: <span className="pillInline">{day}</span>
          </div>
        </div>
        <div className="legend">
          <span className="dot ok" /> Fair
          <span className="dot warn" /> Overloaded
        </div>
      </div>

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Period</th>
              <th style={{ width: 110 }}>Class</th>
              <th>Absent Teacher</th>
              <th>Substitute Teacher</th>
              <th style={{ width: 210 }}>Manual Override</th>
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => {
              const rows = rowsByPeriod.get(p) || [];
              if (rows.length === 0) {
                return (
                  <tr key={p} className="emptyRow">
                    <td className="mono">{p}</td>
                    <td colSpan={4} className="muted">
                      No substitutions in this period
                    </td>
                  </tr>
                );
              }

              return rows.map((r) => {
                const subCount =
                  r.substituteTeacherId != null
                    ? Number(substitutionCountByTeacherId?.[r.substituteTeacherId] || 0)
                    : 0;
                const overloaded = subCount >= 3;

                return (
                  <tr key={r.id}>
                    <td className="mono">{r.period}</td>
                    <td className="strong">{r.className}</td>
                    <td>{r.absentTeacherName}</td>
                    <td>
                      <div className="subCell">
                        <span className={`badge ${overloaded ? "warn" : "ok"}`}>
                          {r.substituteTeacherName}
                        </span>
                        {r.substituteTeacherId != null ? (
                          <span className="muted small">Today: {subCount}</span>
                        ) : (
                          <span className="muted small">{r.reason || ""}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <select
                        className="select"
                        value={r.substituteTeacherId == null ? "" : String(r.substituteTeacherId)}
                        onChange={(e) => {
                          const v = e.target.value;
                          onOverride({
                            day,
                            period: r.period,
                            absentTeacherId: r.absentTeacherId,
                            substituteTeacherId: v === "" ? null : Number(v)
                          });
                        }}
                      >
                        {options.map((o) => (
                          <option
                            key={o.id == null ? "none" : o.id}
                            value={o.id == null ? "" : String(o.id)}
                          >
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

