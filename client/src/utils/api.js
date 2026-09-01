async function request(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options && options.headers) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && (data.error || data.message) ? (data.error || data.message) : "Request failed";
    throw new Error(msg);
  }
  return data;
}

export function fetchTeachers() {
  return request("/teachers");
}

export function markAttendance(teacherId, status) {
  return request("/mark-attendance", {
    method: "POST",
    body: JSON.stringify({ teacherId, status })
  });
}

export function generateSubstitution(day) {
  return request("/generate-substitution", {
    method: "POST",
    body: JSON.stringify({ day })
  });
}

export function fetchSubstitutions(day) {
  const q = day ? `?day=${encodeURIComponent(day)}` : "";
  return request(`/substitutions${q}`);
}

export function manualOverride({ day, period, absentTeacherId, substituteTeacherId }) {
  return request("/manual-override", {
    method: "POST",
    body: JSON.stringify({ day, period, absentTeacherId, substituteTeacherId })
  });
}

export function resetDay(day) {
  return request("/reset-day", {
    method: "POST",
    body: JSON.stringify({ day })
  });
}

