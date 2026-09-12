import React from "react";
import LoginForm from "../components/site/LoginForm.jsx";
import { Link } from "react-router-dom";

export default function SchoolLogin() {
  return (
    <section className="site-page site-page-narrow">
      <p className="site-eyebrow">Schools</p>
      <h1>School Login</h1>
      <p className="site-lead">
        Sign in with the email and password given to your school administrator. Need access?{" "}
        <Link to="/contact">Send an enquiry</Link>.
      </p>
      <LoginForm variant="school" />
    </section>
  );
}
