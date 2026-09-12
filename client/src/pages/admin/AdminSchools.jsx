import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../utils/apiClient";
import { Flash, formatWhen, Notice, PageHead } from "../../components/app/Ui.jsx";
import Modal, { ConfirmDialog } from "../../components/app/Modal.jsx";

const EMPTY_CREATE = {
  name: "",
  schoolCode: "",
  managerName: "",
  managerEmail: "",
  phone: "",
  address: "",
  planId: "",
  active: true,
  password: ""
};

export default function AdminSchools() {
  const [rows, setRows] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  async function load() {
    const [schoolData, planData] = await Promise.all([
      apiRequest("/api/admin/schools"),
      apiRequest("/api/admin/plans")
    ]);
    setRows(schoolData.schools || []);
    setPlans(planData.plans || []);
  }

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
  }, []);

  async function applyStatus(row, active) {
    setBusyId(row.schoolId);
    setError("");
    try {
      await apiRequest(`/api/admin/schools/${row.schoolId}/${active ? "activate" : "deactivate"}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await load();
      setFlash(`${row.name} is now ${active ? "active" : "inactive"}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
      setConfirm(null);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    setBusyId(editing.schoolId);
    setError("");
    try {
      await apiRequest(`/api/admin/schools/${editing.schoolId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editing.name,
          email: editing.email,
          phone: editing.phone,
          address: editing.address,
          timezone: editing.timezone
        })
      });
      setEditing(null);
      await load();
      setFlash("School details saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function saveCreate(e) {
    e.preventDefault();
    setCreateBusy(true);
    setError("");
    try {
      await apiRequest("/api/admin/schools", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name,
          schoolCode: createForm.schoolCode,
          email: createForm.managerEmail,
          phone: createForm.phone,
          address: createForm.address,
          active: createForm.active,
          planId: createForm.planId || null,
          manager: {
            name: createForm.managerName,
            email: createForm.managerEmail,
            password: createForm.password
          }
        })
      });
      setCreating(false);
      setCreateForm(EMPTY_CREATE);
      await load();
      setFlash("School and school manager account created.");
    } catch (err) {
      setError(err.message);
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Tenants"
        title="Schools"
        actions={
          <button
            type="button"
            className="site-btn site-btn-primary"
            onClick={() => {
              setError("");
              setCreating(true);
            }}
          >
            + Add School
          </button>
        }
      >
        <p>Inspect and maintain school accounts. Edits apply only to the selected school.</p>
      </PageHead>
      <Flash message={flash} />
      <Notice loading={loading} error={error} />
      {!loading ? (
        rows.length === 0 ? (
          <p className="app-muted">No schools on the platform yet.</p>
        ) : (
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th>School</th>
                  <th>School code</th>
                  <th>Contact</th>
                  <th>Subscription</th>
                  <th>Status</th>
                  <th>Expiry</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.schoolId}>
                    <td>{row.name}</td>
                    <td>{row.schoolCode}</td>
                    <td>{row.contact}</td>
                    <td>{row.status}</td>
                    <td>{row.active ? "Active" : "Inactive"}</td>
                    <td>{formatWhen(row.expiryDate)}</td>
                    <td>{formatWhen(row.createdAt)}</td>
                    <td className="admin-row-actions">
                      <Link className="site-btn site-btn-text" to={`/admin/schools/${row.schoolId}`}>
                        View
                      </Link>
                      <button type="button" className="site-btn site-btn-text" onClick={() => setEditing(row)}>
                        Edit
                      </button>
                      {row.active ? (
                        <button
                          type="button"
                          className="site-btn site-btn-text"
                          disabled={busyId === row.schoolId}
                          onClick={() => setConfirm({ row, active: false })}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="site-btn site-btn-text"
                          disabled={busyId === row.schoolId}
                          onClick={() => setConfirm({ row, active: true })}
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {creating ? (
        <Modal
          title="Add School"
          onClose={() => {
            if (!createBusy) {
              setCreating(false);
              setCreateForm(EMPTY_CREATE);
            }
          }}
        >
          <form className="site-form" onSubmit={saveCreate}>
            <div className="site-form-field">
              <label htmlFor="create-name">School Name</label>
              <input
                id="create-name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                required
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="create-code">School Code</label>
              <input
                id="create-code"
                value={createForm.schoolCode}
                onChange={(e) => setCreateForm({ ...createForm, schoolCode: e.target.value })}
                required
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="create-manager">School Manager Name</label>
              <input
                id="create-manager"
                value={createForm.managerName}
                onChange={(e) => setCreateForm({ ...createForm, managerName: e.target.value })}
                required
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="create-email">School Manager Email</label>
              <input
                id="create-email"
                type="email"
                value={createForm.managerEmail}
                onChange={(e) => setCreateForm({ ...createForm, managerEmail: e.target.value })}
                required
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="create-phone">Phone Number</label>
              <input
                id="create-phone"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="create-address">Address</label>
              <input
                id="create-address"
                value={createForm.address}
                onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="create-plan">Subscription Plan</label>
              <select
                id="create-plan"
                className="app-select"
                value={createForm.planId}
                onChange={(e) => setCreateForm({ ...createForm, planId: e.target.value })}
              >
                <option value="">No plan</option>
                {plans
                  .filter((plan) => plan.active)
                  .map((plan) => (
                    <option key={plan._id} value={plan._id}>
                      {plan.name} ({plan.billingCycle})
                    </option>
                  ))}
              </select>
            </div>
            <div className="site-form-field">
              <label htmlFor="create-status">Account Status</label>
              <select
                id="create-status"
                className="app-select"
                value={createForm.active ? "ACTIVE" : "INACTIVE"}
                onChange={(e) => setCreateForm({ ...createForm, active: e.target.value === "ACTIVE" })}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div className="site-form-field">
              <label htmlFor="create-password">Initial Password</label>
              <input
                id="create-password"
                type="password"
                autoComplete="new-password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                required
              />
            </div>
            <div className="app-modal-actions">
              <button
                type="button"
                className="site-btn site-btn-ghost"
                onClick={() => {
                  setCreating(false);
                  setCreateForm(EMPTY_CREATE);
                }}
                disabled={createBusy}
              >
                Cancel
              </button>
              <button type="submit" className="site-btn site-btn-primary" disabled={createBusy}>
                {createBusy ? "Creating…" : "Create School"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing ? (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <form className="site-form" onSubmit={saveEdit}>
            <div className="site-form-field">
              <label htmlFor="edit-name">School</label>
              <input
                id="edit-name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="edit-email">Contact email</label>
              <input
                id="edit-email"
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                required
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="edit-phone">Phone</label>
              <input
                id="edit-phone"
                value={editing.phone || ""}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="edit-address">Address</label>
              <input
                id="edit-address"
                value={editing.address || ""}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
            </div>
            <div className="site-form-field">
              <label htmlFor="edit-tz">Timezone</label>
              <input
                id="edit-tz"
                value={editing.timezone || "Asia/Kolkata"}
                onChange={(e) => setEditing({ ...editing, timezone: e.target.value })}
              />
            </div>
            <div className="app-modal-actions">
              <button type="button" className="site-btn site-btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="site-btn site-btn-primary" disabled={busyId === editing.schoolId}>
                Save
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.active ? "Activate School?" : "Deactivate School?"}
          message={
            confirm.active
              ? "This will restore access to this school's account."
              : "This will prevent this school's users from accessing the system. Their data will be preserved."
          }
          confirmLabel={confirm.active ? "Activate" : "Deactivate"}
          danger={!confirm.active}
          busy={busyId === confirm.row.schoolId}
          onConfirm={() => applyStatus(confirm.row, confirm.active)}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}
