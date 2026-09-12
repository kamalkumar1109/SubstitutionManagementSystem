import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { homeForRole, useAuth } from "../../auth/AuthContext.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginForm({ variant }) {
  const isAdmin = variant === "admin";
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const trimmed = loginId.trim();
    if (!trimmed) {
      setError(isAdmin ? "Enter your admin email." : "Enter your school email or login ID.");
      return;
    }
    if (isAdmin && !EMAIL_RE.test(trimmed)) {
      setError("Enter a valid admin email address.");
      return;
    }
    if (!isAdmin && trimmed.includes("@") && !EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email, or use your school login ID.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    try {
      setBusy(true);
      const result = await login({
        loginId: trimmed,
        password,
        expectedRole: isAdmin ? "SUPER_ADMIN" : "SCHOOL_ADMIN"
      });
      navigate(homeForRole(result.user.role));
    } catch (err) {
      setError(err.message || "Unable to sign in. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="site-form" onSubmit={onSubmit} noValidate>
      <div className="site-form-field">
        <label htmlFor="login-email">{isAdmin ? "Admin email" : "School email / login ID"}</label>
        <input
          id="login-email"
          name="username"
          type={isAdmin ? "email" : "text"}
          autoComplete="username"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          placeholder={isAdmin ? "owner@example.com" : "admin@yourschool.edu"}
        />
      </div>
      <div className="site-form-field">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error ? (
        <p className="site-alert site-alert-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="site-btn site-btn-primary" type="submit" disabled={busy}>
        {busy ? "Signing in…" : isAdmin ? "Sign in as platform admin" : "Sign in to school"}
      </button>
      <p className="site-form-foot">
        {isAdmin ? (
          <>
            School staff should use <Link to="/school-login">School Login</Link>.
          </>
        ) : (
          <>
            Platform operators should use <Link to="/admin-login">Admin Login</Link>. School accounts
            are issued when a school is onboarded — there is no public registration.
          </>
        )}
      </p>
    </form>
  );
}
