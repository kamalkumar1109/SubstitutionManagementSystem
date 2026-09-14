const KEY = "sms_auth";
const SCHOOL_KEY = "sms_acting_school";

export function saveAuth(payload) {
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function getAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(SCHOOL_KEY);
}

export function setActingSchoolId(schoolId) {
  if (!schoolId) localStorage.removeItem(SCHOOL_KEY);
  else localStorage.setItem(SCHOOL_KEY, String(schoolId));
}

export function getActingSchoolId() {
  return localStorage.getItem(SCHOOL_KEY) || "";
}
