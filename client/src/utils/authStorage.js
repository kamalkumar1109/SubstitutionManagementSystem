const KEY = "sms_auth";
const SCHOOL_KEY = "sms_acting_school";

export function saveAuth(payload) {
  sessionStorage.setItem(KEY, JSON.stringify(payload));
}

export function getAuth() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAuth() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(SCHOOL_KEY);
}

export function setActingSchoolId(schoolId) {
  if (!schoolId) sessionStorage.removeItem(SCHOOL_KEY);
  else sessionStorage.setItem(SCHOOL_KEY, String(schoolId));
}

export function getActingSchoolId() {
  return sessionStorage.getItem(SCHOOL_KEY) || "";
}
