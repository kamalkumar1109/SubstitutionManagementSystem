import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import Logo from "./Logo.jsx";
import { homeForRole, useAuth } from "../../auth/AuthContext.jsx";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const loginRef = useRef(null);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    setOpen(false);
    setLoginOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    function onDoc(e) {
      if (loginRef.current && !loginRef.current.contains(e.target)) {
        setLoginOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Logo />
        <button
          type="button"
          className="site-nav-toggle"
          aria-expanded={open}
          aria-controls="site-nav-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Menu</span>
          <span />
          <span />
          <span />
        </button>
        <nav id="site-nav-menu" className={`site-nav-links ${open ? "is-open" : ""}`}>
          <NavLink to="/" end>
            Home
          </NavLink>
          <a href="/#features">Features</a>
          <a href="/#how-it-works">How It Works</a>
          <NavLink to="/contact">Contact</NavLink>
          {user ? (
            <NavLink to={homeForRole(user.role)}>Dashboard</NavLink>
          ) : null}
          <div className="site-login-wrap" ref={loginRef}>
            <button
              type="button"
              className="site-login-trigger"
              aria-expanded={loginOpen}
              onClick={() => setLoginOpen((v) => !v)}
            >
              Login
            </button>
            {loginOpen ? (
              <div className="site-login-menu" role="menu">
                <Link role="menuitem" to="/school-login">
                  School Login
                </Link>
                <Link role="menuitem" to="/admin-login">
                  Admin Login
                </Link>
              </div>
            ) : null}
          </div>
        </nav>
      </div>
    </header>
  );
}
