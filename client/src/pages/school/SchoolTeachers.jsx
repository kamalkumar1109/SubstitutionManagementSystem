import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { Flash, Notice, PageHead } from "../../components/app/Ui.jsx";
import Modal, { ConfirmDialog } from "../../components/app/Modal.jsx";
import TeacherForm from "../../components/app/TeacherForm.jsx";

function names(list) {
  if (!list?.length) return "—";
  return list.map((item) => item.name || item).join(", ");
}

function homeWingName(teacher) {
  const wing = teacher?.homeWingTimetableId;
  if (!wing) return "—";
  return wing.name || "—";
}

function statusLabel(teacher) {
  if (teacher.employmentStatus === "RESIGNED") return "Resigned";
  if (teacher.employmentStatus === "ON_LEAVE") return "On leave";
  if (teacher.employmentStatus === "INACTIVE" || teacher.active === false) return "Inactive";
  return "Active";
}

export default function SchoolTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classGroups, setClassGroups] = useState([]);
  const [timetables, setTimetables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [designation, setDesignation] = useState("");
  const [classGroupId, setClassGroupId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const firstLoad = React.useRef(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const loadCatalog = useCallback(async () => {
    const [subjectRes, groupRes, timetableRes] = await Promise.all([
      apiRequest("/api/catalog/subjects?includeInactive=true"),
      apiRequest("/api/catalog/class-groups?includeInactive=true"),
      apiRequest("/api/timetables")
    ]);
    setSubjects(subjectRes.subjects || []);
    setClassGroups(groupRes.classGroups || []);
    setTimetables(timetableRes.timetables || []);
  }, []);

  const loadTeachers = useCallback(async () => {
    const params = new URLSearchParams({ includeInactive: "true" });
    if (debouncedQ) params.set("q", debouncedQ);
    if (activeFilter) params.set("active", activeFilter);
    if (designation) params.set("designation", designation);
    if (classGroupId) params.set("classGroupId", classGroupId);
    const data = await apiRequest(`/api/teachers?${params.toString()}`);
    setTeachers(data.teachers || []);
  }, [debouncedQ, activeFilter, designation, classGroupId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (firstLoad.current) setLoading(true);
      setError("");
      try {
        const jobs = [loadTeachers()];
        if (firstLoad.current) jobs.unshift(loadCatalog());
        await Promise.all(jobs);
        firstLoad.current = false;
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadCatalog, loadTeachers]);

  const designations = useMemo(() => {
    const set = new Set(teachers.map((t) => t.designation).filter(Boolean));
    return [...set].sort();
  }, [teachers]);

  function openAdd() {
    setEditing(null);
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(teacher) {
    setEditing(teacher);
    setFormError("");
    setFormOpen(true);
  }

  async function saveTeacher(payload) {
    setFormBusy(true);
    setFormError("");
    try {
      if (editing) {
        await apiRequest(`/api/teachers/${editing._id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        setFlash("Teacher details saved.");
      } else {
        await apiRequest("/api/teachers", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setFlash("Teacher added.");
      }
      setFormOpen(false);
      await loadTeachers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormBusy(false);
    }
  }

  async function runDeactivate() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === "activate") {
        await apiRequest(`/api/teachers/${confirm.teacher._id}/activate`, { method: "POST", body: JSON.stringify({}) });
        setFlash("Teacher activated.");
      } else if (confirm.kind === "delete") {
        await apiRequest(`/api/teachers/${confirm.teacher._id}`, { method: "DELETE" });
        setFlash("Teacher deleted.");
      } else {
        await apiRequest(`/api/teachers/${confirm.teacher._id}/deactivate`, {
          method: "POST",
          body: JSON.stringify({ asResigned: confirm.asResigned })
        });
        setFlash(
          confirm.asResigned
            ? "Teacher marked as resigned. Past substitutions are kept."
            : "Teacher deactivated. Past substitutions are kept."
        );
      }
      setConfirm(null);
      await loadTeachers();
    } catch (err) {
      setError(err.message);
      setConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Staff"
        title="Teachers"
        actions={
          <button type="button" className="site-btn site-btn-primary" onClick={openAdd}>
            + Add Teacher
          </button>
        }
      >
        <p>Search and maintain staff for this school only. Name is enough to add someone; details can wait.</p>
      </PageHead>

      <Flash message={flash} />
      <Notice loading={loading} error={error} />

      {!loading && !error ? (
        <>
          <div className="app-toolbar">
            <label className="app-search">
              <span className="visually-hidden">Search teachers</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, employee code, subject, or designation"
              />
            </label>
            <select
              className="app-select"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              aria-label="Active filter"
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <select
              className="app-select"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              aria-label="Designation filter"
            >
              <option value="">All designations</option>
              {designations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className="app-select"
              value={classGroupId}
              onChange={(e) => setClassGroupId(e.target.value)}
              aria-label="Class group filter"
            >
              <option value="">All class groups</option>
              {classGroups
                .filter((g) => g.active !== false)
                .map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </div>

          {teachers.length === 0 ? (
            <div className="app-empty">
              <p>No teachers match these filters yet.</p>
              <button type="button" className="site-btn site-btn-primary" onClick={openAdd}>
                + Add Teacher
              </button>
            </div>
          ) : (
            <>
              <div className="app-table-wrap app-table-desktop">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Teacher name</th>
                      <th>Employee code</th>
                      <th>Designation</th>
                      <th>Home Wing</th>
                      <th>Type</th>
                      <th>Subjects</th>
                      <th>Eligible class groups</th>
                      <th>Employment</th>
                      <th>Active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((row) => (
                      <tr key={row._id}>
                        <td>{row.name}</td>
                        <td>{row.employeeCode || "—"}</td>
                        <td>{row.designation || "—"}</td>
                        <td>{homeWingName(row)}</td>
                        <td>
                          {row.category || "REGULAR"}
                          {row.alternateWeekSchedule ? " · alt. week" : ""}
                        </td>
                        <td>{names(row.subjects)}</td>
                        <td>{names(row.eligibleClassGroups)}</td>
                        <td>{statusLabel(row)}</td>
                        <td>{row.active ? "Active" : "Inactive"}</td>
                        <td>
                          <div className="app-row-actions">
                            <button type="button" className="site-btn site-btn-text" onClick={() => openEdit(row)}>
                              Edit
                            </button>
                            {row.active ? (
                              <>
                                <button
                                  type="button"
                                  className="site-btn site-btn-text"
                                  onClick={() => setConfirm({ teacher: row, asResigned: false, kind: "deactivate" })}
                                >
                                  Deactivate
                                </button>
                                <button
                                  type="button"
                                  className="site-btn site-btn-text"
                                  onClick={() => setConfirm({ teacher: row, asResigned: true, kind: "resign" })}
                                >
                                  Resigned
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="site-btn site-btn-text"
                                onClick={() => setConfirm({ teacher: row, kind: "activate" })}
                              >
                                Activate
                              </button>
                            )}
                            <button
                              type="button"
                              className="site-btn site-btn-text"
                              onClick={() => setConfirm({ teacher: row, kind: "delete" })}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="app-card-list">
                {teachers.map((row) => (
                  <article key={row._id} className="app-card">
                    <h3>{row.name}</h3>
                    <p>{row.employeeCode || "No employee code"} · {row.designation || "No designation"}</p>
                    <p>Home wing: {homeWingName(row)}</p>
                    <p>Subjects: {names(row.subjects)}</p>
                    <p>Eligible groups: {names(row.eligibleClassGroups)}</p>
                    <p>
                      {statusLabel(row)} · {row.active ? "Active" : "Inactive"}
                    </p>
                    <div className="app-row-actions">
                      <button type="button" className="site-btn site-btn-ghost" onClick={() => openEdit(row)}>
                        Edit
                      </button>
                      {row.active ? (
                        <>
                          <button
                            type="button"
                            className="site-btn site-btn-ghost"
                            onClick={() => setConfirm({ teacher: row, asResigned: false, kind: "deactivate" })}
                          >
                            Deactivate
                          </button>
                          <button
                            type="button"
                            className="site-btn site-btn-ghost"
                            onClick={() => setConfirm({ teacher: row, asResigned: true, kind: "resign" })}
                          >
                            Resigned
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="site-btn site-btn-ghost"
                          onClick={() => setConfirm({ teacher: row, kind: "activate" })}
                        >
                          Activate
                        </button>
                      )}
                      <button
                        type="button"
                        className="site-btn site-btn-ghost"
                        onClick={() => setConfirm({ teacher: row, kind: "delete" })}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      ) : null}

      {formOpen ? (
        <Modal title={editing ? "Edit teacher" : "Add teacher"} onClose={() => setFormOpen(false)}>
          <TeacherForm
            key={editing?._id || "new"}
            teacher={editing}
            subjects={subjects}
            classGroups={classGroups}
            timetables={timetables}
            busy={formBusy}
            error={formError}
            onSubmit={saveTeacher}
            onCancel={() => setFormOpen(false)}
          />
        </Modal>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={
            confirm.kind === "activate"
              ? "Activate teacher?"
              : confirm.kind === "delete"
                ? "Delete teacher?"
                : confirm.asResigned
                  ? "Mark as resigned?"
                  : "Deactivate teacher?"
          }
          message={
            confirm.kind === "activate"
              ? `${confirm.teacher.name} will be available for timetable and substitutions again.`
              : confirm.kind === "delete"
                ? `${confirm.teacher.name} will be permanently removed only if they have no timetable or substitution history.`
                : confirm.asResigned
                  ? `${confirm.teacher.name} will not be assigned new substitutions. Previous substitutions and timetable history stay in place.`
                  : `${confirm.teacher.name} will be set inactive and will not receive new substitutions. Records are kept.`
          }
          confirmLabel={
            confirm.kind === "activate"
              ? "Activate"
              : confirm.kind === "delete"
                ? "Delete"
                : confirm.asResigned
                  ? "Mark resigned"
                  : "Deactivate"
          }
          danger={confirm.kind !== "activate"}
          busy={confirmBusy}
          onConfirm={runDeactivate}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}
