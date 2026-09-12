import React from "react";
import { Link } from "react-router-dom";
import Logo from "./Logo.jsx";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div>
          <Logo />
          <p className="site-footer-blurb">
            Substitution Management System helps schools record daily teacher availability, generate
            period-wise substitutions, and keep a printable record — without mixing one school’s data
            with another.
          </p>
        </div>
        <div>
          <h2>Product</h2>
          <ul>
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <a href="/#features">Features</a>
            </li>
            <li>
              <a href="/#how-it-works">How It Works</a>
            </li>
            <li>
              <a href="/#future">Timetable (planned)</a>
            </li>
          </ul>
        </div>
        <div>
          <h2>Access</h2>
          <ul>
            <li>
              <Link to="/school-login">School Login</Link>
            </li>
            <li>
              <Link to="/admin-login">Admin Login</Link>
            </li>
            <li>
              <Link to="/contact">Request access</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2>Contact</h2>
          <ul>
            <li>
              <Link to="/contact">Enquiry form</Link>
            </li>
            <li>Replies on business days</li>
            <li>
              <Link to="/privacy">Privacy</Link>
            </li>
            <li>
              <Link to="/terms">Terms</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="site-footer-bottom">
        <p>© {new Date().getFullYear()} Substitution Management System. All rights reserved.</p>
      </div>
    </footer>
  );
}
