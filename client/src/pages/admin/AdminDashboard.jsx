import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { formatMoney, MetricGrid, Notice, PageHead, SimpleTable } from "../../components/app/Ui.jsx";
import AdminChart from "../../components/app/AdminChart.jsx";

export default function AdminDashboard() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiRequest("/api/admin/overview");
        if (alive) setOverview(data.overview);
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

  const m = overview?.metrics || {};
  const analytics = overview?.analytics || {};
  const recent = overview?.recent || {};

  return (
    <>
      <PageHead eyebrow="Platform" title="Admin dashboard">
        <p>Live counts from the database. Nothing on this page is a placeholder.</p>
      </PageHead>
      <Notice loading={loading} error={error} />
      {overview ? (
        <>
          <MetricGrid
            items={[
              { label: "Total schools", value: m.totalSchools },
              { label: "Active schools", value: m.activeSchools },
              { label: "Inactive schools", value: m.inactiveSchools },
              { label: "Total teachers", value: m.totalTeachers },
              { label: "Active subscriptions", value: m.activeSubscriptions },
              { label: "Expired subscriptions", value: m.expiredSubscriptions },
              { label: "Expiring soon", value: m.subscriptionsExpiringSoon },
              { label: "Successful payments", value: m.successfulPayments },
              { label: "Pending payments", value: m.pendingPayments },
              { label: "Failed payments", value: m.failedPayments },
              { label: "Total revenue", value: formatMoney(m.totalRevenue) },
              { label: "Monthly revenue", value: formatMoney(m.monthlyRevenue) },
              { label: "Yearly revenue", value: formatMoney(m.yearlyRevenue) },
              { label: "Total enquiries", value: m.totalEnquiries }
            ]}
          />

          <div className="admin-chart-grid">
            <AdminChart
              title="Schools over time"
              items={analytics.schoolsOverTime}
              labelKey="month"
              valueKey="total"
            />
            <AdminChart
              title="Subscriptions by status"
              items={analytics.subscriptionsByStatus}
              labelKey="status"
              valueKey="count"
            />
            <AdminChart
              title="Revenue over time"
              items={analytics.revenueOverTime}
              labelKey="month"
              valueKey="amount"
              formatValue={(v) => formatMoney(v)}
            />
            <AdminChart
              title="Monthly vs yearly subscriptions"
              items={analytics.monthlyVsYearly}
              labelKey="cycle"
              valueKey="count"
            />
          </div>

          <h2 className="app-h2">Recent schools</h2>
          <SimpleTable
            empty="No schools yet."
            columns={[
              { key: "name", label: "School" },
              { key: "schoolCode", label: "Code" },
              { key: "status", label: "Subscription" },
              { key: "active", label: "Account", render: (row) => (row.active ? "Active" : "Inactive") }
            ]}
            rows={recent.schools}
          />
          <h2 className="app-h2">Recent payments</h2>
          <SimpleTable
            empty="No payments yet."
            columns={[
              { key: "school", label: "School" },
              { key: "amount", label: "Amount", render: (row) => formatMoney(row.amount, row.currency) },
              { key: "status", label: "Status" }
            ]}
            rows={recent.payments}
          />
          <h2 className="app-h2">Recent enquiries</h2>
          <SimpleTable
            empty="No enquiries yet."
            columns={[
              { key: "schoolName", label: "School" },
              { key: "email", label: "Email" },
              { key: "status", label: "Status" }
            ]}
            rows={recent.enquiries}
          />
        </>
      ) : null}
    </>
  );
}
