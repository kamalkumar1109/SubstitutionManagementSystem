import React from "react";
import { Link } from "react-router-dom";

export default function Login() {
  return (
    <section className="site-page site-page-narrow">
      <p className="site-eyebrow">Sign in</p>
      <h1>Choose how you sign in</h1>
      <p className="site-lead">
        School coordinators use the school account issued during onboarding. Platform operators use
        the admin account. There is no public school registration on this site.
      </p>
      <div className="site-login-cards">
        <Link className="site-login-card" to="/school-login">
          <h2>School Login</h2>
          <p>For the administrator of a subscribed school. Use the school email and password issued at onboarding.</p>
        </Link>
        <Link className="site-login-card" to="/admin-login">
          <h2>Admin Login</h2>
          <p>For the people who run the SMS platform, not for school staff.</p>
        </Link>
      </div>
    </section>
  );
}
