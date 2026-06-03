import { z } from 'zod';
import { apiFetch, toolErrorContent, type FetchLike } from '../http.js';
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

export const listTreesTool = (auth: ResolvedAuth, fetchImpl: FetchLike) => ({
  name: 'list_trees',
  config: {
    description:
      "List all Opportunity Solution Trees in the authenticated user's library. " +
      'Returns id, name, visibility, createdAt, updatedAt, and a full url for each tree. ' +
      'Call this first to discover tree IDs.',
    inputSchema: {} as Record<string, z.ZodTypeAny>,
  },
  handler: async () => {
    try {
      const res = await apiFetch<ListResponse>(fetchImpl, auth.token, auth.apiBase, '/api/trees');
      const items = res.items.map(({ link, ...rest }) => ({
        ...rest,
        url: `${auth.apiBase}${link}`,
      }));
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ items, total: res.total }, null, 2) },
        ],
      };
    } catch (e) {
      return toolErrorContent(e);
    }
  },
});
