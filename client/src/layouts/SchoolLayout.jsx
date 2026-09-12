import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import Logo from "../components/site/Logo.jsx";
import { getActingSchoolId } from "../utils/authStorage.js";
import { apiRequest } from "../utils/apiClient.js";
import Modal from "../components/app/Modal.jsx";

const links = [
  { to: "/school/dashboard", label: "Dashboard" },
  { to: "/school/substitutions", label: "Substitution" },
  { to: "/school/timetable", label: "Timetable" },
  { to: "/school/teachers", label: "Teachers" },
  { to: "/school/classes", label: "Classes" },
  { to: "/school/subjects", label: "Subjects" },
  { to: "/school/billing", label: "Subscription" },
  { to: "/school/settings", label: "Settings" }
];

function reviewNudgeKey(token) {
  return `sms-review-nudge:${String(token || "").slice(-16)}`;
}

export default function SchoolLayout() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const actingSchool = getActingSchoolId();
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    if (user?.role !== "SCHOOL_ADMIN" || !token) return;
    if (sessionStorage.getItem(reviewNudgeKey(token))) return;
    let alive = true;
    apiRequest("/api/reviews/mine")
      .then((data) => {
        if (alive && !data.review) setPromptOpen(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, token]);

  async function onLogout() {
    await logout();
    navigate("/");
  }

  function dismissPrompt() {
    sessionStorage.setItem(reviewNudgeKey(token), "1");
    setPromptOpen(false);
  }

  function giveReview() {
    sessionStorage.setItem(reviewNudgeKey(token), "1");
    setPromptOpen(false);
    navigate("/school/settings#reviews");
  }

  return (
    <div className="app-shell">
      <aside className="app-side">
        <Logo to="/school/dashboard" />
        <p className="app-side-role">
          {user?.role === "SUPER_ADMIN" ? "Platform view of a school" : "School workspace"}
        </p>
        <nav>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === "/school/timetable"}>
              {link.label}
            </NavLink>
          ))}
          {user?.role === "SUPER_ADMIN" && actingSchool ? (
            <NavLink to={`/admin/schools/${actingSchool}`}>Back to admin</NavLink>
          ) : null}
        </nav>
      </aside>
      <div className="app-body">
        <header className="app-top">
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <button type="button" className="site-btn site-btn-ghost" onClick={onLogout}>
            Sign out
          </button>
        </header>
        <div className="app-content">
          <Outlet />
        </div>
      </div>
      {promptOpen ? (
        <Modal title="How are you finding SMS?" onClose={dismissPrompt}>
          <p className="app-modal-copy">Please take a moment to rate and review your experience.</p>
          <div className="app-modal-actions">
            <button type="button" className="site-btn site-btn-ghost" onClick={dismissPrompt}>
              Maybe / Not now
            </button>
            <button type="button" className="site-btn site-btn-primary" onClick={giveReview}>
              Yes, give review
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
