import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../utils/apiClient";
import { formatMoney, formatWhen, Notice, PageHead, SimpleTable } from "../../components/app/Ui.jsx";
import { setActingSchoolId } from "../../utils/authStorage.js";

export default function AdminSchoolDetail() {
  const { schoolId } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiRequest(`/api/admin/schools/${schoolId}`);
        if (alive) setDetails(data);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [schoolId]);

  const school = details?.school;
  const sub = details?.subscription;

  return (
    <>
      <PageHead
        eyebrow="School account"
        title={school?.name || "School"}
        actions={
          <>
            <button
              type="button"
              className="site-btn site-btn-primary"
              onClick={() => {
                setActingSchoolId(schoolId);
                navigate("/school/substitutions");
              }}
            >
              Open substitution workspace
            </button>
            <Link className="site-btn site-btn-ghost" to="/admin/schools">
              Back to schools
            </Link>
          </>
        }
      >
        <p>Read-only inspection of this school’s records. Other schools are not loaded.</p>
      </PageHead>
      <Notice loading={loading} error={error} />
      {details && school ? (
        <>
          <section className="app-panel">
            <h2 className="app-h2">School information</h2>
            <dl className="app-dl">
              <div>
                <dt>School code</dt>
                <dd>{school.schoolCode}</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>{school.email}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{school.phone || "—"}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{school.timezone}</dd>
              </div>
              <div>
                <dt>Account status</dt>
                <dd>{details.accountStatus}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatWhen(school.createdAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="app-panel">
            <h2 className="app-h2">Current subscription</h2>
            <dl className="app-dl">
              <div>
                <dt>Plan</dt>
                <dd>{sub?.plan || "—"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{sub?.status || "NONE"}</dd>
              </div>
              <div>
                <dt>Billing cycle</dt>
                <dd>{sub?.billingCycle || "—"}</dd>
              </div>
              <div>
                <dt>Start</dt>
                <dd>{formatWhen(sub?.startDate)}</dd>
              </div>
              <div>
                <dt>Expiry</dt>
                <dd>{formatWhen(sub?.expiryDate)}</dd>
              </div>
              <div>
                <dt>Payment status</dt>
                <dd>{sub?.paymentStatus || "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="app-panel">
            <h2 className="app-h2">Academic session</h2>
            {details.academicSession ? (
              <p>
                {details.academicSession.name}
                {details.academicSession.isCurrent ? " · current" : ""}
              </p>
            ) : (
              <p className="app-muted">No current academic session.</p>
            )}
            <p className="app-muted">{details.teachers?.total ?? 0} teachers on this account.</p>
          </section>

          <h2 className="app-h2">Payment history</h2>
          <SimpleTable
            empty="No payments for this school."
            columns={[
              { key: "amount", label: "Amount", render: (row) => formatMoney(row.amount, row.currency) },
              { key: "status", label: "Status" },
              { key: "paidAt", label: "Paid", render: (row) => formatWhen(row.paidAt) },
              { key: "razorpayPaymentId", label: "Razorpay" }
            ]}
            rows={details.payments}
          />

          <h2 className="app-h2">Recent substitution activity</h2>
          <SimpleTable
            empty="No substitution activity recorded."
            columns={[
              { key: "dateKey", label: "Date" },
              { key: "period", label: "Period" },
              { key: "className", label: "Class" },
              { key: "absentTeacherName", label: "Absent" },
              { key: "substituteTeacherName", label: "Cover" },
              { key: "status", label: "Status" }
            ]}
            rows={details.substitutions}
          />
        </>
      ) : null}
    </>
  );
}
