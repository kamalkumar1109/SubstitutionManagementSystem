async function request(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options && options.headers) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && (data.error || data.message) ? data.error || data.message : "Request failed";
    throw new Error(msg);
  }
  return data;
}

export function loginRequest({ email, password, expectedRole }) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, expectedRole })
  });
}

export function submitEnquiry(payload) {
  return request("/api/enquiries", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchPublicReviews() {
  return request("/api/reviews/public");
}
