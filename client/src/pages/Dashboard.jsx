import React, { useEffect, useMemo, useState } from "react";
import TeacherList from "../components/TeacherList.jsx";
import SubstitutionTable from "../components/SubstitutionTable.jsx";
import { DEFAULT_DAY } from "../data/constants";
import {
  fetchTeachers,
  fetchSubstitutions,
  generateSubstitution,
  manualOverride,
  markAttendance,
  resetDay
} from "../utils/api";
import { downloadSubstitutionPdf } from "../utils/substitutionPdf";

export default function Dashboard() {
  const [day] = useState(DEFAULT_DAY);
  const [teachers, setTeachers] = useState([]);
  const [substitutions, setSubstitutions] = useState([]);
  const [subCounts, setSubCounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const absentCount = useMemo(
    () => teachers.filter((t) => t.status === "absent").length,
    [teachers]
  );

  async function refreshAll() {
    const [t, s] = await Promise.all([fetchTeachers(), fetchSubstitutions(day)]);
    setTeachers(t.teachers || []);
    setSubstitutions(s.substitutions || []);
    setSubCounts(s.substitutionCountByTeacherId || {});
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true);
        setError("");
        await refreshAll();
      } catch (e) {
        if (!alive) return;
        setError(e.message || "Failed to load");
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(fn, successMsg) {
    try {
      setBusy(true);
      setError("");
      setToast("");
      const result = await fn();
      if (successMsg) setToast(successMsg);
      return result;
    } catch (e) {
      setError(e.message || "Something went wrong");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <header className="topbar">
        <div>
          <div className="appTitle">School Substitution Management System</div>
          <div className="appSub">
            Day: <span className="pillInline">{day}</span> • Absentees:{" "}
            <span className="pillInline warn">{absentCount}</span>
          </div>
        </div>

        <div className="actions">
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              act(async () => {
                const r = await generateSubstitution(day);
                setSubstitutions(r.substitutions || []);
                setSubCounts(r.substitutionCountByTeacherId || {});
              }, "Substitutions generated")
            }
          >
            Generate Substitution
          </button>

          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              downloadSubstitutionPdf({ substitutions });
            }}
          >
            Download PDF
          </button>

          <button
            className="btn danger"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await resetDay(day);
                await refreshAll();
              }, "Reset done")
            }
          >
            Reset Day
          </button>
        </div>
      </header>

      {(error || toast) && (
        <div className="noticeRow">
          {error ? <div className="notice error">{error}</div> : null}
          {toast ? <div className="notice ok">{toast}</div> : null}
        </div>
      )}

      <main className="grid">
        <TeacherList
          teachers={teachers}
          onToggle={(teacherId, status) =>
            act(async () => {
              await markAttendance(teacherId, status);
              await refreshAll();
            })
          }
        />

        <SubstitutionTable
          day={day}
          substitutions={substitutions}
          teachers={teachers.filter((t) => t.status === "present")}
          substitutionCountByTeacherId={subCounts}
          onOverride={(payload) =>
            act(async () => {
              const r = await manualOverride(payload);
              setSubCounts(r.substitutionCountByTeacherId || {});
              await refreshAll();
            }, "Override saved")
          }
        />
      </main>

      <footer className="footer muted">
        ⒸMVP uses hardcoded data + in-memory substitutions.
      </footer>
    </div>
  );
}

