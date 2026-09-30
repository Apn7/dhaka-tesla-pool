export type User = { id: string; name: string; email: string; role: "PASSENGER" | "DRIVER" };
export type ApiError = { error: string; issues?: { field: string; message: string }[] };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

// The free backend host sleeps when idle and answers 502/503/504 until it's awake (about a minute).
// Retrying is safe: the request never reached our API, and a repeated booking or accept is refused
// by the database (409) anyway.
const WAKING_STATUSES = [502, 503, 504];
const RETRY_EVERY_MS = 3000;
const GIVE_UP_AFTER_MS = 90_000;

// How many calls are waiting for the server right now, for <WakingNotice />
let waiting = 0;
const listeners = new Set<() => void>();
function setWaiting(change: number) {
  waiting += change;
  listeners.forEach((listener) => listener());
}
export function subscribeWaking(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
export const isWaking = () => waiting > 0;

async function fetchWaitingForWake(url: string, init?: RequestInit) {
  const started = Date.now();
  let res = await fetch(url, init);
  if (!WAKING_STATUSES.includes(res.status)) return res;
  setWaiting(1);
  try {
    while (WAKING_STATUSES.includes(res.status) && Date.now() - started < GIVE_UP_AFTER_MS) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_EVERY_MS));
      res = await fetch(url, init);
    }
    return res;
  } finally {
    setWaiting(-1);
  }
}

// Calls Express through the /api rewrite: same site, so the browser sends the login cookie itself
async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetchWaitingForWake(`/api${path}`, init);
    const data = res.status === 204 ? null : await res.json();
    return res.ok ? { ok: true, data } : { ok: false, error: data };
  } catch {
    // Network error, or an answer that isn't our JSON (for example the backend never woke up)
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
