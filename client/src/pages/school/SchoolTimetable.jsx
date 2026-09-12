import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../utils/apiClient";
import { Flash, formatWhen, Notice, PageHead } from "../../components/app/Ui.jsx";
import Modal, { ConfirmDialog } from "../../components/app/Modal.jsx";

import { periodNumbers, gridDays, DAY_LABELS } from "../../utils/timetableConfig.js";

const STAYBACK_DEFAULTS = {
  staybackEnabled: false,
  staybackDay: "",
  staybackFirstHalfStart: "",
  staybackFirstHalfEnd: "",
  staybackSecondHalfStart: "",
  staybackSecondHalfEnd: ""
};

const EMPTY_SESSION = { name: "", startDate: "", endDate: "", setCurrent: true, periodCount: 8, periodStart: 1, weekDays: 6, firstHalfStart: 1, firstHalfEnd: 4, secondHalfStart: 5, secondHalfEnd: 8, roundDuties: [{ label: "" }], classIds: [], ...STAYBACK_DEFAULTS };
const EMPTY_TT = { name: "", academicSessionId: "", periodCount: 8, periodStart: 1, weekDays: 6, effectiveFrom: "", status: "DRAFT", firstHalfStart: 1, firstHalfEnd: 4, secondHalfStart: 5, secondHalfEnd: 8, roundDuties: [{ label: "" }], classIds: [], ...STAYBACK_DEFAULTS };

function syncHalves(form) {
  const periods = periodNumbers({ periodCount: form.periodCount, periodStart: form.periodStart });
  const mid = Math.ceil(periods.length / 2);
  const first = periods.slice(0, mid);
  const second = periods.slice(mid);
  return {
    ...form,
    firstHalfStart: first[0],
    firstHalfEnd: first[first.length - 1],
    secondHalfStart: (second[0] ?? first[0]),
    secondHalfEnd: (second[second.length - 1] ?? first[first.length - 1])
  };
}

function staybackPayload(form) {
  if (!form.staybackEnabled) return { staybackEnabled: false };
  return {
    staybackEnabled: true,
    staybackDay: form.staybackDay || "",
    staybackFirstHalfStart: form.staybackFirstHalfStart,
    staybackFirstHalfEnd: form.staybackFirstHalfEnd,
    staybackSecondHalfStart: form.staybackSecondHalfStart,
    staybackSecondHalfEnd: form.staybackSecondHalfEnd
  };
}

