import { loadSession } from '../config/session.js';

export function resolveApiBase(explicit?: string): string {
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.OST_API_BASE) return process.env.OST_API_BASE.replace(/\/$/, '');
  const session = loadSession();
  if (session?.apiBase) return session.apiBase.replace(/\/$/, '');
  return 'https://mozost.netlify.app';
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  apiBase?: string,
): Promise<T> {
  const base = resolveApiBase(apiBase);
  const session = loadSession();
  const token = session?.token;

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 204) return undefined as T;

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = (payload.error as string) || `Request failed: ${res.status}`;
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return payload as T;
}
