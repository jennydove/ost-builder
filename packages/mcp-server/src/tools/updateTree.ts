import { z } from 'zod';
import { apiFetch, toolErrorContent, type FetchLike } from '../http.js';
import type { ResolvedAuth } from '../auth.js';

type UpdateResponse = {
  id: string;
  visibility: string;
  updatedAt: number;
};

const VisibilityEnum = z.enum(['link-public', 'domain-restricted', 'restricted']);

const inputShape = {
  id: z.string().min(1, 'tree id is required'),
  markdown: z
    .string()
    .optional()
    .describe(
      'Full replacement markdown body for the tree. This is a wholesale ' +
        'replacement — fetch with get_tree first if you only want to edit a portion.',
    ),
  name: z.string().max(500).optional().describe('New display name.'),
  visibility: VisibilityEnum
    .optional()
    .describe('New visibility. Only the owner can change this.'),
};

export const updateTreeTool = (auth: ResolvedAuth, fetchImpl: FetchLike) => ({
  name: 'update_tree',
  config: {
    description:
      'Update an existing tree by ID. Pass at least one of markdown, name, or visibility. ' +
      'Editor role required for markdown/name; owner role required for visibility. ' +
      'Use get_tree to fetch current markdown, edit, then send back via this tool.',
    inputSchema: inputShape,
  },
  handler: async (input: {
    id: string;
    markdown?: string;
    name?: string;
    visibility?: z.infer<typeof VisibilityEnum>;
  }) => {
    try {
      const body: Record<string, unknown> = {};
      if (input.markdown !== undefined) body.markdown = input.markdown;
      if (input.name !== undefined) body.name = input.name;
      if (input.visibility !== undefined) body.visibility = input.visibility;

      if (Object.keys(body).length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No changes specified. Pass at least one of markdown, name, or visibility.',
            },
          ],
          isError: true as const,
        };
      }

      const res = await apiFetch<UpdateResponse>(
        fetchImpl,
        auth.token,
        auth.apiBase,
        `/api/trees/${encodeURIComponent(input.id)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(res, null, 2) }],
      };
    } catch (e) {
      return toolErrorContent(e);
    }
  },
});
