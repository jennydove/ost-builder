import { z } from 'zod';
import { apiFetch, toolErrorContent, type FetchLike } from '../http.js';
import type { ResolvedAuth } from '../auth.js';

type ListItem = {
  id: string;
  name: string | null;
  visibility: string;
  role: 'owner' | 'editor' | 'viewer';
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
      'List all Opportunity Solution Trees the authenticated user can access — ' +
      'both owned trees and trees shared with them. ' +
      'Returns id, name, visibility, role (owner|editor|viewer), createdAt, updatedAt, and a full url for each tree. ' +
      'Only owner and editor roles can call update_tree or delete_tree. ' +
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
