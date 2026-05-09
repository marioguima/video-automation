const runtimeHost =
  typeof window !== 'undefined' && window.location.hostname
    ? window.location.hostname
    : '127.0.0.1';
const FALLBACK_API_BASE =
  import.meta.env.VITE_API_BASE ??
  import.meta.env.API_BASE_URL ??
  `http://${runtimeHost}:4010`;
let resolvedApiBasePromise: Promise<string> | null = null;

const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, { ts: number; data: unknown }>();
const UNAUTHORIZED_EVENT = 'flowshopy:unauthorized';

function formatApiError(error: string | undefined, fallback: string): string {
  if (!error) return fallback;
  if (error === 'agent_offline') {
    return 'A API não encontrou um agente conectado no worker para executar esta ação.';
  }
  return error;
}

function emitUnauthorized(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

async function resolveApiBase(): Promise<string> {
  if (resolvedApiBasePromise) {
    return resolvedApiBasePromise;
  }
  resolvedApiBasePromise = (async () => {
    if (typeof window === 'undefined') {
      return FALLBACK_API_BASE;
    }
    const desktop = (window as Window & {
      flowshopyDesktop?: {
        getRuntimeInfo?: () => Promise<{ apiUrl?: string }>;
      };
    }).flowshopyDesktop;
    if (!desktop?.getRuntimeInfo) {
      return FALLBACK_API_BASE;
    }
    try {
      const runtime = await desktop.getRuntimeInfo();
      return runtime.apiUrl?.trim() || FALLBACK_API_BASE;
    } catch {
      return FALLBACK_API_BASE;
    }
  })();
  return resolvedApiBasePromise;
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
  const request = resolveApiBase()
    .then((apiBase) => fetch(`${apiBase}${path}`, { credentials: 'include' }))
    .then(async (res) => {
      if (res.status === 401) {
        emitUnauthorized();
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(formatApiError((err as { error?: string }).error, `GET ${path} failed`));
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
  const apiBase = await resolveApiBase();
  const res = await fetch(`${apiBase}${path}`, {
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
    throw new Error(formatApiError(err.error, `POST ${path} failed`));
  }
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, payload: unknown): Promise<T> {
  const apiBase = await resolveApiBase();
  const res = await fetch(`${apiBase}${path}`, {
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
    throw new Error(formatApiError(err.error, `PATCH ${path} failed`));
  }
  return res.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const apiBase = await resolveApiBase();
  const res = await fetch(`${apiBase}${path}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  if (res.status === 401) {
    emitUnauthorized();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatApiError(err.error, `DELETE ${path} failed`));
  }
  return res.json() as Promise<T>;
}

export const API_BASE = FALLBACK_API_BASE;
export { UNAUTHORIZED_EVENT };
