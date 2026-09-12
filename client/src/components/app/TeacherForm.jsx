import React, { useMemo, useState } from "react";

const EMPTY = {
  name: "",
  employeeCode: "",
  email: "",
  phone: "",
  designation: "",
  category: "REGULAR",
  alternateWeekSchedule: false,
  joiningDate: "",
  employmentStatus: "ACTIVE",
  subjects: [],
  eligibleClassGroups: []
};

function toForm(teacher) {
  if (!teacher) return { ...EMPTY };
  return {
    name: teacher.name || "",
    employeeCode: teacher.employeeCode || "",
    email: teacher.email || "",
    phone: teacher.phone || "",
    designation: teacher.designation || "",
    category: teacher.category || "REGULAR",
    alternateWeekSchedule: Boolean(teacher.alternateWeekSchedule),
    joiningDate: teacher.joiningDate ? String(teacher.joiningDate).slice(0, 10) : "",
    employmentStatus: teacher.employmentStatus || "ACTIVE",
    subjects: (teacher.subjects || []).map((s) => s._id || s),
    eligibleClassGroups: (teacher.eligibleClassGroups || []).map((g) => g._id || g)
  };
}

function toggleId(list, id) {
  const sid = String(id);
  return list.some((x) => String(x) === sid)
    ? list.filter((x) => String(x) !== sid)
    : [...list, id];
}

export default function TeacherForm({ teacher, subjects, classGroups, busy, error, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => toForm(teacher));
  const [localError, setLocalError] = useState("");
  const isEdit = Boolean(teacher);

  const activeSubjects = useMemo(
    () =>
      (subjects || []).filter(
        (s) => s.active !== false || form.subjects.some((id) => String(id) === String(s._id))
      ),
    [subjects, form.subjects]
  );
  const activeGroups = useMemo(
    () =>
      (classGroups || []).filter(
        (g) =>
          g.active !== false ||
          form.eligibleClassGroups.some((id) => String(id) === String(g._id))
      ),
    [classGroups, form.eligibleClassGroups]
  );

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setLocalError("");
    if (!form.name.trim()) {
      setLocalError("Teacher name is required.");
      return;
    }
    onSubmit({
      name: form.name.trim(),
      employeeCode: form.employeeCode.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      designation: form.designation.trim(),
      category: form.category,
      alternateWeekSchedule: form.alternateWeekSchedule === true,
      joiningDate: form.joiningDate || null,
      employmentStatus: form.employmentStatus,
      subjects: form.subjects,
      eligibleClassGroups: form.eligibleClassGroups
    });
  }

  return (
    <form className="site-form" onSubmit={handleSubmit}>
      <p className="app-muted">Only the name is required. Everything else can be completed later.</p>
      <div className="site-form-grid">
        <div className="site-form-field">
          <label htmlFor="teacher-name">Teacher name</label>
          <input
            id="teacher-name"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            autoFocus
          />
        </div>
        <div className="site-form-field">
          <label htmlFor="teacher-code">Employee code</label>
          <input
            id="teacher-code"
            value={form.employeeCode}
            onChange={(e) => setField("employeeCode", e.target.value)}
          />
        </div>
        <div className="site-form-field">
          <label htmlFor="teacher-email">Email</label>
          <input
            id="teacher-email"
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
          />
        </div>
        <div className="site-form-field">
          <label htmlFor="teacher-phone">Phone</label>
          <input
            id="teacher-phone"
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
          />
        </div>
        <div className="site-form-field">
          <label htmlFor="teacher-designation">Designation</label>
          <input
            id="teacher-designation"
            value={form.designation}
            onChange={(e) => setField("designation", e.target.value)}
            placeholder="e.g. Sports Teacher"
          />
        </div>
        <div className="site-form-field">
          <label htmlFor="teacher-category">Teacher type</label>
          <select
            id="teacher-category"
            className="app-select"
            value={form.category}
            onChange={(e) => setField("category", e.target.value)}
          >
            <option value="REGULAR">Regular</option>
            <option value="ACTIVITY">Activity</option>
            <option value="SPORTS">Sports</option>
          </select>
        </div>
        <div className="site-form-field">
          <label htmlFor="teacher-joined">Joining date</label>
          <input
            id="teacher-joined"
            type="date"
            value={form.joiningDate}
            onChange={(e) => setField("joiningDate", e.target.value)}
          />
        </div>
      </div>
      {isEdit ? (
        <div className="site-form-field">
          <label htmlFor="teacher-status">Employment status</label>
          <select
            id="teacher-status"
            className="app-select"
            value={form.employmentStatus}
            onChange={(e) => setField("employmentStatus", e.target.value)}
          >
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="INACTIVE">Inactive</option>
            <option value="RESIGNED">Resigned</option>
          </select>
        </div>
      ) : null}

      <fieldset className="app-fieldset">
        <legend>Alternate-week timetable</legend>
        <label>
          <input
            type="checkbox"
            checked={form.alternateWeekSchedule}
            onChange={(e) => setField("alternateWeekSchedule", e.target.checked)}
          />
          This teacher has an alternate-week schedule
        </label>
        <p className="app-muted">
          Use this for activity or sports teachers who swap sections on odd and even academic weeks.
        </p>
      </fieldset>

      <fieldset className="app-fieldset">
        <legend>Subjects</legend>
        {activeSubjects.length === 0 ? (
          <p className="app-muted">No subjects yet. Add them under Subjects first.</p>
        ) : (
          <div className="app-check-grid">
            {activeSubjects.map((s) => (
              <label key={s._id}>
                <input
                  type="checkbox"
                  checked={form.subjects.some((id) => String(id) === String(s._id))}
                  onChange={() => setField("subjects", toggleId(form.subjects, s._id))}
                />
                {s.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="app-fieldset">
        <legend>Eligible class groups</legend>
        {activeGroups.length === 0 ? (
          <p className="app-muted">No class groups yet. Add them under Classes first.</p>
        ) : (
          <div className="app-check-grid">
            {activeGroups.map((g) => (
              <label key={g._id}>
                <input
                  type="checkbox"
                  checked={form.eligibleClassGroups.some((id) => String(id) === String(g._id))}
                  onChange={() =>
                    setField("eligibleClassGroups", toggleId(form.eligibleClassGroups, g._id))
                  }
                />
                {g.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {localError || error ? (
        <p className="site-alert site-alert-error" role="alert">
          {localError || error}
        </p>
      ) : null}

      <div className="app-modal-actions">
        <button type="button" className="site-btn site-btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="site-btn site-btn-primary" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Add teacher"}
        </button>
      </div>
    </form>
  );
}
