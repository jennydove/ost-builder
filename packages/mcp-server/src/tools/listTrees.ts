import { z } from 'zod';
import { apiFetch, ApiError, type FetchLike } from '../http.js';
import type { ResolvedAuth } from '../auth.js';

type ListItem = {
  id: string;
  name: string | null;
  visibility: string;
  createdAt: number;
  updatedAt: number;
  link: string;
};

type ListResponse = {
  items: ListItem[];
  page: number;
  pageSize: number;
  total: number;
};

function reauthMessage() {
  return (
    'Authentication failed. Your PAT may be revoked or expired — generate a new ' +
    'one at https://mozost.netlify.app under Account → API tokens.'
  );
}

export const listTreesTool = (auth: ResolvedAuth, fetchImpl: FetchLike) => ({
  name: 'list_trees',
  config: {
    description:
      "List all Opportunity Solution Trees in the authenticated user's library. " +
      'Returns id, name, visibility, createdAt, updatedAt, and a shareable link path ' +
      '(prepend the API base for a full URL). Call this first to discover tree IDs.',
    inputSchema: {} as Record<string, z.ZodTypeAny>,
  },
  handler: async () => {
    try {
      const res = await apiFetch<ListResponse>(fetchImpl, auth.token, auth.apiBase, '/api/trees');
      const items = res.items.map((item) => ({
        ...item,
        url: `${auth.apiBase}${item.link}`,
      }));
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ items, total: res.total }, null, 2) },
        ],
      };
    } catch (e) {
      const status = e instanceof ApiError ? e.status : undefined;
      const message = status === 401 ? reauthMessage() : e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: 'text' as const, text: message }],
        isError: true,
      };
    }
  },
});
