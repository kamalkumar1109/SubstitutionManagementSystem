import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { MetricGrid, Notice, PageHead, formatDateKey, formatDay } from "../../components/app/Ui.jsx";

export default function SchoolDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiRequest("/api/schools/current/dashboard");
        if (alive) setDashboard(data.dashboard);
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

  const summary = dashboard?.summary || {};

  return (
    <>
      <PageHead eyebrow="Today" title={dashboard?.school?.name || "School dashboard"}>
        {dashboard ? (
          <p>
            {formatDay(dashboard.dayOfWeek)} · {formatDateKey(dashboard.dateKey)}
            {dashboard.academicSession
              ? ` · Session ${dashboard.academicSession.name}`
              : " · No current academic session"}
          </p>
        ) : null}
      </PageHead>
      <Notice loading={loading} error={error} />
      {dashboard ? (
        <MetricGrid
          items={[
            { label: "Total teachers", value: summary.totalTeachers },
            { label: "Present", value: summary.present },
            { label: "Absent", value: summary.absent },
            { label: "On duty", value: summary.onDuty },
            { label: "Today’s substitutions", value: summary.substitutionsToday }
          ]}
        />
      ) : null}
    </>
  );
}
