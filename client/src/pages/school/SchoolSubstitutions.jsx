import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../utils/apiClient";
import { Flash, Notice, PageHead, formatDay, formatLongDate } from "../../components/app/Ui.jsx";
import OverrideModal from "../../components/app/OverrideModal.jsx";
import SwapModal from "../../components/app/SwapModal.jsx";
import FinalSubstitutionSheet from "../../components/app/FinalSubstitutionSheet.jsx";
import { downloadFinalSubstitutionPdf } from "../../utils/substitutionPdf.js";

const STATUSES = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "ON_DUTY", label: "On duty" },
  { value: "FIRST_HALF_OFF", label: "1st Half Off" },
  { value: "SECOND_HALF_OFF", label: "2nd Half Off" }
];

export default function SchoolSubstitutions() {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [q, setQ] = useState("");
  const [savingId, setSavingId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [overrideRow, setOverrideRow] = useState(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [teachersExpanded, setTeachersExpanded] = useState(false);
  const [timetableId, setTimetableId] = useState("");

  const load = useCallback(async () => {
    const qs = timetableId ? `?timetableId=${encodeURIComponent(timetableId)}` : "";
    const data = await apiRequest(`/api/substitutions/today${qs}`);
    setBoard(data);
  }, [timetableId]);

  useEffect(() => {
    setTeachersExpanded(false);
    setQ("");
  }, [timetableId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
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
  }, [load]);

  const teachers = board?.teachers || [];
  const substitutions = board?.substitutions || [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return teachers;
    return teachers.filter((row) => {
      const t = row.teacher || {};
      return [t.name, t.employeeCode, t.designation]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [teachers, q]);

  const searching = q.trim().length > 0;
  const collapsedLimit = 4;
  const visibleTeachers = searching || teachersExpanded ? filtered : filtered.slice(0, collapsedLimit);
  const canToggleTeachers = !searching && filtered.length > collapsedLimit;

  async function changeStatus(teacherId, status) {
    setSavingId(teacherId);
    setError("");
    try {
      await apiRequest("/api/daily-status", {
        method: "POST",
        body: JSON.stringify({ teacherId, status })
      });
      await load();
      setFlash("Today’s attendance was updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId("");
    }
  }

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const result = await apiRequest("/api/substitutions/generate", {
        method: "POST",
        body: JSON.stringify({ timetableId: timetableId || undefined })
      });
      await load();
      const assigned = result.run?.summary?.assigned ?? 0;
      const unassigned = result.run?.summary?.unassigned ?? 0;
      setFlash(
        unassigned
          ? `Generated ${assigned} assignment${assigned === 1 ? "" : "s"}. ${unassigned} period${unassigned === 1 ? "" : "s"} had no suitable substitute.`
          : `Generated ${assigned} assignment${assigned === 1 ? "" : "s"} for today.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function downloadPdf() {
    setPdfBusy(true);
    setError("");
    try {
      await downloadFinalSubstitutionPdf(
        `${board?.dateKey || "today"}-final-substitutions.pdf`,
        timetableId || board?.timetable?._id
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Substitution management"
        title="Substitution Management"
        actions={
          <div className="app-page-actions">
            <button type="button" className="site-btn site-btn-ghost no-print" onClick={() => setSwapOpen(true)} disabled={!timetableId}>
              Swap
            </button>
            <button
              type="button"
              className="site-btn site-btn-primary no-print"
              onClick={generate}
              disabled={generating || loading || !timetableId}
            >
              {generating ? "Generating…" : "Generate substitution"}
            </button>
          </div>
        }
      >
        {board ? (
          <div className="app-today-stamp">
            <strong>{formatDay(board.dayOfWeek)}</strong>
            <span>{formatLongDate(board.dateKey)}</span>
            {board.weekCount ? (
              <span>
                Week {board.weekCount} ({board.weekParity === "EVEN" ? "Even" : "Odd"})
              </span>
            ) : null}
          </div>
        ) : (
          <p>Today’s cover, in this school’s timezone.</p>
        )}
      </PageHead>

      <Flash message={flash} />
      <Notice loading={loading} error={error} />

      {!loading && !error && board ? (
        <>
          <div className="site-form-field">
            <label htmlFor="sub-tt">Select Timetable</label>
            <select
              id="sub-tt"
              className="app-select"
              value={timetableId}
              onChange={(e) => setTimetableId(e.target.value)}
            >
              <option value="">Select</option>
              {(board.timetables || []).map((tt) => (
                <option key={tt._id} value={tt._id}>
                  {tt.name}
                </option>
              ))}
            </select>
          </div>

          {!timetableId ? (
            <p className="app-muted">Select a timetable to view teachers and generate substitutions.</p>
          ) : !board.timetable ? (
            <p className="site-alert site-alert-error" role="status">
              There is no active timetable for today, so substitutions cannot be generated yet.
            </p>
          ) : null}

          {timetableId && board.timetable ? (
            <>
          <section className="app-panel">
            <div className="app-panel-head">
              <h2 className="app-h2">Teachers today</h2>
            </div>
            <p className="app-muted">
              Everyone starts as Present. Changing status saves for today only and does not edit the staff record.
            </p>
            <div className="app-toolbar app-toolbar-single">
              <label className="app-search">
                <span className="visually-hidden">Search teachers</span>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search teachers"
                />
              </label>
            </div>

            {filtered.length === 0 ? (
              <div className="app-empty">
                <p>{teachers.length === 0 ? "No teachers are assigned to this timetable yet." : "No teachers match that search."}</p>
              </div>
            ) : (
              <>
              <ul className="app-status-list">
                {visibleTeachers.map((row) => (
                  <li key={row.teacher._id}>
                    <div>
                      <strong>{row.teacher.name}</strong>
                      <span>
                        {[row.teacher.employeeCode, row.teacher.designation].filter(Boolean).join(" · ") ||
                          "Active staff"}
                      </span>
                    </div>
                    <label>
                      <span className="visually-hidden">Status for {row.teacher.name}</span>
                      <select
                        className="app-select"
                        value={row.status}
                        disabled={savingId === row.teacher._id}
                        onChange={(e) => changeStatus(row.teacher._id, e.target.value)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
              {canToggleTeachers ? (
                <div className="app-list-more">
                  <button
                    type="button"
                    className="site-btn site-btn-ghost"
                    onClick={() => setTeachersExpanded((open) => !open)}
                  >
                    {teachersExpanded ? "See Less" : "See More"}
                  </button>
                </div>
              ) : null}
              </>
            )}
          </section>

          <section className="app-panel">
            <div className="app-panel-head">
              <h2 className="app-h2">Today’s substitutions</h2>
              <button
                type="button"
                className="site-btn site-btn-ghost no-print"
                onClick={downloadPdf}
                disabled={pdfBusy || loading || !timetableId}
              >
                {pdfBusy ? "Preparing…" : "Download PDF"}
              </button>
            </div>
            <p className="app-muted">
              Generated assignments, swaps and overrides appear in this table. Edit a cell to choose any free teacher.
            </p>
            <FinalSubstitutionSheet
              dateKey={board.dateKey}
              dayOfWeek={board.dayOfWeek}
              schoolName={board.schoolName}
              substitutions={substitutions}
              dayEntries={board.dayEntries || []}
              periodCount={board.periodCount}
              periodStart={board.periodStart}
              roundDuties={board.roundDuties || []}
              onOverride={setOverrideRow}
            />
          </section>
            </>
          ) : null}
        </>
      ) : null}

      {overrideRow ? (
        <OverrideModal
          row={overrideRow}
          onClose={() => setOverrideRow(null)}
          onSaved={async () => {
            setOverrideRow(null);
            setFlash("Substitute updated. The final sheet and PDF now use this assignment.");
            await load();
          }}
        />
      ) : null}
      {swapOpen ? (
        <SwapModal
          onClose={() => setSwapOpen(false)}
          dateKey={board?.dateKey}
          timetableId={timetableId}
          classes={(board?.usedClasses || []).map((c) => ({ _id: c._id, name: c.name }))}
          teachers={(board?.teachers || []).map((row) => row.teacher).filter(Boolean)}
          periodCount={board?.periodCount}
          periodStart={board?.periodStart}
          onDone={async (message) => {
            setSwapOpen(false);
            setFlash(message);
            await load();
          }}
        />
      ) : null}
    </>
  );
}
