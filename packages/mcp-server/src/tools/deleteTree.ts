import { z } from 'zod';
import { apiFetch, toolErrorContent, type FetchLike } from '../http.js';
import type { ResolvedAuth } from '../auth.js';

const inputShape = {
  id: z.string().min(1, 'tree id is required'),
  confirm: z
    .literal(true)
    .describe(
      'Required safety flag. Pass `true` to confirm deletion. Forces agents to be ' +
        'explicit since deletes are irreversible.',
    ),
};

export const deleteTreeTool = (auth: ResolvedAuth, fetchImpl: FetchLike) => ({
  name: 'delete_tree',
  config: {
    description:
      'Permanently delete a tree by ID. Owner role required. This is irreversible — ' +
      'pass confirm: true to acknowledge. Returns nothing on success.',
    inputSchema: inputShape,
  },
  handler: async ({ id, confirm }: { id: string; confirm: true }) => {
    try {
      if (confirm !== true) {
        return {
          content: [
            { type: 'text' as const, text: 'Pass confirm: true to delete.' },
          ],
          isError: true as const,
        };
      }
      await apiFetch<undefined>(
        fetchImpl,
        auth.token,
        auth.apiBase,
        `/api/trees/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      return {
        content: [
          { type: 'text' as const, text: `Tree ${id} deleted.` },
        ],
      };
    } catch (e) {
      return toolErrorContent(e);
    }
  },
});
