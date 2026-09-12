import React from "react";
import LoginForm from "../components/site/LoginForm.jsx";
import { Link } from "react-router-dom";

export default function AdminLogin() {
  return (
    <section className="site-page site-page-narrow">
      <p className="site-eyebrow">Platform</p>
      <h1>Admin Login</h1>
      <p className="site-lead">
        For the platform owner. School staff should use <Link to="/school-login">School Login</Link>.
      </p>
      <LoginForm variant="admin" />
    </section>
  );
}
