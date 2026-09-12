import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { Notice, PageHead } from "../../components/app/Ui.jsx";

export default function AdminSettings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await apiRequest("/api/admin/settings");
        if (alive) setData(result);
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

  const settings = data?.settings || {};
  const admin = data?.admin || {};

  return (
    <>
      <PageHead eyebrow="Platform" title="Settings">
        <p>Operational flags for the owner account. Secrets are never shown here.</p>
      </PageHead>
      <Notice loading={loading} error={error} />
      {data ? (
        <dl className="app-dl">
          <div>
            <dt>Signed in as</dt>
            <dd>
              {admin.name} · {admin.email}
            </dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{admin.role}</dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>{settings.environment}</dd>
          </div>
          <div>
            <dt>Subscription enforcement</dt>
            <dd>{settings.enforcementEnabled ? "On" : "Off"}</dd>
          </div>
          <div>
            <dt>Razorpay</dt>
            <dd>{settings.razorpayConfigured ? "Keys configured" : "Not configured"}</dd>
          </div>
          <div>
            <dt>Session length</dt>
            <dd>{settings.jwtExpiresIn}</dd>
          </div>
        </dl>
      ) : null}
    </>
  );
}
