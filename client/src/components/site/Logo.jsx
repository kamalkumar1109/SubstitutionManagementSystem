import React from "react";
import { Link } from "react-router-dom";

export default function Logo({ to = "/" }) {
  return (
    <Link to={to} className="site-logo" aria-label="SMS home">
      <span className="site-logo-mark" aria-hidden="true">
        SMS
      </span>
      <span className="site-logo-rule" aria-hidden="true" />
      <span className="site-logo-wordmark">Substitution Management System</span>
    </Link>
  );
}
