import React from "react";
import { Link } from "react-router-dom";

export default function Logo({ to = "/" }) {
  return (
    <Link to={to} className="site-logo" aria-label="SMS home">
      <span className="site-logo-mark" aria-hidden="true">
        S
      </span>
      <span className="site-logo-text">
        <strong>SMS</strong>
        <em>Substitution Management</em>
      </span>
    </Link>
  );
}
