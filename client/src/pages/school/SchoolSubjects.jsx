import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { Flash, Notice, PageHead } from "../../components/app/Ui.jsx";
import Modal, { ConfirmDialog } from "../../components/app/Modal.jsx";

export default function SchoolSubjects() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [modal, setModal] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await apiRequest("/api/catalog/subjects?includeInactive=true");
    setRows(data.subjects || []);
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

  function openAdd() {
    setModal("add");
    setName("");
    setCode("");
    setFormError("");
  }

  function openEdit(row) {
    setModal(row);
    setName(row.name);
    setCode(row.code || "");
    setFormError("");
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Subject name is required.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const payload = { name: name.trim(), code: code.trim() };
      if (modal === "add") {
        await apiRequest("/api/catalog/subjects", { method: "POST", body: JSON.stringify(payload) });
        setFlash("Subject added.");
      } else {
        await apiRequest(`/api/catalog/subjects/${modal._id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        setFlash("Subject updated.");
      }
      setModal(null);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setActive(row, active) {
    setConfirmBusy(true);
    try {
      await apiRequest(`/api/catalog/subjects/${row._id}/${active ? "activate" : "deactivate"}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setFlash(active ? "Subject activated." : "Subject deactivated.");
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err.message);
      setConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function removeSubject() {
    if (!confirm || confirm.kind !== "delete") return;
    setConfirmBusy(true);
    try {
      await apiRequest(`/api/catalog/subjects/${confirm._id}`, { method: "DELETE" });
      setFlash("Subject deleted.");
      setConfirm(null);
      await load();
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
        eyebrow="Curriculum"
        title="Subjects"
        actions={
          <button type="button" className="site-btn site-btn-primary" onClick={openAdd}>
            + Add subject
          </button>
        }
      >
        <p>Subjects are defined by your school. Mathematics, Sports, Shooting, and anything else you teach.</p>
      </PageHead>
      <Flash message={flash} />
      <Notice loading={loading} error={error} />

      {!loading && !error ? (
        rows.length === 0 ? (
          <div className="app-empty">
            <p>No subjects yet.</p>
            <button type="button" className="site-btn site-btn-primary" onClick={openAdd}>
              + Add subject
            </button>
          </div>
        ) : (
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id}>
                    <td>{row.name}</td>
                    <td>{row.code || "—"}</td>
                    <td>{row.active ? "Active" : "Inactive"}</td>
                    <td>
                      <div className="app-row-actions">
                        <button type="button" className="site-btn site-btn-text" onClick={() => openEdit(row)}>
                          Edit
                        </button>
                        {row.active ? (
                          <button type="button" className="site-btn site-btn-text" onClick={() => setConfirm({ ...row, kind: "deactivate" })}>
                            Deactivate
                          </button>
                        ) : (
                          <button type="button" className="site-btn site-btn-text" onClick={() => setConfirm({ ...row, kind: "activate" })}>
                            Activate
                          </button>
                        )}
                        <button type="button" className="site-btn site-btn-text" onClick={() => setConfirm({ ...row, kind: "delete" })}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {modal ? (
        <Modal title={modal === "add" ? "Add subject" : "Edit subject"} onClose={() => setModal(null)}>
          <form className="site-form" onSubmit={submit}>
            <div className="site-form-field">
              <label htmlFor="subject-name">Subject name</label>
              <input id="subject-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="site-form-field">
              <label htmlFor="subject-code">Code (optional)</label>
              <input id="subject-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
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
          title={
            confirm.kind === "activate"
              ? "Activate subject?"
              : confirm.kind === "delete"
                ? "Delete subject?"
                : "Deactivate subject?"
          }
          message={
            confirm.kind === "activate"
              ? `${confirm.name} will be available when assigning teachers again.`
              : confirm.kind === "delete"
                ? `${confirm.name} will be removed only if no teachers or timetable entries use it.`
                : `${confirm.name} will no longer be offered when assigning teachers. Existing records stay in place.`
          }
          confirmLabel={confirm.kind === "activate" ? "Activate" : confirm.kind === "delete" ? "Delete" : "Deactivate"}
          danger={confirm.kind !== "activate"}
          busy={confirmBusy}
          onConfirm={() => {
            if (confirm.kind === "delete") return removeSubject();
            return setActive(confirm, confirm.kind === "activate");
          }}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}
