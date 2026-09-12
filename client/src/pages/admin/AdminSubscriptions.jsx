import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { formatWhen, Notice, PageHead, SimpleTable } from "../../components/app/Ui.jsx";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expired", label: "Expired" },
  { id: "expiring-soon", label: "Expiring soon" },
  { id: "pending", label: "Pending" },
  { id: "cancelled", label: "Cancelled" }
];

export default function AdminSubscriptions() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const q = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
        const data = await apiRequest(`/api/admin/subscriptions${q}`);
        if (alive) setRows(data.subscriptions || []);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [filter]);

  return (
    <>
      <PageHead eyebrow="Billing" title="Subscriptions">
        <p>School subscriptions from the live billing records.</p>
      </PageHead>
      <div className="admin-filters" role="tablist" aria-label="Subscription filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`admin-filter${filter === item.id ? " is-active" : ""}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <Notice loading={loading} error={error} />
      {!loading && !error ? (
        <SimpleTable
          empty="No subscriptions match this filter."
          columns={[
            { key: "schoolName", label: "School" },
            { key: "plan", label: "Plan" },
            { key: "billingCycle", label: "Billing cycle" },
            { key: "status", label: "Status" },
            { key: "startDate", label: "Start", render: (row) => formatWhen(row.startDate) },
            { key: "expiryDate", label: "Expiry", render: (row) => formatWhen(row.expiryDate) },
            { key: "paymentStatus", label: "Payment status" }
          ]}
          rows={rows}
        />
      ) : null}
    </>
  );
}
