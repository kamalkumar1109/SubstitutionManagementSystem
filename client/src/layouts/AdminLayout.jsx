import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import Logo from "../components/site/Logo.jsx";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/schools", label: "Schools" },
  { to: "/admin/subscriptions", label: "Subscriptions" },
  { to: "/admin/payments", label: "Payments" },
  { to: "/admin/enquiries", label: "Enquiries" },
  { to: "/admin/reviews", label: "Reviews" },
  { to: "/admin/plans", label: "Plans" },
  { to: "/admin/settings", label: "Settings" }
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="app-shell">
      <aside className="app-side">
        <Logo to="/admin/dashboard" />
        <p className="app-side-role">Platform owner</p>
        <nav>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === "/admin/dashboard" || link.to === "/admin/schools"}>
              {link.label}
            </NavLink>
          ))}
          <button type="button" className="app-side-logout" onClick={onLogout}>
            Logout
          </button>
        </nav>
      </aside>
      <div className="app-body">
        <header className="app-top">
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <button type="button" className="site-btn site-btn-ghost" onClick={onLogout}>
            Logout
          </button>
        </header>
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
