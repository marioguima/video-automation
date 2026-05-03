const runtimeHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
export const API_BASE =
  import.meta.env.VITE_API_BASE ??
  import.meta.env.API_BASE_URL ??
  `http://${runtimeHost}:4010`;

const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, { ts: number; data: unknown }>();
const UNAUTHORIZED_EVENT = 'vizlec:unauthorized';

function emitUnauthorized(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

export async function apiGet<T>(
  path: string,
  options: { cacheMs?: number; dedupe?: boolean } = {}
): Promise<T> {
  const cacheMs = options.cacheMs ?? 1500;
  const dedupe = options.dedupe ?? true;
  const now = Date.now();
  const cached = cache.get(path);
  if (cached && now - cached.ts < cacheMs) {
    return cached.data as T;
  }
  if (dedupe && inflight.has(path)) {
    return inflight.get(path) as Promise<T>;
  }
  const request = fetch(`${API_BASE}${path}`, { credentials: 'include' })
    .then(async (res) => {
      if (res.status === 401) {
        emitUnauthorized();
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `GET ${path} failed`);
      }
      const data = await res.json();
      cache.set(path, { ts: Date.now(), data });
      return data as T;
    })
    .finally(() => {
      inflight.delete(path);
    });
  if (dedupe) {
    inflight.set(path, request);
  }
  return request as Promise<T>;
}

export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  if (res.status === 401) {
    emitUnauthorized();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `POST ${path} failed`);
  }
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  if (res.status === 401) {
    emitUnauthorized();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `PATCH ${path} failed`);
  }
  return res.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  if (res.status === 401) {
    emitUnauthorized();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `DELETE ${path} failed`);
  }
  return res.json() as Promise<T>;
}

export { UNAUTHORIZED_EVENT };
