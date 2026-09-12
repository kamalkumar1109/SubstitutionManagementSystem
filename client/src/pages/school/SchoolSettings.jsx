import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiRequest } from "../../utils/apiClient";
import { Flash, Notice, PageHead } from "../../components/app/Ui.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import SchoolReviewForm from "../../components/app/SchoolReviewForm.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="site-form-field">
      <label htmlFor={id}>{label}</label>
      <div className="app-password-wrap">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="app-password-toggle"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 5c5.5 0 9.5 4.5 10.7 6.2.2.3.2.7 0 1C21.5 14 17.5 19 12 19S2.5 14 1.3 12.2c-.2-.3-.2-.7 0-1C2.5 9.5 6.5 5 12 5zm0 12c3.7 0 6.8-3.3 8.2-5C18.8 10.3 15.7 7 12 7S5.2 10.3 3.8 12C5.2 13.7 8.3 17 12 17zm0-8a3 3 0 110 6 3 3 0 010-6z"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M3.3 2.3 21 20l-1.4 1.4-3.2-3.2A11.7 11.7 0 0112 19C6.5 19 2.5 14 1.3 12.2c-.2-.3-.2-.7 0-1 1-1.4 3.3-4 6.4-5.5L2 3.7 3.3 2.3zM12 7c.5 0 1 .1 1.5.2l-1.7 1.7A3 3 0 009.1 12l-1.8 1.8A4.9 4.9 0 017 12a5 5 0 015-5zm8.2 1.5-2.1 2.1c.6.7 1.1 1.5 1.5 2.4C18.8 14.7 15.7 17 12 17c-.5 0-1-.1-1.5-.2l-1.6 1.6c1 .4 2 .6 3.1.6 5.5 0 9.5-4.5 10.7-6.2.2-.3.2-.7 0-1-.8-1.1-2.4-3-4.5-4.3z"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function SchoolHistoryPanel() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await apiRequest("/api/audit-logs");
    setLogs(data.logs || []);
  }

  async function reveal() {
    setError("");
    try {
      await load();
      setOpen(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function clearAll() {
    setBusy(true);
    try {
      await apiRequest("/api/audit-logs", { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeOne(id) {
    setBusy(true);
    try {
      await apiRequest(`/api/audit-logs/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <>
        {error ? <p className="site-alert site-alert-error">{error}</p> : null}
        <button type="button" className="site-btn site-btn-ghost" onClick={reveal}>
          See history
        </button>
      </>
    );
  }

  return (
    <>
      {error ? <p className="site-alert site-alert-error">{error}</p> : null}
      <div className="app-page-actions">
        <button type="button" className="site-btn site-btn-danger" onClick={clearAll} disabled={busy || logs.length === 0}>
          Clear all history
        </button>
      </div>
      {logs.length === 0 ? (
        <p className="app-muted">No history yet.</p>
      ) : (
        <ul className="app-list">
          {logs.map((log) => (
            <li key={log._id}>
              <span>
                {new Date(log.createdAt).toLocaleString()} · {String(log.action || "").replace(/_/g, " ")}
              </span>
              <button type="button" className="site-btn site-btn-text" onClick={() => removeOne(log._id)} aria-label="Delete history item">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function SchoolSettings() {
  const location = useLocation();
  const { user, setUser } = useAuth();
  const [school, setSchool] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [emailFlash, setEmailFlash] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordFlash, setPasswordFlash] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const isSchoolAdmin = user?.role === "SCHOOL_ADMIN";
  const currentEmail = user?.email || school?.email || "";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, sess] = await Promise.all([
          apiRequest("/api/schools/current"),
          apiRequest("/api/academic-sessions")
        ]);
        if (!alive) return;
        setSchool(s.school);
        setSessions(sess.sessions || []);
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

  useEffect(() => {
    if (loading) return;
    if (location.hash !== "#reviews") return;
    const el = document.getElementById("reviews");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, location.hash]);

  async function onUpdateEmail(e) {
    e.preventDefault();
    setEmailFlash("");
    setEmailError("");
    const trimmed = newEmail.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailBusy(true);
    try {
      const data = await apiRequest("/api/auth/email", {
        method: "PATCH",
        body: JSON.stringify({ email: trimmed })
      });
      if (data.user) setUser(data.user);
      if (data.school) setSchool(data.school);
      setNewEmail("");
      setEmailFlash("Login email updated. Use the new address the next time you sign in.");
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setEmailBusy(false);
    }
  }

  async function onUpdatePassword(e) {
    e.preventDefault();
    setPasswordFlash("");
    setPasswordError("");
    if (!oldPassword || !newPassword) {
      setPasswordError("Enter your old password and a new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      await apiRequest("/api/auth/password", {
        method: "PATCH",
        body: JSON.stringify({
          oldPassword,
          newPassword,
          confirmPassword
        })
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFlash("Password updated. Use the new password the next time you sign in.");
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <>
      <PageHead eyebrow="School" title="Settings">
        <p>Identity and academic sessions for this school only.</p>
      </PageHead>
      <Notice loading={loading} error={error} />
      {school ? (
        <dl className="app-dl">
          <div>
            <dt>Name</dt>
            <dd>{school.name}</dd>
          </div>
          <div>
            <dt>School code / login ID</dt>
            <dd>{school.schoolCode}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{currentEmail}</dd>
          </div>
          <div>
            <dt>Timezone</dt>
            <dd>{school.timezone}</dd>
          </div>
        </dl>
      ) : null}

      {isSchoolAdmin ? (
        <>
          <section className="app-panel">
            <div className="app-panel-head">
              <h2 className="app-h2">School Email</h2>
            </div>
            <Flash message={emailFlash} />
            {emailError ? (
              <p className="site-alert site-alert-error" role="alert">
                {emailError}
              </p>
            ) : null}
            <form className="site-form" onSubmit={onUpdateEmail} noValidate>
              <div className="site-form-field">
                <label htmlFor="current-email">Current Email</label>
                <input id="current-email" type="email" value={currentEmail} readOnly />
              </div>
              <div className="site-form-field">
                <label htmlFor="new-email">New Email</label>
                <input
                  id="new-email"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <button className="site-btn site-btn-primary" type="submit" disabled={emailBusy}>
                {emailBusy ? "Updating…" : "Update Email"}
              </button>
            </form>
          </section>

          <section className="app-panel">
            <div className="app-panel-head">
              <h2 className="app-h2">Change Password</h2>
            </div>
            <Flash message={passwordFlash} />
            {passwordError ? (
              <p className="site-alert site-alert-error" role="alert">
                {passwordError}
              </p>
            ) : null}
            <form className="site-form" onSubmit={onUpdatePassword} noValidate>
              <PasswordField
                id="old-password"
                label="Old Password"
                value={oldPassword}
                onChange={setOldPassword}
                autoComplete="current-password"
              />
              <PasswordField
                id="new-password"
                label="New Password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
              />
              <PasswordField
                id="confirm-password"
                label="Confirm New Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
              />
              <button className="site-btn site-btn-primary" type="submit" disabled={passwordBusy}>
                {passwordBusy ? "Updating…" : "Update Password"}
              </button>
            </form>
          </section>

          <section className="app-panel" id="reviews">
            <div className="app-panel-head">
              <h2 className="app-h2">Review</h2>
            </div>
            <SchoolReviewForm />
          </section>

          <section className="app-panel" id="history">
            <div className="app-panel-head">
              <h2 className="app-h2">See history</h2>
            </div>
            <SchoolHistoryPanel />
          </section>
        </>
      ) : null}

      {sessions.length ? (
        <ul className="app-list">
          {sessions.map((session) => (
            <li key={session._id}>
              {session.name}
              {session.isCurrent ? " · current" : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
