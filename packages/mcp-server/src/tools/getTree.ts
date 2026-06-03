import { z } from 'zod';
import { apiFetch, toolErrorContent, type FetchLike } from '../http.js';
import type { ResolvedAuth } from '../auth.js';

type TreePayload = {
  id: string;
  name: string | null;
  markdown: string;
  visibility: string;
  settings: unknown;
  collapsedIds: string[];
  createdAt: number;
  updatedAt: number;
  role: 'owner' | 'editor' | 'viewer';
};

const inputShape = { id: z.string().min(1, 'tree id is required') };

export const getTreeTool = (auth: ResolvedAuth, fetchImpl: FetchLike) => ({
  name: 'get_tree',
  config: {
    description:
      'Fetch a tree by ID. Returns the full payload including raw markdown, name, ' +
      "visibility, settings, collapsedIds, and the caller's role. Use when the user wants " +
      'markdown for reading, editing, or export. For structural queries (counts, traversal), ' +
      'prefer get_tree_json.',
    inputSchema: inputShape,
  },
  handler: async ({ id }: { id: string }) => {
    try {
      const payload = await apiFetch<TreePayload>(
        fetchImpl,
        auth.token,
        auth.apiBase,
        `/api/trees/${encodeURIComponent(id)}`,
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
      };
    } catch (e) {
      return toolErrorContent(e);
    }
  },
});
