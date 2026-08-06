// Tiny fetch wrapper. All calls are same-origin via the Vite /api proxy in dev
// (see vite.config.js) and Nginx in prod, so credentials:"include" carries the
// httpOnly auth cookie without CORS headaches.
async function request(url, { method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: "POST", body }),
  put: (url, body) => request(url, { method: "PUT", body }),
  del: (url) => request(url, { method: "DELETE" }),
}
