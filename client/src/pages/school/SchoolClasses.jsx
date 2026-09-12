import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { Flash, Notice, PageHead } from "../../components/app/Ui.jsx";
import Modal, { ConfirmDialog } from "../../components/app/Modal.jsx";

const SUGGESTED_GROUPS = [
  { name: "1-2", sortOrder: 1 },
  { name: "3-5", sortOrder: 2 },
  { name: "6-8", sortOrder: 3 },
  { name: "9-10", sortOrder: 4 },
  { name: "11-12", sortOrder: 5 }
];

const EMPTY_GROUP = { name: "", description: "", sortOrder: 0, members: [] };
const EMPTY_CLASS = { name: "", classGroupId: "", gradeNumber: "" };
const EMPTY_SECTION = { name: "", classId: "" };

export default function SchoolClasses() {
  const [groups, setGroups] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    const [g, c, s] = await Promise.all([
      apiRequest("/api/catalog/class-groups?includeInactive=true"),
      apiRequest("/api/catalog/classes?includeInactive=true"),
      apiRequest("/api/catalog/sections?includeInactive=true")
    ]);
    setGroups(g.classGroups || []);
    setClasses(c.classes || []);
    setSections(s.sections || []);
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

  function openModal(next) {
    setFormError("");
    setModal(next);
    if (next.kind === "group") {
      setForm(
        next.item
          ? {
              name: next.item.name,
              description: next.item.description || "",
              sortOrder: next.item.sortOrder || 0,
              members: (next.item.members || []).map((row) => ({
                classId: row.classId?._id || row.classId || "",
                sectionIds: (row.sectionIds || []).map((id) => String(id._id || id))
              }))
            }
          : { ...EMPTY_GROUP, members: [] }
      );
    } else if (next.kind === "class") {
      setForm(
        next.item
          ? {
              name: next.item.name,
              classGroupId: next.item.classGroupId?._id || next.item.classGroupId || "",
              gradeNumber: next.item.gradeNumber ?? ""
            }
          : { ...EMPTY_CLASS, classGroupId: groups.find((g) => g.active)?._id || "" }
      );
    } else {
      setForm(
        next.item
          ? { name: next.item.name, classId: next.item.classId?._id || next.item.classId || "" }
          : { ...EMPTY_SECTION, classId: classes.find((k) => k.active)?._id || "" }
      );
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      if (modal.kind === "group") {
        const payload = {
          name: form.name.trim(),
          description: form.description,
          sortOrder: Number(form.sortOrder) || 0,
          members: (form.members || [])
            .filter((row) => row.classId)
            .map((row) => ({ classId: row.classId, sectionIds: row.sectionIds || [] }))
        };
        if (modal.item) {
          await apiRequest(`/api/catalog/class-groups/${modal.item._id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          });
          setFlash("Class group updated.");
        } else {
          await apiRequest("/api/catalog/class-groups", { method: "POST", body: JSON.stringify(payload) });
          setFlash("Class group added.");
        }
      } else if (modal.kind === "class") {
        const payload = {
          name: form.name.trim(),
          classGroupId: form.classGroupId,
          gradeNumber: form.gradeNumber === "" ? null : Number(form.gradeNumber)
        };
        if (modal.item) {
          await apiRequest(`/api/catalog/classes/${modal.item._id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          });
          setFlash("Class updated.");
        } else {
          await apiRequest("/api/catalog/classes", { method: "POST", body: JSON.stringify(payload) });
          setFlash("Class added.");
        }
      } else {
        const payload = { name: form.name.trim(), classId: form.classId };
        if (modal.item) {
          await apiRequest(`/api/catalog/sections/${modal.item._id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          });
          setFlash("Section updated.");
        } else {
          await apiRequest("/api/catalog/sections", { method: "POST", body: JSON.stringify(payload) });
          setFlash("Section added.");
        }
      }
      setModal(null);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      await apiRequest(confirm.path, { method: confirm.method || "POST", body: JSON.stringify({}) });
      setFlash(confirm.done);
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err.message);
      setConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function addSuggested() {
    setSeeding(true);
    setError("");
    try {
      const existing = new Set(groups.map((g) => g.name.toLowerCase()));
      for (const g of SUGGESTED_GROUPS) {
        if (existing.has(g.name.toLowerCase())) continue;
        await apiRequest("/api/catalog/class-groups", { method: "POST", body: JSON.stringify(g) });
      }
      setFlash("Suggested class groups are now available. You can rename or add others any time.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSeeding(false);
    }
  }

  const titles = {
    group: modal?.item ? "Edit class group" : "Add class group",
    class: modal?.item ? "Edit class" : "Add class",
    section: modal?.item ? "Edit section" : "Add section"
  };

  return (
    <>
      <PageHead eyebrow="Structure" title="Classes & sections">
        <p>
        Class groups can reuse existing classes and selected sections. A class is stored once; it can belong to more than one group.
        </p>
      </PageHead>
      <Flash message={flash} />
      <Notice loading={loading} error={error} />

      {!loading && !error ? (
        <>
          <section className="app-panel">
            <div className="app-panel-head">
              <h2 className="app-h2">Class groups</h2>
              <div className="app-row-actions">
                <button type="button" className="site-btn site-btn-ghost" onClick={addSuggested} disabled={seeding}>
                  {seeding ? "Adding…" : "Add suggested groups"}
                </button>
                <button type="button" className="site-btn site-btn-primary" onClick={() => openModal({ kind: "group" })}>
                  + Add group
                </button>
              </div>
            </div>
            {groups.length === 0 ? (
              <div className="app-empty">
                <p>No class groups yet. Start with the usual bands, or define your own.</p>
              </div>
            ) : (
              <div className="app-table-wrap">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Classes / sections</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g._id}>
                        <td>{g.name}</td>
                        <td>
                          {(g.members || [])
                            .flatMap((row) => (row.sections || []).map((s) => s.name).filter(Boolean))
                            .join(", ") || "—"}
                        </td>
                        <td>{g.active ? "Active" : "Inactive"}</td>
                        <td>
                          <div className="app-row-actions">
                            <button type="button" className="site-btn site-btn-text" onClick={() => openModal({ kind: "group", item: g })}>
                              Edit
                            </button>
                            {g.active ? (
                              <button
                                type="button"
                                className="site-btn site-btn-text"
                                onClick={() =>
                                  setConfirm({
                                    path: `/api/catalog/class-groups/${g._id}/deactivate`,
                                    title: "Deactivate class group?",
                                    message: `${g.name} will no longer be offered for new classes or teacher eligibility.`,
                                    done: "Class group deactivated.",
                                    label: "Deactivate",
                                    danger: true
                                  })
                                }
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="site-btn site-btn-text"
                                onClick={() =>
                                  setConfirm({
                                    path: `/api/catalog/class-groups/${g._id}/activate`,
                                    title: "Activate class group?",
                                    message: `${g.name} will be available again.`,
                                    done: "Class group activated.",
                                    label: "Activate"
                                  })
                                }
                              >
                                Activate
                              </button>
                            )}
                            <button
                              type="button"
                              className="site-btn site-btn-text"
                              onClick={() =>
                                setConfirm({
                                  path: `/api/catalog/class-groups/${g._id}`,
                                  method: "DELETE",
                                  title: "Delete class group?",
                                  message: `${g.name} will be removed only if no classes or teachers depend on it.`,
                                  done: "Class group deleted.",
                                  label: "Delete",
                                  danger: true
                                })
                              }
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
            )}
          </section>

          <section className="app-panel">
            <div className="app-panel-head">
              <h2 className="app-h2">Classes</h2>
              <button
                type="button"
                className="site-btn site-btn-primary"
                onClick={() => openModal({ kind: "class" })}
                disabled={!groups.some((g) => g.active)}
              >
                + Add class
              </button>
            </div>
            {classes.length === 0 ? (
              <p className="app-muted">No classes yet. Add a group first, then Class 7, Class 8, and so on.</p>
            ) : (
              <div className="app-table-wrap">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Group</th>
                      <th>Grade</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((row) => (
                      <tr key={row._id}>
                        <td>{row.name}</td>
                        <td>
                          {(row.classGroups || [])
                            .map((g) => g.name)
                            .filter(Boolean)
                            .join(", ") || row.classGroupId?.name || "—"}
                        </td>
                        <td>{row.gradeNumber ?? "—"}</td>
                        <td>{row.active ? "Active" : "Inactive"}</td>
                        <td>
                          <div className="app-row-actions">
                            <button type="button" className="site-btn site-btn-text" onClick={() => openModal({ kind: "class", item: row })}>
                              Edit
                            </button>
                            {row.active ? (
                              <button
                                type="button"
                                className="site-btn site-btn-text"
                                onClick={() =>
                                  setConfirm({
                                    path: `/api/catalog/classes/${row._id}/deactivate`,
                                    title: "Deactivate class?",
                                    message: `${row.name} will be hidden from new section and timetable setup.`,
                                    done: "Class deactivated.",
                                    label: "Deactivate",
                                    danger: true
                                  })
                                }
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="site-btn site-btn-text"
                                onClick={() =>
                                  setConfirm({
                                    path: `/api/catalog/classes/${row._id}/activate`,
                                    title: "Activate class?",
                                    message: `${row.name} will be available again.`,
                                    done: "Class activated.",
                                    label: "Activate"
                                  })
                                }
                              >
                                Activate
                              </button>
                            )}
                            <button
                              type="button"
                              className="site-btn site-btn-text"
                              onClick={() =>
                                setConfirm({
                                  path: `/api/catalog/classes/${row._id}`,
                                  method: "DELETE",
                                  title: "Delete class?",
                                  message: `${row.name} will be removed only if it has no sections or timetable history.`,
                                  done: "Class deleted.",
                                  label: "Delete",
                                  danger: true
                                })
                              }
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
            )}
          </section>

          <section className="app-panel">
            <div className="app-panel-head">
              <h2 className="app-h2">Sections</h2>
              <button
                type="button"
                className="site-btn site-btn-primary"
                onClick={() => openModal({ kind: "section" })}
                disabled={!classes.some((c) => c.active)}
              >
                + Add section
              </button>
            </div>
            {sections.length === 0 ? (
              <p className="app-muted">No sections yet. Example: 7A, 7B, 7C under Class 7.</p>
            ) : (
              <div className="app-table-wrap">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Section</th>
                      <th>Class</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((row) => (
                      <tr key={row._id}>
                        <td>{row.name}</td>
                        <td>{row.classId?.name || "—"}</td>
                        <td>{row.active ? "Active" : "Inactive"}</td>
                        <td>
                          <div className="app-row-actions">
                            <button type="button" className="site-btn site-btn-text" onClick={() => openModal({ kind: "section", item: row })}>
                              Edit
                            </button>
                            {row.active ? (
                              <button
                                type="button"
                                className="site-btn site-btn-text"
                                onClick={() =>
                                  setConfirm({
                                    path: `/api/catalog/sections/${row._id}/deactivate`,
                                    title: "Deactivate section?",
                                    message: `${row.name} will not be used for new timetable work.`,
                                    done: "Section deactivated.",
                                    label: "Deactivate",
                                    danger: true
                                  })
                                }
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="site-btn site-btn-text"
                                onClick={() =>
                                  setConfirm({
                                    path: `/api/catalog/sections/${row._id}/activate`,
                                    title: "Activate section?",
                                    message: `${row.name} will be available again.`,
                                    done: "Section activated.",
                                    label: "Activate"
                                  })
                                }
                              >
                                Activate
                              </button>
                            )}
                            <button
                              type="button"
                              className="site-btn site-btn-text"
                              onClick={() =>
                                setConfirm({
                                  path: `/api/catalog/sections/${row._id}`,
                                  method: "DELETE",
                                  title: "Delete section?",
                                  message: `${row.name} will be removed only if it has no timetable or substitution history.`,
                                  done: "Section deleted.",
                                  label: "Delete",
                                  danger: true
                                })
                              }
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
            )}
          </section>
        </>
      ) : null}

      {modal ? (
        <Modal title={titles[modal.kind]} onClose={() => setModal(null)}>
          <form className="site-form" onSubmit={submit}>
            {modal.kind === "group" ? (
              <>
                <div className="site-form-field">
                  <label htmlFor="group-name">Group name</label>
                  <input
                    id="group-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. 6-8"
                    autoFocus
                  />
                </div>
                <div className="site-form-field">
                  <label htmlFor="group-desc">Description</label>
                  <input
                    id="group-desc"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="site-form-field">
                  <span>Classes in this group</span>
                  {(form.members || []).map((member, index) => {
                    const classSections = sections.filter(
                      (row) => String(row.classId?._id || row.classId) === String(member.classId)
                    );
                    const selected = new Set((member.sectionIds || []).map(String));
                    const usedClassIds = new Set(
                      (form.members || []).map((row, rowIndex) => (rowIndex === index ? "" : String(row.classId)))
                    );
                    return (
                      <div key={`${member.classId || "new"}-${index}`} className="catalog-member">
                        <div className="site-form-field">
                          <label htmlFor={`group-class-${index}`}>Select existing class</label>
                          <select
                            id={`group-class-${index}`}
                            className="app-select"
                            value={member.classId}
                            onChange={(e) => {
                              const next = [...(form.members || [])];
                              next[index] = { classId: e.target.value, sectionIds: [] };
                              setForm({ ...form, members: next });
                            }}
                          >
                            <option value="">Select a class</option>
                            {classes
                              .filter((c) => c.active || String(c._id) === String(member.classId))
                              .filter((c) => !usedClassIds.has(String(c._id)) || String(c._id) === String(member.classId))
                              .map((c) => (
                                <option key={c._id} value={c._id}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        {member.classId ? (
                          <div className="site-form-field">
                            <div className="app-row-actions">
                              <label>Select sections of {classes.find((c) => String(c._id) === String(member.classId))?.name || "this class"}</label>
                              <button
                                type="button"
                                className="site-btn site-btn-text"
                                onClick={() => {
                                  const next = [...(form.members || [])];
                                  next[index] = {
                                    ...member,
                                    sectionIds: classSections.map((row) => String(row._id))
                                  };
                                  setForm({ ...form, members: next });
                                }}
                              >
                                Select all
                              </button>
                            </div>
                            <div className="catalog-section-list">
                              {classSections.length === 0 ? (
                                <p className="app-muted">This class has no sections yet.</p>
                              ) : (
                                classSections.map((section) => (
                                  <label key={section._id} className="tt-check">
                                    <input
                                      type="checkbox"
                                      checked={selected.has(String(section._id))}
                                      onChange={() => {
                                        const id = String(section._id);
                                        const sectionIds = selected.has(id)
                                          ? member.sectionIds.filter((value) => String(value) !== id)
                                          : [...(member.sectionIds || []), id];
                                        const next = [...(form.members || [])];
                                        next[index] = { ...member, sectionIds };
                                        setForm({ ...form, members: next });
                                      }}
                                    />
                                    {section.name}
                                  </label>
                                ))
                              )}
                            </div>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="site-btn site-btn-text"
                          onClick={() =>
                            setForm({
                              ...form,
                              members: (form.members || []).filter((_, rowIndex) => rowIndex !== index)
                            })
                          }
                        >
                          Remove class
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="site-btn site-btn-ghost"
                    onClick={() => setForm({ ...form, members: [...(form.members || []), { classId: "", sectionIds: [] }] })}
                    disabled={!classes.some((c) => c.active)}
                  >
                    + Add existing class
                  </button>
                </div>
              </>
            ) : null}
            {modal.kind === "class" ? (
              <>
                <div className="site-form-field">
                  <label htmlFor="class-name">Class name</label>
                  <input
                    id="class-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Class 7"
                    autoFocus
                  />
                </div>
                <div className="site-form-field">
                  <label htmlFor="class-group">Class group</label>
                  <select
                    id="class-group"
                    className="app-select"
                    value={form.classGroupId}
                    onChange={(e) => setForm({ ...form, classGroupId: e.target.value })}
                    required
                  >
                    <option value="">Select a group</option>
                    {groups
                      .filter((g) => g.active || String(g._id) === String(form.classGroupId))
                      .map((g) => (
                        <option key={g._id} value={g._id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="site-form-field">
                  <label htmlFor="class-grade">Grade number (optional)</label>
                  <input
                    id="class-grade"
                    type="number"
                    value={form.gradeNumber}
                    onChange={(e) => setForm({ ...form, gradeNumber: e.target.value })}
                  />
                </div>
              </>
            ) : null}
            {modal.kind === "section" ? (
              <>
                <div className="site-form-field">
                  <label htmlFor="section-name">Section name</label>
                  <input
                    id="section-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. 7A"
                    autoFocus
                  />
                </div>
                <div className="site-form-field">
                  <label htmlFor="section-class">Class</label>
                  <select
                    id="section-class"
                    className="app-select"
                    value={form.classId}
                    onChange={(e) => setForm({ ...form, classId: e.target.value })}
                    required
                  >
                    <option value="">Select a class</option>
                    {classes
                      .filter((c) => c.active || String(c._id) === String(form.classId))
                      .map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            ) : null}
            {formError ? (
              <p className="site-alert site-alert-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="app-modal-actions">
              <button type="button" className="site-btn site-btn-ghost" onClick={() => setModal(null)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="site-btn site-btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.label || "Deactivate"}
          danger={Boolean(confirm.danger)}
          busy={confirmBusy}
          onConfirm={runConfirm}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}
