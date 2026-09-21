import React from "react";
import { Link } from "react-router-dom";
import smsLogo from "../../assets/sms-logo.jpg";

export default function Logo({ to = "/" }) {
  return (
    <Link to={to} className="site-logo" aria-label="SMS home">
      <img src={smsLogo} alt="" className="site-logo-mark" />
      <span className="site-logo-rule" aria-hidden="true" />
      <span className="site-logo-wordmark">Substitution Management System</span>
    </Link>
  );
}
