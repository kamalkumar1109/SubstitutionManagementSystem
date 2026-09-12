import React, { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import Modal from "./Modal.jsx";

function teacherName(teacher) {
  return teacher?.name || "";
}

function TeacherSearch({ id, label, teachers, value, onSelect }) {
  const [q, setQ] = useState("");
  const selected = teachers.find((t) => String(t._id) === String(value)) || null;
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return teachers;
    return teachers.filter((t) => teacherName(t).toLowerCase().includes(needle));
  }, [teachers, q]);

  return (
    <div className="site-form-field">
      <label htmlFor={id}>{label}</label>
      {selected ? (
        <div className="tt-search-picked">
          <strong>{teacherName(selected)}</strong>
          <button type="button" className="site-btn site-btn-text" onClick={() => onSelect("")}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            id={id}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search teacher..."
            autoComplete="off"
          />
          {matches.length ? (
            <ul className="tt-search-suggest">
              {matches.map((t) => (
                <li key={t._id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(t._id);
                      setQ("");
                    }}
                  >
                    {teacherName(t)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="app-muted">No matching teachers.</p>
          )}
        </>
      )}
    </div>
  );
}

function cellLabel(entry) {
  if (!entry || entry.free) return "Free";
  const subject = entry.subjectName || entry.subjectId?.name || "";
  const teacher = entry.teacherName || entry.teacherId?.name || "";
  return [subject, teacher].filter(Boolean).join(" — ") || "Assigned";
}

export default function SwapModal({ onClose, onDone, dateKey, timetableId, classes: scopedClasses, teachers: scopedTeachers }) {
  const [classes, setClasses] = useState(scopedClasses || []);
  const [sections, setSections] = useState([]);
  const [teachers, setTeachers] = useState(scopedTeachers || []);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [grid, setGrid] = useState(null);
  const [selected, setSelected] = useState(null);
  const [replacementTeacherId, setReplacementTeacherId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      scopedClasses ? Promise.resolve({ classes: scopedClasses }) : apiRequest("/api/catalog/classes"),
      apiRequest("/api/catalog/sections"),
      scopedTeachers ? Promise.resolve({ teachers: scopedTeachers }) : apiRequest("/api/teachers")
    ])
      .then(([c, s, t]) => {
        const classRows = c.classes || scopedClasses || [];
        setClasses(classRows);
        setSections(s.sections || []);
        const teacherRows = t.teachers || scopedTeachers || [];
        const allowed = new Set((scopedTeachers || teacherRows).map((row) => String(row._id)));
        setTeachers(
          teacherRows.filter(
            (row) =>
              row.active !== false &&
              (!row.employmentStatus || row.employmentStatus === "ACTIVE") &&
              (!allowed.size || allowed.has(String(row._id)))
          )
        );
      })
      .catch((err) => setError(err.message));
  }, []);

  const sectionOptions = useMemo(
    () => sections.filter((row) => String(row.classId?._id || row.classId) === String(classId)),
    [sections, classId]
  );

  useEffect(() => {
    if (!classId || !sectionId) {
      setGrid(null);
      setSelected(null);
      return;
    }
    const params = new URLSearchParams({
      classId,
      sectionId,
      date: dateKey || ""
    });
    if (timetableId) params.set("timetableId", timetableId);
    apiRequest(`/api/timetables/swaps/class-grid?${params}`)
      .then(setGrid)
      .catch((err) => setError(err.message));
  }, [classId, sectionId, dateKey, timetableId]);

  async function confirm(e) {
    e.preventDefault();
    if (!selected || !replacementTeacherId) {
      setError("Select a period cell and a teacher.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/timetables/swaps", {
        method: "POST",
        body: JSON.stringify({
          date: dateKey || grid?.dateKey,
          period: Number(selected.period),
          classId,
          sectionId,
          replacementTeacherId,
          timetableId: grid?.timetable?._id || timetableId
        })
      });
      onDone("Swap saved for this day. The master timetable was not changed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Swap periods" onClose={onClose}>
      <form className="site-form" onSubmit={confirm}>
        <div className="site-form-field">
          <label htmlFor="swap-class">Class</label>
          <select
            id="swap-class"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
              setSelected(null);
            }}
            required
          >
            <option value="">Select</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="site-form-field">
          <label htmlFor="swap-section">Section</label>
          <select
            id="swap-section"
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setSelected(null);
            }}
            required
            disabled={!classId}
          >
            <option value="">Select</option>
            {sectionOptions.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {grid ? (
          <div className="app-table-wrap">
            <table className="app-table swap-grid">
              <thead>
                <tr>
                  <th>Day</th>
                  {(grid.periods || []).map((period) => (
                    <th key={period}>Period {period}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(grid.daysSchedule || []).map((row) => (
                  <tr key={row.dayOfWeek} className={row.dayOfWeek === grid.dayOfWeek ? "is-today" : ""}>
                    <th>{row.dayOfWeek}</th>
                    {(row.periods || []).map((cell) => {
                      const entry = (cell.entries && cell.entries[0]) || cell;
                      const isToday = row.dayOfWeek === grid.dayOfWeek;
                      const active =
                        selected &&
                        selected.day === row.dayOfWeek &&
                        Number(selected.period) === Number(cell.period);
                      return (
                        <td key={cell.period}>
                          <button
                            type="button"
                            className={`swap-cell${active ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                            disabled={!isToday}
                            onClick={() =>
                              setSelected({
                                day: row.dayOfWeek,
                                period: cell.period,
                                teacherId: entry.teacherId?._id || entry.teacherId
                              })
                            }
                          >
                            {cellLabel(entry)}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {selected ? (
          <TeacherSearch
            id="swap-teacher"
            label="Select Teacher"
            teachers={teachers.filter((t) => String(t._id) !== String(selected.teacherId))}
            value={replacementTeacherId}
            onSelect={setReplacementTeacherId}
          />
        ) : null}
        {error ? (
          <p className="site-alert site-alert-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="app-modal-actions">
          <button type="button" className="site-btn site-btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="site-btn site-btn-primary" disabled={busy || !selected || !replacementTeacherId}>
            {busy ? "Saving…" : "SWAP"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
