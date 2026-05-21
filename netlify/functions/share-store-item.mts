import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

export default async (request: Request) => {
  const store = getStore('shares');
  const id = new URL(request.url).pathname.split('/').pop() ?? '';

  if (!id) {
    return Response.json({ error: 'Missing id' }, { status: 400 });
  }

  // GET /api/share/store/:id — retrieve a share
  if (request.method === 'GET') {
    const share = await store.getJSON(id).catch(() => null);
    if (!share) {
      return Response.json({ error: 'Not found', reason: 'not_found' }, { status: 404 });
    }
    return Response.json(share);
  }

  // PATCH /api/share/store/:id — update a share
  if (request.method === 'PATCH') {
    const existing = await store.getJSON(id).catch(() => null) as Record<string, unknown> | null;
    if (!existing) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const updated = {
      ...existing,
      ...('markdown' in body ? { markdown: body.markdown } : {}),
      ...('name' in body ? { name: body.name } : {}),
      ...('visibility' in body ? { visibility: body.visibility } : {}),
      ...('settings' in body ? { settings: body.settings } : {}),
      ...('collapsedIds' in body ? { collapsedIds: body.collapsedIds } : {}),
      updatedAt: Date.now(),
    };
    await store.setJSON(id, updated);
    return Response.json({ id, visibility: updated.visibility, updatedAt: updated.updatedAt });
  }

  // DELETE /api/share/store/:id
  if (request.method === 'DELETE') {
    await store.delete(id).catch(() => null);
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config: Config = { path: '/api/share/store/:id' };
