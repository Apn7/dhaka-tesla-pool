export type User = { id: string; name: string; email: string; role: "PASSENGER" | "DRIVER" };
export type ApiError = { error: string; issues?: { field: string; message: string }[] };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

// Calls Express through the /api rewrite: same site, so the browser sends the login cookie itself
async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api${path}`, init);
    const data = res.status === 204 ? null : await res.json();
    return res.ok ? { ok: true, data } : { ok: false, error: data };
  } catch {
    // Network error, or an answer that isn't our JSON (for example the backend is still starting)
    return { ok: false, error: { error: "Can't reach the server. Try again in a moment." } };
  }
}

export const getJson = <T>(path: string) => call<T>(path);

export const postJson = <T = null>(path: string, body: unknown = {}) =>
  call<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
