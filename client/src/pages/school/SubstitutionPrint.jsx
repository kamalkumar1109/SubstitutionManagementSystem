import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../../utils/apiClient";
import FinalSubstitutionSheet from "../../components/app/FinalSubstitutionSheet.jsx";

export default function SubstitutionPrint() {
  const [params] = useSearchParams();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const timetableId = params.get("timetableId");
        const qs = timetableId ? `?timetableId=${encodeURIComponent(timetableId)}` : "";
        const data = await apiRequest(`/api/substitutions/today${qs}`);
        if (alive) setBoard(data);
      } catch (err) {
        if (alive) setError(err.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params]);

  if (error) {
    return (
      <main className="sub-print-page">
        <p className="site-alert site-alert-error">{error}</p>
      </main>
    );
  }

  if (!board) {
    return (
      <main className="sub-print-page">
        <p className="app-muted">Preparing the substitution sheet…</p>
      </main>
    );
  }

  return (
    <main className="sub-print-page">
      <div className="sub-print-toolbar no-print">
        <button type="button" className="site-btn site-btn-primary" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" className="site-btn site-btn-ghost" onClick={() => window.close()}>
          Close
        </button>
      </div>
      <FinalSubstitutionSheet
        dateKey={board.dateKey}
        dayOfWeek={board.dayOfWeek}
        schoolName={board.schoolName}
        substitutions={board.substitutions || []}
        dayEntries={board.dayEntries || []}
        periodCount={board.periodCount}
        periodStart={board.periodStart}
        roundDuties={board.roundDuties || []}
      />
    </main>
  );
}
