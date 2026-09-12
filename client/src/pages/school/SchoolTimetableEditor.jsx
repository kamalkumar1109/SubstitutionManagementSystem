import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../utils/apiClient";
import { Flash, formatDay, Notice, PageHead } from "../../components/app/Ui.jsx";
import Modal, { ConfirmDialog } from "../../components/app/Modal.jsx";
import LessonForm, { classesForTeacher, defaultSubjectId } from "../../components/app/LessonForm.jsx";

const EMPTY_ENTRY = {
  assignmentType: "CLASS",
  teacherId: "",
  subjectId: "",
  classId: "",
  sectionId: "",
  room: "",
  weekPattern: "EVERY",
  combinedLabel: "",
  alternateWeek: false,
  partnerTeacherId: "",
  partnerSubjectId: "",
  followLeadSection: false,
  comment: ""
};

function cellEntries(grid, day, period) {
  const raw = grid?.cells?.[`${day}:${period}`];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function slotItems(slot) {
  if (!slot || slot.free) return [];
  if (Array.isArray(slot.entries) && slot.entries.length) return slot.entries;
  return [slot];
}

function entryHeading(entry) {
  if (!entry || entry.free) return "Free";
  if (entry.displayLabel) return entry.displayLabel;
  return entry.combinedLabel || `${entry.className || ""}${entry.sectionName ? ` ${entry.sectionName}` : ""}`.trim();
}

function slotLabel(entry) {
  if (!entry || entry.free) return "Free";
  const week = entry.weekPattern && entry.weekPattern !== "EVERY" ? ` · ${entry.weekPattern}` : "";
  const comment = entry.comment && !String(entry.displayLabel || "").includes(entry.comment) ? ` · ${entry.comment}` : "";
  return [entryHeading(entry), entry.subjectName, entry.teacherName].filter(Boolean).join(" · ") + week + comment;
}

function teacherOptionLabel(teacher) {
  const subjects = (teacher.subjects || [])
    .map((row) => row?.name || "")
    .filter(Boolean);
  if (!subjects.length) return teacher.name;
  return `${teacher.name} — ${subjects.join(", ")}`;
}

function TeacherCombobox({ teachers, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = teachers.find((t) => String(t._id) === String(value)) || null;
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return teachers;
    return teachers.filter((t) => teacherOptionLabel(t).toLowerCase().includes(needle));
  }, [teachers, q]);

  return (
    <div className="site-form-field">
      <label htmlFor="view-teacher">Teacher</label>
      <input
        id="view-teacher"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        value={open ? q : selected ? teacherOptionLabel(selected) : ""}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        placeholder="Select teacher"
        autoComplete="off"
      />
      {open ? (
        <ul className="tt-search-suggest">
          {matches.length ? (
            matches.map((t) => (
              <li key={t._id}>
                <button
                  type="button"
                  className={String(t._id) === String(value) ? "is-selected" : ""}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(t._id);
                    setQ("");
                    setOpen(false);
                  }}
                >
                  {teacherOptionLabel(t)}
                </button>
              </li>
            ))
          ) : (
            <li>
              <p className="app-muted">No matching teachers.</p>
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

export default function SchoolTimetableEditor() {
  const { timetableId } = useParams();
  const [params, setParams] = useSearchParams();
  const mode = params.get("mode") === "edit" ? "edit" : "view";
  const [grid, setGrid] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [tab, setTab] = useState("grid");
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [teacherView, setTeacherView] = useState(null);
  const [classView, setClassView] = useState(null);
  const [cell, setCell] = useState(null);
  const [form, setForm] = useState(EMPTY_ENTRY);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [periodRows, setPeriodRows] = useState(false);
  const [gridClassId, setGridClassId] = useState("");
  const [gridSectionId, setGridSectionId] = useState("");

  const loadGrid = useCallback(async () => {
    const data = await apiRequest(`/api/timetables/${timetableId}/grid`);
    setGrid(data);
    return data;
  }, [timetableId]);

  const loadTeacherView = useCallback(
    async (id) => {
      if (!id) return;
      const data = await apiRequest(`/api/timetables/${timetableId}/teacher/${id}`);
      setTeacherView(data);
    },
    [timetableId]
  );

  const loadClassView = useCallback(
    async (cid, sid) => {
      if (!cid) return;
      const q = sid ? `?sectionId=${sid}` : "";
      const data = await apiRequest(`/api/timetables/${timetableId}/class/${cid}${q}`);
      setClassView(data);
    },
    [timetableId]
  );

  const refreshViews = useCallback(async () => {
    await loadGrid();
    if (teacherId) await loadTeacherView(teacherId);
    if (classId) await loadClassView(classId, sectionId);
  }, [loadGrid, loadTeacherView, loadClassView, teacherId, classId, sectionId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [g, t, c, s, sub] = await Promise.all([
          apiRequest(`/api/timetables/${timetableId}/grid`),
          apiRequest("/api/teachers"),
          apiRequest("/api/catalog/classes"),
          apiRequest("/api/catalog/sections"),
          apiRequest("/api/catalog/subjects")
        ]);
        if (!alive) return;
        setGrid(g);
        setTeachers(t.teachers || []);
        setClasses(c.classes || []);
        setSections(s.sections || []);
        setSubjects(sub.subjects || []);
        if ((t.teachers || [])[0]) setTeacherId(t.teachers[0]._id);
        if ((c.classes || [])[0]) setClassId(c.classes[0]._id);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [timetableId]);

  const gridSectionOptions = useMemo(() => {
    if (!gridClassId) return [];
    const seen = new Set();
    const rows = [];
    for (const entry of grid?.entries || []) {
      if (String(entry.classId) !== String(gridClassId) || !entry.sectionId) continue;
      const id = String(entry.sectionId);
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({ _id: entry.sectionId, name: entry.sectionName || "" });
    }
    return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [grid, gridClassId]);

  const sectionOptions = useMemo(
    () => sections.filter((row) => String(row.classId?._id || row.classId) === String(classId)),
    [sections, classId]
  );

  useEffect(() => {
    if (sectionOptions[0]) setSectionId(sectionOptions[0]._id);
    else setSectionId("");
  }, [classId, sectionOptions]);

  useEffect(() => {
    if (tab === "teacher" && teacherId) {
      loadTeacherView(teacherId).catch((err) => setError(err.message));
    }
  }, [tab, teacherId, loadTeacherView]);

  useEffect(() => {
    if (tab === "class" && classId) {
      loadClassView(classId, sectionId).catch((err) => setError(err.message));
    }
  }, [tab, classId, sectionId, loadClassView]);

  function openLesson({ day, period, entry = null, lockTeacher = false, lockClass = false, lockSection = false }) {
    if (mode !== "edit") return;
    setFormError("");
    const teacher = teachers.find((t) => t._id === (entry?.teacherId || (lockTeacher ? teacherId : teachers[0]?._id)));
    const nextClass = entry?.classId || (lockClass ? classId : "") || classesForTeacher(teacher, classes)[0]?._id || "";
    const firstSection =
      entry?.sectionId ||
      (lockSection ? sectionId : "") ||
      sections.find((row) => String(row.classId?._id || row.classId) === String(nextClass))?._id ||
      "";
    setCell({ day, period, entry, lockTeacher, lockClass, lockSection });
    setForm(
      entry
        ? {
            assignmentType: entry.assignmentType || "CLASS",
            teacherId: entry.teacherId,
            subjectId: entry.subjectId,
            classId: entry.classId,
            sectionId: entry.sectionId,
            room: entry.room || "",
            weekPattern: entry.weekPattern || "EVERY",
            combinedLabel: entry.combinedLabel || "",
            alternateWeek: false,
            partnerTeacherId: "",
            partnerSubjectId: "",
            followLeadSection: Boolean(entry.followLeadSection),
            comment: entry.comment || ""
          }
        : {
            ...EMPTY_ENTRY,
            teacherId: lockTeacher ? teacherId : teacher?._id || "",
            subjectId: defaultSubjectId(teacher, subjects, ""),
            classId: nextClass,
            sectionId: firstSection
          }
    );
  }

  async function saveEntry(e) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const payload = {
        ...form,
        dayOfWeek: cell.day,
        period: cell.period,
        alternateWeek: form.assignmentType === "CLASS" && form.alternateWeek,
        partnerTeacherId: form.partnerTeacherId || undefined,
        partnerSubjectId: form.partnerSubjectId || undefined,
        followLeadSection: form.assignmentType === "CLASS" && form.followLeadSection
      };
      if (form.assignmentType !== "CLASS") {
        payload.classId = form.classId || null;
        payload.sectionId = form.classId ? form.sectionId || null : null;
      }
      if (form.alternateWeek && form.assignmentType === "CLASS") {
        delete payload.sectionId;
      }
      if (cell.entry?._id) {
        await apiRequest(`/api/timetables/${timetableId}/entries/${cell.entry._id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        setFlash("Lesson updated.");
      } else {
        await apiRequest(`/api/timetables/${timetableId}/entries`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setFlash("Lesson added.");
      }
      setCell(null);
      await refreshViews();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry() {
    setBusy(true);
    setFormError("");
    try {
      await apiRequest(`/api/timetables/${timetableId}/entries/${cell.entry._id}`, { method: "DELETE" });
      setConfirmDelete(false);
      setCell(null);
      setFlash("Lesson removed.");
      await refreshViews();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    setError("");
    try {
      await apiRequest(`/api/timetables/${timetableId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ACTIVE" })
      });
      setFlash("This timetable is now active for its academic session.");
      await refreshViews();
    } catch (err) {
      setError(err.message);
    }
  }

  const tt = grid?.timetable;
  const sessionName = tt?.academicSessionId?.name;
  const canEdit = mode === "edit";

  function renderGridCell(day, period) {
    const entries = cellEntries(grid, day, period).filter((item) => {
      if (gridClassId && String(item.classId) !== String(gridClassId)) return false;
      if (gridSectionId && String(item.sectionId) !== String(gridSectionId)) return false;
      return true;
    });
    if (canEdit) {
      return (
        <div className={`tt-cell${entries.length ? "" : " is-free"}`}>
          {entries.map((item) => (
            <button
              key={item._id}
              type="button"
              className="tt-cell-stack tt-cell-btn"
              onClick={() => openLesson({ day, period, entry: item })}
            >
              <strong>
                {entryHeading(item)}
                {item.weekPattern && item.weekPattern !== "EVERY" ? ` · ${item.weekPattern}` : ""}
              </strong>
              <span>{item.subjectName}</span>
              <span>{item.teacherName}</span>
            </button>
          ))}
          <button type="button" className="tt-cell-add" onClick={() => openLesson({ day, period, entry: null })}>
            {entries.length ? "Add another" : "Add lesson"}
          </button>
        </div>
      );
    }
    if (entries.length) {
      return (
        <div className="tt-cell is-static">
          {entries.map((item) => (
            <span key={item._id} className="tt-cell-stack">
              <strong>
                {entryHeading(item)}
                {item.weekPattern && item.weekPattern !== "EVERY" ? ` · ${item.weekPattern}` : ""}
              </strong>
              <span>{item.subjectName}</span>
              <span>{item.teacherName}</span>
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className="tt-cell is-free is-static">
        <span>Free</span>
      </div>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Schedule"
        title={tt?.name || "Timetable"}
        actions={
          <div className="app-page-actions">
            <Link className="site-btn site-btn-ghost" to="/school/timetable">
              All timetables
            </Link>
            {mode === "view" ? (
              <button type="button" className="site-btn site-btn-primary" onClick={() => setParams({ mode: "edit" })}>
                Edit timetable
              </button>
            ) : (
              <button type="button" className="site-btn site-btn-ghost" onClick={() => setParams({ mode: "view" })}>
                View only
              </button>
            )}
            {tt && tt.status !== "ACTIVE" ? (
              <button type="button" className="site-btn site-btn-primary" onClick={activate}>
                Make active
              </button>
            ) : null}
          </div>
        }
      >
        <p>
          {sessionName ? `Session ${sessionName}` : "Academic session"}
          {tt ? ` · ${tt.status} · ${tt.periodCount} periods starting at ${tt.periodStart === 0 ? 0 : 1}` : ""}
          {canEdit ? " · Add, edit or delete a lesson from any view. All views share the same lessons." : ""}
        </p>
      </PageHead>
      <Flash message={flash} />
      <Notice loading={loading} error={error} />

      <div className="admin-filters" role="tablist">
        <button type="button" className={`admin-filter${tab === "grid" ? " is-active" : ""}`} onClick={() => setTab("grid")}>
          Grid
        </button>
        {tab === "grid" && grid ? (
          <button
            type="button"
            className="admin-filter tt-orient-btn"
            onClick={() => setPeriodRows((v) => !v)}
            aria-label={periodRows ? "Show days as rows" : "Show periods as rows"}
            title={periodRows ? "Switch to days as rows" : "Switch to periods as rows"}
          >
            {periodRows ? "↔" : "↕"}
          </button>
        ) : null}
        <button
          type="button"
          className={`admin-filter${tab === "teacher" ? " is-active" : ""}`}
          onClick={() => setTab("teacher")}
        >
          Teacher timetable
        </button>
        <button
          type="button"
          className={`admin-filter${tab === "class" ? " is-active" : ""}`}
          onClick={() => setTab("class")}
        >
          Class / section
        </button>
      </div>

      {tab === "grid" && grid ? (
        <div className="tt-grid-wrap">
          <div className="site-form-field">
            <label htmlFor="grid-class">All Classes</label>
            <select
              id="grid-class"
              value={gridClassId}
              onChange={(e) => {
                setGridClassId(e.target.value);
                setGridSectionId("");
              }}
            >
              <option value="">Select Class</option>
              {(grid.usedClasses || []).map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {gridClassId ? (
            <div className="site-form-field">
              <label htmlFor="grid-section">Select Section</label>
              <select id="grid-section" value={gridSectionId} onChange={(e) => setGridSectionId(e.target.value)}>
                <option value="">Select Section</option>
                {gridSectionOptions.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <table className="tt-grid">
            {periodRows ? (
              <>
                <thead>
                  <tr>
                    <th>Period</th>
                    {grid.days.map((day) => (
                      <th key={day}>{formatDay(day)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.periods.map((period) => (
                    <tr key={period}>
                      <th scope="row">Period {period}</th>
                      {grid.days.map((day) => (
                        <td key={day}>{renderGridCell(day, period)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th>Day</th>
                    {grid.periods.map((period) => (
                      <th key={period}>Period {period}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.days.map((day) => (
                    <tr key={day}>
                      <th scope="row">{formatDay(day)}</th>
                      {grid.periods.map((period) => (
                        <td key={period}>{renderGridCell(day, period)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      ) : null}

      {tab === "teacher" ? (
        <section className="app-panel">
          <TeacherCombobox teachers={teachers} value={teacherId} onChange={setTeacherId} />
          {teacherView?.daysSchedule?.map((day) => (
            <div key={day.dayOfWeek} className="tt-day-block">
              <h2 className="app-h2">{formatDay(day.dayOfWeek)}</h2>
              <ul className="tt-period-list">
                {day.periods.map((slot) => {
                  const items = slotItems(slot);
                  return (
                    <li key={slot.period}>
                      <strong>P{slot.period}</strong>
                      <span>
                        {items.length
                          ? items.map((item) => (
                              <span key={item._id || `${slot.period}-${item.weekPattern}`} className="tt-slot-line">
                                {slotLabel(item)}
                                {canEdit ? (
                                  <button
                                    type="button"
                                    className="site-btn site-btn-text"
                                    onClick={() =>
                                      openLesson({
                                        day: day.dayOfWeek,
                                        period: slot.period,
                                        entry: item,
                                        lockTeacher: true
                                      })
                                    }
                                  >
                                    Edit
                                  </button>
                                ) : null}
                              </span>
                            ))
                          : "Free"}
                        {canEdit && !items.length ? (
                          <button
                            type="button"
                            className="site-btn site-btn-text"
                            onClick={() =>
                              openLesson({
                                day: day.dayOfWeek,
                                period: slot.period,
                                entry: null,
                                lockTeacher: true
                              })
                            }
                          >
                            Add lesson
                          </button>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "class" ? (
        <section className="app-panel">
          <div className="tt-view-filters">
            <div className="site-form-field">
              <label htmlFor="view-class">Class</label>
              <select id="view-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="site-form-field">
              <label htmlFor="view-section">Section</label>
              <select id="view-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                {sectionOptions.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {classView?.daysSchedule?.map((day) => (
            <div key={day.dayOfWeek} className="tt-day-block">
              <h2 className="app-h2">{formatDay(day.dayOfWeek)}</h2>
              <ul className="tt-period-list">
                {day.periods.map((slot) => {
                  const items = slotItems(slot);
                  return (
                    <li key={slot.period}>
                      <strong>P{slot.period}</strong>
                      <span>
                        {items.length
                          ? items.map((item) => (
                              <span key={item._id || `${slot.period}-${item.weekPattern}`} className="tt-slot-line">
                                {slotLabel(item)}
                                {canEdit ? (
                                  <button
                                    type="button"
                                    className="site-btn site-btn-text"
                                    onClick={() =>
                                      openLesson({
                                        day: day.dayOfWeek,
                                        period: slot.period,
                                        entry: item,
                                        lockClass: true,
                                        lockSection: true
                                      })
                                    }
                                  >
                                    Edit
                                  </button>
                                ) : null}
                              </span>
                            ))
                          : "Free"}
                        {canEdit && !items.length ? (
                          <button
                            type="button"
                            className="site-btn site-btn-text"
                            onClick={() =>
                              openLesson({
                                day: day.dayOfWeek,
                                period: slot.period,
                                entry: null,
                                lockClass: true,
                                lockSection: true
                              })
                            }
                          >
                            Add lesson
                          </button>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {cell ? (
        <Modal title={`${formatDay(cell.day)} · Period ${cell.period}`} onClose={() => setCell(null)}>
          <form className="site-form" onSubmit={saveEntry}>
            <LessonForm
              form={form}
              setForm={setForm}
              teachers={teachers}
              classes={classes}
              sections={sections}
              subjects={subjects}
              lockTeacher={cell.lockTeacher}
              lockClass={cell.lockClass}
              lockSection={cell.lockSection}
              isEdit={Boolean(cell.entry?._id)}
            />
            {formError ? <p className="site-alert site-alert-error">{formError}</p> : null}
            <div className="app-modal-actions">
              {cell.entry?._id ? (
                <button type="button" className="site-btn site-btn-ghost" onClick={() => setConfirmDelete(true)}>
                  Delete lesson
                </button>
              ) : (
                <button type="button" className="site-btn site-btn-ghost" onClick={() => setCell(null)}>
                  Cancel
                </button>
              )}
              <button type="submit" className="site-btn site-btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save lesson"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete lesson"
          message="Remove this lesson from the timetable? It will disappear from the grid, teacher timetable, and class/section view. Past substitution records are not changed."
          confirmLabel="Delete lesson"
          danger
          busy={busy}
          onConfirm={deleteEntry}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
}
