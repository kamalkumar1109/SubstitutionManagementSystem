import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { homeForRole, useAuth } from "./AuthContext.jsx";
import { getActingSchoolId } from "../utils/authStorage.js";

export function GuestOnly({ children }) {
  const { ready, user } = useAuth();
  if (!ready) {
    return (
      <div className="app-loading">
        <p>Checking your session…</p>
      </div>
    );
  }
  if (user) return <Navigate to={homeForRole(user.role)} replace />;
  return children;
}

export default function ProtectedRoute({ roles, children }) {
  const { ready, user } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="app-loading">
        <p>Checking your session…</p>
      </div>
    );
  }

  if (!user) {
    const schoolRoute = Boolean(roles?.includes("SCHOOL_ADMIN"));
    const to = schoolRoute ? "/school-login" : roles?.includes("SUPER_ADMIN") ? "/admin-login" : "/school-login";
    return <Navigate to={to} replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  return children;
}

export function SchoolWorkspaceGate({ children }) {
  const { user } = useAuth();
  if (user?.role === "SUPER_ADMIN" && !getActingSchoolId()) {
    return <Navigate to="/admin/schools" replace />;
  }
  return children;
}
