import React, { useEffect, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import Modal from "../app/Modal.jsx";

export default function OverrideModal({ row, onClose, onSaved }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (debounced) params.set("q", debounced);
        const data = await apiRequest(
          `${row.kind === "ROUND_DUTY" ? `/api/substitutions/round-duty/${row._id}/candidates` : `/api/substitutions/${row._id}/candidates`}${
            params.toString() ? `?${params}` : ""
          }`
        );
        if (alive) setCandidates(data.candidates || []);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [row._id, debounced]);

  async function choose(teacherId) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        row.kind === "ROUND_DUTY"
          ? `/api/substitutions/round-duty/${row._id}/override`
          : `/api/substitutions/${row._id}/override`,
        {
        method: "POST",
        body: JSON.stringify({ substituteTeacherId: teacherId, reason })
        }
      );
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={row.kind === "ROUND_DUTY" ? "Override round duty" : "Override substitute"} onClose={onClose}>
      <p className="app-modal-copy">
        Period {row.period} · {row.className} {row.sectionName} {row.subjectName}
        <br />
        {row.kind === "ROUND_DUTY" ? "Round duty" : `Absent: ${row.absentTeacherName}`}. Current: {row.finalSubstituteName}.
      </p>
      <p className="app-muted">Any teacher who is free in this period can be assigned. Class-group eligibility is not applied here.</p>
      <div className="site-form-field">
        <label htmlFor="override-search">Search teacher</label>
        <input
          id="override-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Teacher"
          autoFocus
        />
      </div>
      <div className="site-form-field">
        <label htmlFor="override-reason">Reason (optional)</label>
        <input
          id="override-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      {loading ? <p className="app-muted">Loading valid candidates…</p> : null}
      {error ? (
        <p className="site-alert site-alert-error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && candidates.length === 0 ? (
        <p className="app-muted">No valid candidate matches this search.</p>
      ) : (
        <ul className="app-candidate-list">
          {candidates.map((teacher) => (
            <li key={teacher._id}>
              <div>
                <strong>{teacher.name}</strong>
                <span>{[teacher.employeeCode, teacher.designation].filter(Boolean).join(" · ")}</span>
              </div>
              <button
                type="button"
                className="site-btn site-btn-primary"
                disabled={busy}
                onClick={() => choose(teacher._id)}
              >
                Assign
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="app-modal-actions">
        <button type="button" className="site-btn site-btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
