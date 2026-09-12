import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clearAuth, getAuth, saveAuth, setActingSchoolId } from "../utils/authStorage";
import { fetchMe, loginRequest, logoutRequest, setUnauthorizedHandler } from "../utils/apiClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => getAuth());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth(null));
    let alive = true;
    (async () => {
      const stored = getAuth();
      if (!stored?.token) {
        if (alive) setReady(true);
        return;
      }
      try {
        const data = await fetchMe();
        const next = { token: stored.token, user: data.user };
        saveAuth(next);
        if (alive) setAuth(next);
      } catch {
        clearAuth();
        if (alive) setAuth(null);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user: auth?.user || null,
      token: auth?.token || null,
      async login(payload) {
        const data = await loginRequest(payload);
        if (data.user?.role !== "SUPER_ADMIN") setActingSchoolId("");
        const next = { token: data.token, user: data.user };
        saveAuth(next);
        setAuth(next);
        return next;
      },
      setUser(user) {
        const stored = getAuth();
        if (!stored?.token || !user) return;
        const next = { token: stored.token, user };
        saveAuth(next);
        setAuth(next);
      },
      async logout() {
        await logoutRequest();
        clearAuth();
        setAuth(null);
      }
    }),
    [auth, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function homeForRole(role) {
  if (role === "SUPER_ADMIN") return "/admin/dashboard";
  if (role === "SCHOOL_ADMIN") return "/school/dashboard";
  return "/login";
}
