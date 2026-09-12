import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { Flash, Notice, PageHead, SimpleTable } from "../../components/app/Ui.jsx";

const EMPTY = { name: "", billingCycle: "MONTHLY", amount: "", currency: "INR" };

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await apiRequest("/api/admin/plans");
    setPlans(data.plans || []);
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

  async function onCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (form.amount === "" || form.amount == null) {
        throw new Error("Enter the plan amount when pricing is ready.");
      }
      await apiRequest("/api/admin/plans", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          billingCycle: form.billingCycle,
          amount: Number(form.amount),
          currency: form.currency
        })
      });
      setForm(EMPTY);
      setFlash("Plan saved to the catalogue.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead eyebrow="Billing" title="Plans">
        <p>Catalogue amounts are stored on plan records, not in the application source.</p>
      </PageHead>
      <Flash message={flash} />
      <Notice loading={loading} error={error} />
      <form className="site-form app-plan-form" onSubmit={onCreate}>
        <div className="site-form-field">
          <label htmlFor="plan-name">Name</label>
          <input id="plan-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="site-form-field">
          <label htmlFor="plan-cycle">Billing cycle</label>
          <select
            id="plan-cycle"
            className="app-select"
            value={form.billingCycle}
            onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}
          >
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </div>
        <div className="site-form-field">
          <label htmlFor="plan-amount">Amount</label>
          <input
            id="plan-amount"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="Set when pricing is ready"
          />
        </div>
        <div className="site-form-field">
          <label htmlFor="plan-currency">Currency</label>
          <input
            id="plan-currency"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
          />
        </div>
        <button type="submit" className="site-btn site-btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save plan"}
        </button>
      </form>
      <SimpleTable
        empty="No plans defined yet."
        columns={[
          { key: "name", label: "Plan" },
          { key: "billingCycle", label: "Cycle", render: (row) => row.billingCycle || row.interval },
          { key: "amount", label: "Amount" },
          { key: "currency", label: "Currency" },
          { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") }
        ]}
        rows={plans}
      />
    </>
  );
}
