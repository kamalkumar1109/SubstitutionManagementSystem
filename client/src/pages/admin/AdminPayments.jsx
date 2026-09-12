import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { formatMoney, formatWhen, Notice, PageHead, SimpleTable } from "../../components/app/Ui.jsx";

export default function AdminPayments() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiRequest("/api/admin/payments");
        if (alive) setRows(data.payments || []);
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

  return (
    <>
      <PageHead eyebrow="Billing" title="Payments">
        <p>Gateway references only. Card numbers and other payment secrets are never stored or shown.</p>
      </PageHead>
      <Notice loading={loading} error={error} />
      {!loading && !error ? (
        <SimpleTable
          empty="No payments recorded."
          columns={[
            { key: "school", label: "School" },
            { key: "amount", label: "Amount", render: (row) => formatMoney(row.amount, row.currency) },
            { key: "currency", label: "Currency" },
            { key: "status", label: "Status" },
            { key: "paidAt", label: "Payment date", render: (row) => formatWhen(row.paidAt || row.createdAt) },
            {
              key: "razorpayPaymentId",
              label: "Razorpay reference",
              render: (row) => row.razorpayPaymentId || row.razorpayOrderId || "—"
            },
            { key: "planName", label: "Subscription", render: (row) => row.planName || row.subscriptionStatus || "—" }
          ]}
          rows={rows}
        />
      ) : null}
    </>
  );
}