function PeriodFields({ form, setForm, idPrefix, teachers = [], classGroups = [], classes = [] }) {
  const periods = periodNumbers({ periodCount: form.periodCount, periodStart: form.periodStart });
  return (
    <>
      <div className="site-form-field">
        <label htmlFor={`${idPrefix}-periods`}>Number of periods</label>
        <input
          id={`${idPrefix}-periods`}
          type="number"
          min="1"
          max="16"
          value={form.periodCount}
          onChange={(e) => setForm(syncHalves({ ...form, periodCount: e.target.value }))}
        />
      </div>
      <fieldset className="site-form-field">
        <legend>Should the first period be Period 0 or Period 1?</legend>
        <label className="tt-check">
          <input
            type="radio"
            name={`${idPrefix}-start`}
            checked={Number(form.periodStart) === 0}
            onChange={() => setForm(syncHalves({ ...form, periodStart: 0 }))}
          />
          Start from Period 0
        </label>
        <label className="tt-check">
          <input
            type="radio"
            name={`${idPrefix}-start`}
            checked={Number(form.periodStart) !== 0}
            onChange={() => setForm(syncHalves({ ...form, periodStart: 1 }))}
          />
          Start from Period 1
        </label>
      </fieldset>
      <fieldset className="site-form-field">
        <legend>School timetable days</legend>
        <label className="tt-check">
          <input
            type="radio"
            name={`${idPrefix}-days`}
            checked={Number(form.weekDays) === 5}
            onChange={() => {
              const days = gridDays({ weekDays: 5 });
              setForm({
                ...form,
                weekDays: 5,
                staybackDay: days.includes(form.staybackDay) ? form.staybackDay : ""
              });
            }}
          />
          Monday – Friday (5 days)
        </label>
        <label className="tt-check">
          <input
            type="radio"
            name={`${idPrefix}-days`}
            checked={Number(form.weekDays) !== 5}
            onChange={() => setForm({ ...form, weekDays: 6 })}
          />
          Monday – Saturday (6 days)
        </label>
      </fieldset>
      <div className="site-form-row">
        <div className="site-form-field">
          <label htmlFor={`${idPrefix}-h1s`}>1st half from period</label>
          <select
            id={`${idPrefix}-h1s`}
            value={form.firstHalfStart}
            onChange={(e) => setForm({ ...form, firstHalfStart: Number(e.target.value) })}
          >
            {periods.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="site-form-field">
          <label htmlFor={`${idPrefix}-h1e`}>1st half to period</label>
          <select
            id={`${idPrefix}-h1e`}
            value={form.firstHalfEnd}
            onChange={(e) => setForm({ ...form, firstHalfEnd: Number(e.target.value) })}
          >
            {periods.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="site-form-row">
        <div className="site-form-field">
          <label htmlFor={`${idPrefix}-h2s`}>2nd half from period</label>
          <select
            id={`${idPrefix}-h2s`}
            value={form.secondHalfStart}
            onChange={(e) => setForm({ ...form, secondHalfStart: Number(e.target.value) })}
          >
            {periods.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="site-form-field">
          <label htmlFor={`${idPrefix}-h2e`}>2nd half to period</label>
          <select
            id={`${idPrefix}-h2e`}
            value={form.secondHalfEnd}
            onChange={(e) => setForm({ ...form, secondHalfEnd: Number(e.target.value) })}
          >
            {periods.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="site-form-field">
        <legend>Is there any stayback day in the schedule?</legend>
        <label className="tt-check">
          <input
            type="radio"
            name={`${idPrefix}-stayback`}
            checked={!form.staybackEnabled}
            onChange={() => setForm({ ...form, staybackEnabled: false, staybackDay: "" })}
          />
          NO
        </label>
        <label className="tt-check">
          <input
            type="radio"
            name={`${idPrefix}-stayback`}
            checked={Boolean(form.staybackEnabled)}
            onChange={() => setForm({ ...form, staybackEnabled: true })}
          />
          YES
        </label>
      </fieldset>
      {form.staybackEnabled ? (
        <div className="site-form-field">
          <label htmlFor={`${idPrefix}-stayback-day`}>Which day is stayback day?</label>
          <select
            id={`${idPrefix}-stayback-day`}
            value={form.staybackDay || ""}
            onChange={(e) => {
              const staybackDay = e.target.value;
              setForm({
                ...form,
                staybackDay,
                staybackFirstHalfStart: form.staybackFirstHalfStart || form.firstHalfStart,
                staybackFirstHalfEnd: form.staybackFirstHalfEnd || form.firstHalfEnd,
                staybackSecondHalfStart: form.staybackSecondHalfStart || form.secondHalfStart,
                staybackSecondHalfEnd: form.staybackSecondHalfEnd || form.secondHalfEnd
              });
            }}
          >
            <option value="">Select</option>
            {gridDays({ weekDays: form.weekDays }).map((day) => (
              <option key={day} value={day}>
                {DAY_LABELS[day] || day}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {form.staybackEnabled && form.staybackDay ? (
        <>
          <div className="site-form-row">
            <div className="site-form-field">
              <label htmlFor={`${idPrefix}-sh1s`}>1st half from period</label>
              <select
                id={`${idPrefix}-sh1s`}
                value={form.staybackFirstHalfStart}
                onChange={(e) => setForm({ ...form, staybackFirstHalfStart: Number(e.target.value) })}
              >
                {periods.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="site-form-field">
              <label htmlFor={`${idPrefix}-sh1e`}>1st half to period</label>
              <select
                id={`${idPrefix}-sh1e`}
                value={form.staybackFirstHalfEnd}
                onChange={(e) => setForm({ ...form, staybackFirstHalfEnd: Number(e.target.value) })}
              >
                {periods.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="site-form-row">
            <div className="site-form-field">
              <label htmlFor={`${idPrefix}-sh2s`}>2nd half from period</label>
              <select
                id={`${idPrefix}-sh2s`}
                value={form.staybackSecondHalfStart}
                onChange={(e) => setForm({ ...form, staybackSecondHalfStart: Number(e.target.value) })}
              >
                {periods.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="site-form-field">
              <label htmlFor={`${idPrefix}-sh2e`}>2nd half to period</label>
              <select
                id={`${idPrefix}-sh2e`}
                value={form.staybackSecondHalfEnd}
                onChange={(e) => setForm({ ...form, staybackSecondHalfEnd: Number(e.target.value) })}
              >
                {periods.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      ) : null}
      <fieldset className="site-form-field">
        <legend>Classes on this timetable (optional)</legend>
        <p className="app-muted">Leave empty if this timetable can include any class in the school.</p>
        {(classes || []).map((c) => (
          <label key={c._id} className="tt-check">
            <input
              type="checkbox"
              checked={(form.classIds || []).includes(c._id)}
              onChange={() => {
                const current = form.classIds || [];
                setForm({
                  ...form,
                  classIds: current.includes(c._id) ? current.filter((id) => id !== c._id) : [...current, c._id]
                });
              }}
            />
            {c.name}
          </label>
        ))}
      </fieldset>
      <fieldset className="site-form-field">
        <legend>Round duty areas</legend>
        <p className="app-muted">Optional. Name each area, floor or block that needs round duty. Teachers are assigned when substitutions are generated.</p>
        {((form.roundDuties || []).length ? form.roundDuties : [{ label: "" }]).map((floor, index) => {
          const rows = (form.roundDuties || []).length ? form.roundDuties : [{ label: "" }];
          const isLast = index === rows.length - 1;
          return (
            <div key={index} className="round-duty-row">
              <div className="site-form-field">
                <label htmlFor={`${idPrefix}-floor-${index}`}>Round Duty Area</label>
                <input
                  id={`${idPrefix}-floor-${index}`}
                  value={floor.label}
                  onChange={(e) => {
                    const next = [...rows];
                    next[index] = { label: e.target.value };
                    setForm({ ...form, roundDuties: next });
                  }}
                  placeholder="e.g. Senior Area, Third Floor, Science Block"
                />
              </div>
              <div className="round-duty-row-actions">
                {rows.length > 1 ? (
                  <button
                    type="button"
                    className="site-btn site-btn-ghost round-duty-icon"
                    onClick={() => setForm({ ...form, roundDuties: rows.filter((_, i) => i !== index) })}
                    aria-label="Remove area"
                  >
                    −
                  </button>
                ) : null}
                {isLast ? (
                  <button
                    type="button"
                    className="site-btn site-btn-ghost round-duty-icon"
                    onClick={() => setForm({ ...form, roundDuties: [...rows, { label: "" }] })}
                    aria-label="Add area"
                  >
                    +
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </fieldset>
    </>
  );
}

export default function SchoolTimetable() {
  const [sessions, setSessions] = useState([]);
  const [timetables, setTimetables] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classGroups, setClassGroups] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteRow, setDeleteRow] = useState(null);

  const load = useCallback(async () => {
    const [sess, tt, staff, groups, klass] = await Promise.all([
      apiRequest("/api/academic-sessions"),
      apiRequest("/api/timetables"),
      apiRequest("/api/teachers"),
      apiRequest("/api/catalog/class-groups"),
      apiRequest("/api/catalog/classes")
    ]);
    setSessions(sess.sessions || []);
    setTimetables(tt.timetables || []);
    setTeachers(staff.teachers || []);
    setClassGroups(groups.classGroups || []);
    setClasses(klass.classes || []);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  function openSession() {
    setFormError("");
    setForm({ ...EMPTY_SESSION });
    setModal("session");
  }

  function openTimetable() {
    const current = sessions.find((s) => s.isCurrent) || sessions[0];
    setFormError("");
    setForm({ ...EMPTY_TT, academicSessionId: current?._id || "" });
    setModal("timetable");
  }

  function openEdit(row) {
    setFormError("");
    const next = {
      _id: row._id,
      name: row.name || "",
      academicSessionId: row.academicSessionId?._id || row.academicSessionId || "",
      periodCount: row.periodCount || 8,
      periodStart: row.periodStart === 0 ? 0 : 1,
      weekDays: row.weekDays === 5 ? 5 : 6,
      firstHalfStart: row.firstHalfStart,
      firstHalfEnd: row.firstHalfEnd,
      secondHalfStart: row.secondHalfStart,
      secondHalfEnd: row.secondHalfEnd,
      staybackEnabled: Boolean(row.staybackEnabled),
      staybackDay: row.staybackDay || "",
      staybackFirstHalfStart: row.staybackFirstHalfStart ?? "",
      staybackFirstHalfEnd: row.staybackFirstHalfEnd ?? "",
      staybackSecondHalfStart: row.staybackSecondHalfStart ?? "",
      staybackSecondHalfEnd: row.staybackSecondHalfEnd ?? "",
      classIds: (row.classIds || []).map((id) => id._id || id),
      roundDuties: (row.roundDuties || []).length
        ? (row.roundDuties || []).map((floor) => ({ label: floor.label || "" }))
        : [{ label: "" }],
      effectiveFrom: row.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : "",
      status: row.status || "DRAFT"
    };
    setForm(
      row.firstHalfStart == null || row.secondHalfStart == null ? syncHalves(next) : next
    );
    setModal("edit");
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      if (modal === "session") {
        await apiRequest("/api/academic-sessions", {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            startDate: form.startDate,
            endDate: form.endDate,
            setCurrent: Boolean(form.setCurrent),
            periodCount: Number(form.periodCount) || 8,
            periodStart: Number(form.periodStart) === 0 ? 0 : 1,
            weekDays: Number(form.weekDays) === 5 ? 5 : 6,
            firstHalfStart: Number(form.firstHalfStart),
            firstHalfEnd: Number(form.firstHalfEnd),
            secondHalfStart: Number(form.secondHalfStart),
            secondHalfEnd: Number(form.secondHalfEnd),
            ...staybackPayload(form),
            classIds: form.classIds || [],
            roundDuties: (form.roundDuties || []).filter((row) => String(row.label || "").trim()),
          })
        });
        setFlash("Academic session created with a new empty timetable. Earlier timetables were not changed.");
      } else if (modal === "edit") {
        await apiRequest(`/api/timetables/${form._id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            periodCount: Number(form.periodCount) || 8,
            periodStart: Number(form.periodStart) === 0 ? 0 : 1,
            weekDays: Number(form.weekDays) === 5 ? 5 : 6,
            firstHalfStart: Number(form.firstHalfStart),
            firstHalfEnd: Number(form.firstHalfEnd),
            secondHalfStart: Number(form.secondHalfStart),
            secondHalfEnd: Number(form.secondHalfEnd),
            ...staybackPayload(form),
            classIds: form.classIds || [],
            roundDuties: (form.roundDuties || []).filter((row) => String(row.label || "").trim()),
            effectiveFrom: form.effectiveFrom || null,
            status: form.status
          })
        });
        setFlash("Timetable settings saved.");
      } else {
        await apiRequest("/api/timetables", {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            academicSessionId: form.academicSessionId,
            periodCount: Number(form.periodCount) || 8,
            periodStart: Number(form.periodStart) === 0 ? 0 : 1,
            weekDays: Number(form.weekDays) === 5 ? 5 : 6,
            firstHalfStart: Number(form.firstHalfStart),
            firstHalfEnd: Number(form.firstHalfEnd),
            secondHalfStart: Number(form.secondHalfStart),
            secondHalfEnd: Number(form.secondHalfEnd),
            ...staybackPayload(form),
            classIds: form.classIds || [],
            roundDuties: (form.roundDuties || []).filter((row) => String(row.label || "").trim()),
            effectiveFrom: form.effectiveFrom || null,
            status: form.status
          })
        });
        setFlash("Timetable created.");
      }
      setModal(null);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Schedule"
        title="Timetable"
        actions={
          <div className="app-page-actions">
            <button type="button" className="site-btn site-btn-ghost" onClick={openSession}>
              New academic session
            </button>
            <button type="button" className="site-btn site-btn-primary" onClick={openTimetable}>
              Create timetable
            </button>
          </div>
        }
      >
        <p>
          Each academic session keeps its own timetable. Substitutions read the active timetable for the current
          session and never change these entries.
        </p>
      </PageHead>
      <Flash message={flash} />
      <Notice loading={loading} error={error} />
      {!loading && !error ? (
        timetables.length === 0 ? (
          <p className="app-muted">No timetables yet. Create a session or a timetable to begin.</p>
        ) : (
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Academic session</th>
                  <th>Timetable</th>
                  <th>Status</th>
                  <th>Effective date</th>
                  <th>Periods</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {timetables.map((row) => (
                  <tr key={row._id}>
                    <td>
                      {row.academicSessionId?.name || "—"}
                      {row.academicSessionId?.isCurrent ? " · current" : ""}
                    </td>
                    <td>{row.name}</td>
                    <td>{row.status}</td>
                    <td>{formatWhen(row.effectiveFrom)}</td>
                    <td>
                      {row.periodCount} · start {row.periodStart === 0 ? 0 : 1}
                    </td>
                    <td className="admin-row-actions">
                      <Link className="site-btn site-btn-text" to={`/school/timetable/${row._id}?mode=view`}>
                        View timetable
                      </Link>
                      <Link className="site-btn site-btn-text" to={`/school/timetable/${row._id}?mode=edit`}>
                        Edit lessons
                      </Link>
                      <button type="button" className="site-btn site-btn-text" onClick={() => openEdit(row)}>
                        Edit settings
                      </button>
                      <button type="button" className="site-btn site-btn-danger" onClick={() => setDeleteRow(row)}>
                        Delete timetable
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {modal === "session" ? (
        <Modal title="New academic session" onClose={() => setModal(null)}>
          <p className="app-modal-copy">
            The previous session’s timetable stays as history. A new empty timetable is created for this session.
          </p>
          <form className="site-form" onSubmit={submit}>
            <div className="site-form-field">
              <label htmlFor="sess-name">Session name</label>
              <input
                id="sess-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="sess-start">Start date</label>
              <input
                id="sess-start"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                required
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="sess-end">End date</label>
              <input
                id="sess-end"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                required
              />
            </div>
            <PeriodFields form={form} setForm={setForm} idPrefix="sess" teachers={teachers} classGroups={classGroups} classes={classes} />
            <label className="tt-check">
              <input
                type="checkbox"
                checked={form.setCurrent}
                onChange={(e) => setForm({ ...form, setCurrent: e.target.checked })}
              />
              Make this the current session
            </label>
            {formError ? <p className="site-alert site-alert-error">{formError}</p> : null}
            <div className="app-modal-actions">
              <button type="button" className="site-btn site-btn-ghost" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="site-btn site-btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Create session"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {modal === "timetable" ? (
        <Modal title="Create timetable" onClose={() => setModal(null)}>
          <form className="site-form" onSubmit={submit}>
            <div className="site-form-field">
              <label htmlFor="tt-session">Academic session</label>
              <select
                id="tt-session"
                value={form.academicSessionId}
                onChange={(e) => setForm({ ...form, academicSessionId: e.target.value })}
                required
              >
                <option value="">Select session</option>
                {sessions.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                    {s.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="site-form-field">
              <label htmlFor="tt-name">Timetable name</label>
              <input
                id="tt-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="tt-from">Effective date</label>
              <input
                id="tt-from"
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
              />
            </div>
            <PeriodFields form={form} setForm={setForm} idPrefix="tt" teachers={teachers} classGroups={classGroups} classes={classes} />
            <div className="site-form-field">
              <label htmlFor="tt-status">Status</label>
              <select
                id="tt-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
              </select>
            </div>
            {formError ? <p className="site-alert site-alert-error">{formError}</p> : null}
            <div className="app-modal-actions">
              <button type="button" className="site-btn site-btn-ghost" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="site-btn site-btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Create"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {modal === "edit" ? (
        <Modal title="Edit timetable" onClose={() => setModal(null)}>
          <form className="site-form" onSubmit={submit}>
            <div className="site-form-field">
              <label htmlFor="edit-name">Timetable name</label>
              <input
                id="edit-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="edit-from">Effective date</label>
              <input
                id="edit-from"
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
              />
            </div>
            <PeriodFields form={form} setForm={setForm} idPrefix="edit" teachers={teachers} classGroups={classGroups} classes={classes} />
            <div className="site-form-field">
              <label htmlFor="edit-status">Status</label>
              <select
                id="edit-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
              </select>
            </div>
            {formError ? <p className="site-alert site-alert-error">{formError}</p> : null}
            <div className="app-modal-actions">
              <button type="button" className="site-btn site-btn-ghost" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="site-btn site-btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save settings"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleteRow ? (
        <ConfirmDialog
          title="Delete timetable"
          message={`Delete “${deleteRow.name}”? This permanently removes the timetable and all of its lesson entries. Substitutions already generated for past dates are not changed. This cannot be undone.`}
          confirmLabel="Delete timetable"
          danger
          busy={busy}
          onClose={() => setDeleteRow(null)}
          onConfirm={async () => {
            setBusy(true);
            setError("");
            try {
              await apiRequest(`/api/timetables/${deleteRow._id}`, { method: "DELETE" });
              setDeleteRow(null);
              setFlash("Timetable deleted.");
              await load();
            } catch (err) {
              setError(err.message);
              setDeleteRow(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </>
  );
}
