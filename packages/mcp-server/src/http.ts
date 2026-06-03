// Adapted from packages/cli/src/http/client.ts. The CLI version reads the
// token implicitly from the session file; here we pass it in explicitly so the
// server can source it from env vars or the session file via resolveAuth().
// Keep loosely in sync — if a third consumer appears, extract to packages/api-client.

export type FetchLike = typeof fetch;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export function reauthMessage(): string {
  return (
    'Authentication failed. Your PAT may be revoked or expired — generate a new ' +
    'one at https://mozost.netlify.app under Account → API tokens.'
  );
}

export function toolErrorContent(e: unknown): { content: { type: 'text'; text: string }[]; isError: true } {
  const status = e instanceof ApiError ? e.status : undefined;
  const message = status === 401 ? reauthMessage() : e instanceof Error ? e.message : String(e);
  return { content: [{ type: 'text', text: message }], isError: true };
}

export async function apiFetch<T>(
  fetchImpl: FetchLike,
  token: string,
  apiBase: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const base = apiBase.replace(/\/$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);

  const res = await fetchImpl(url, { ...init, headers });

  if (res.status === 204) return undefined as T;

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = (payload.error as string) || `Request failed: ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return payload as T;
}
