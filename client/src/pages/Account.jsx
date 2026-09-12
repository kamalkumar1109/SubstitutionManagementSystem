import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearAuth, getAuth } from "../utils/authStorage";

export default function Account() {
  const auth = getAuth();
  const navigate = useNavigate();

  if (!auth?.user) {
    return (
      <section className="site-page site-page-narrow">
        <h1>You are not signed in</h1>
        <p className="site-lead">
          Use <Link to="/school-login">School Login</Link> or <Link to="/admin-login">Admin Login</Link>
          .
        </p>
      </section>
    );
  }

  const isSchool = auth.user.role === "SCHOOL_ADMIN";

  function signOut() {
    clearAuth();
    navigate("/");
  }

  return (
    <section className="site-page site-page-narrow">
      <p className="site-eyebrow">Signed in</p>
      <h1>{auth.user.name}</h1>
      <p className="site-lead">
        {auth.user.email} · {isSchool ? "School administrator" : "Platform administrator"}
      </p>
      <p>
        {isSchool
          ? "The school-scoped dashboard for teachers, timetable, and substitutions is still being connected to this login. You can open the existing substitution workspace, which currently uses the original demo data."
          : "Platform tools for schools, plans, and enquiries will use this account. There is no fabricated analytics screen here."}
      </p>
      <div className="site-hero-actions">
        {isSchool ? (
          <Link className="site-btn site-btn-primary" to="/workspace">
            Open substitution workspace
          </Link>
        ) : null}
        <button type="button" className="site-btn site-btn-ghost" onClick={signOut}>
          Sign out
        </button>
      </div>
    </section>
  );
}
