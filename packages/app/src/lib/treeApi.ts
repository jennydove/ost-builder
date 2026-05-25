import type { ShareSettings } from '@ost-builder/shared';
import { supabase, supabaseConfigured } from './supabaseClient';

export type AuthUser = {
  sub: string;
  provider: 'github';
  name?: string;
  email?: string;
  avatarUrl?: string;
};

export type TreeVisibility = 'link-public' | 'domain-restricted' | 'restricted';
export type TreeStatus = 'active' | 'expired' | 'deleted';

export type CreateTreeInput = {
  markdown: string;
  name?: string;
  visibility: TreeVisibility;
  settings?: ShareSettings;
  collapsedIds?: string[];
};

export type TreeListItem = {
  id: string;
  name?: string | null;
  visibility: TreeVisibility;
  status?: TreeStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  link: string;
};

export type TreeRole = 'owner' | 'editor' | 'viewer';

export type TreePayload = {
  id: string;
  name?: string | null;
  visibility: TreeVisibility;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
  markdown: string;
  settings?: ShareSettings;
  collapsedIds?: string[];
  role: TreeRole;
};

async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let token: string | undefined;
  if (supabaseConfigured) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token;
  }

  const res = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const error = new Error((json.error as string) || `Request failed: ${res.status}`) as Error & {
      status?: number;
      payload?: Record<string, unknown>;
    };
    error.status = res.status;
    error.payload = json;
    throw error;
  }

  return json as T;
}

export async function getAuthMe(): Promise<{ user: AuthUser | null; featureEnabled: boolean }> {
  return apiFetch('/api/auth/me');
}

export async function createTree(input: CreateTreeInput): Promise<{
  id: string;
  link: string;
  expiresAt: number;
  visibility: TreeVisibility;
  status: TreeStatus;
}> {
  return apiFetch('/api/trees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function listTrees(
  page = 1,
  pageSize = 20,
): Promise<{
  items: TreeListItem[];
  page: number;
  pageSize: number;
  total: number;
}> {
  return apiFetch(`/api/trees?page=${page}&pageSize=${pageSize}`);
}

export async function getTree(id: string): Promise<TreePayload> {
  return apiFetch(`/api/trees/${encodeURIComponent(id)}`);
}

export async function updateTree(
  id: string,
  input: {
    markdown?: string;
    name?: string;
    visibility?: TreeVisibility;
    settings?: ShareSettings;
    collapsedIds?: string[];
  },
): Promise<{ id: string; visibility: TreeVisibility; updatedAt: number; expiresAt?: number }> {
  return apiFetch(`/api/trees/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteTree(id: string): Promise<void> {
  await apiFetch(`/api/trees/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
}

export type TreeComment = {
  id: string;
  cardId: string;
  userId: string | null;
  authorName: string | null;
  body: string;
  createdAt: number;
};

export async function listTreeComments(
  shareId: string,
  cardId?: string,
): Promise<{ comments: TreeComment[] }> {
  const qs = cardId ? `?cardId=${encodeURIComponent(cardId)}` : '';
  return apiFetch(`/api/trees/${encodeURIComponent(shareId)}/comments${qs}`);
}

export async function postTreeComment(
  shareId: string,
  cardId: string,
  body: string,
): Promise<{ comment: TreeComment }> {
  return apiFetch(`/api/trees/${encodeURIComponent(shareId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId, body }),
  });
}

export async function updateTreeComment(
  shareId: string,
  commentId: string,
  body: string,
): Promise<{ comment: TreeComment }> {
  return apiFetch(
    `/api/trees/${encodeURIComponent(shareId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    },
  );
}

export async function deleteTreeComment(shareId: string, commentId: string): Promise<void> {
  await apiFetch(
    `/api/trees/${encodeURIComponent(shareId)}/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
  );
}
