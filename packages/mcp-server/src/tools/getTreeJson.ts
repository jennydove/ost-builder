import { z } from 'zod';
import { parseMarkdownToTree } from '@ost-builder/shared';
import { apiFetch, ApiError, type FetchLike } from '../http.js';
import type { ResolvedAuth } from '../auth.js';

type TreePayload = {
  id: string;
  name: string | null;
  markdown: string;
  visibility: string;
  role: 'owner' | 'editor' | 'viewer';
};

const inputShape = { id: z.string().min(1, 'tree id is required') };

function reauthMessage() {
  return (
    'Authentication failed. Your PAT may be revoked or expired — generate a new ' +
    'one at https://mozost.netlify.app under Account → API tokens.'
  );
}

export const getTreeJsonTool = (auth: ResolvedAuth, fetchImpl: FetchLike) => ({
  name: 'get_tree_json',
  config: {
    description:
      'Fetch a tree and return the parsed OSTTree — a map of cards typed as ' +
      'outcome / opportunity / solution / experiment, each with parentId, children, ' +
      'status, and (for outcomes) metrics. Use when reasoning about tree structure or ' +
      'counts. Do not also call get_tree for the same id; markdown is fetched internally.',
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
      const tree = parseMarkdownToTree(payload.markdown);
      const body = {
        id: payload.id,
        name: payload.name,
        visibility: payload.visibility,
        role: payload.role,
        tree,
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
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
