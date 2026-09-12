import { clearAuth, getAuth, getActingSchoolId } from "./authStorage";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export async function apiRequest(path, options = {}) {
  const auth = getAuth();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (auth?.token && !headers.Authorization) {
    headers.Authorization = `Bearer ${auth.token}`;
  }
  if (auth?.user?.role === "SUPER_ADMIN") {
    const schoolId = getActingSchoolId();
    if (schoolId) headers["X-School-Id"] = schoolId;
  }

  let res;
  try {
    res = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError("Unable to reach the server. Try again in a moment.", 0);
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearAuth();
    if (onUnauthorized) onUnauthorized();
    throw new ApiError(data.error || "Your session has expired. Please sign in again.", 401);
  }
  if (!res.ok) {
    throw new ApiError(data.error || data.message || "Request failed", res.status);
  }
  return data;
}

export async function apiRequestBlob(path) {
  const auth = getAuth();
  const headers = {};
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
  if (auth?.user?.role === "SUPER_ADMIN") {
    const schoolId = getActingSchoolId();
    if (schoolId) headers["X-School-Id"] = schoolId;
  }
  let res;
  try {
    res = await fetch(path, { headers });
  } catch {
    throw new ApiError("Unable to reach the server. Try again in a moment.", 0);
  }
  if (res.status === 401) {
    clearAuth();
    if (onUnauthorized) onUnauthorized();
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || data.message || "Request failed", res.status);
  }
  return res.blob();
}

export function loginRequest({ loginId, email, password, expectedRole }) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      loginId: loginId || email,
      email: email || loginId,
      password,
      expectedRole
    })
  });
}

export function fetchMe() {
  return apiRequest("/api/auth/me");
}

export function logoutRequest() {
  return apiRequest("/api/auth/logout", { method: "POST" }).catch(() => ({ ok: true }));
}
