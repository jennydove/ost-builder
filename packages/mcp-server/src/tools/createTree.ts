import { z } from 'zod';
import { apiFetch, toolErrorContent, type FetchLike } from '../http.js';
import type { ResolvedAuth } from '../auth.js';

type CreateResponse = {
  id: string;
  link: string;
};

const VisibilityEnum = z.enum(['link-public', 'domain-restricted', 'restricted']);

const inputShape = {
  markdown: z
    .string()
    .min(1, 'markdown is required')
    .describe('OST markdown body. See get_tree output for examples of the dialect.'),
  name: z
    .string()
    .max(500)
    .optional()
    .describe('Display name for the tree. Defaults to a name derived from the first card.'),
  visibility: VisibilityEnum
    .optional()
    .describe(
      'Visibility: link-public (anyone with the URL can view), domain-restricted ' +
        '(org-members only), restricted (explicit members only). Defaults to link-public.',
    ),
};

export const createTreeTool = (auth: ResolvedAuth, fetchImpl: FetchLike) => ({
  name: 'create_tree',
  config: {
    description:
      'Create a new Opportunity Solution Tree owned by the authenticated user. ' +
      'Pass the markdown body and (optionally) a display name and visibility. ' +
      'Returns the new tree id and full URL.',
    inputSchema: inputShape,
  },
  handler: async (input: { markdown: string; name?: string; visibility?: z.infer<typeof VisibilityEnum> }) => {
    try {
      const body: Record<string, unknown> = { markdown: input.markdown };
      if (input.name !== undefined) body.name = input.name;
      if (input.visibility !== undefined) body.visibility = input.visibility;

      const res = await apiFetch<CreateResponse>(
        fetchImpl,
        auth.token,
        auth.apiBase,
        '/api/trees',
        { method: 'POST', body: JSON.stringify(body) },
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { id: res.id, url: `${auth.apiBase}${res.link}` },
              null,
              2,
            ),
          },
        ],
      };
    } catch (e) {
      return toolErrorContent(e);
    }
  },
});
