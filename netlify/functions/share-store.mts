import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

export default async (request: Request) => {
  const store = getStore('shares');

  // POST /api/share/store — create a new share
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const now = Date.now();
    const ttlDays = body.ttlDays ?? 90;
    const share = {
      id,
      markdown: body.markdown ?? '',
      name: body.name ?? null,
      visibility: body.visibility ?? 'public',
      settings: body.settings ?? null,
      collapsedIds: body.collapsedIds ?? [],
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ttlDays * 24 * 60 * 60 * 1000,
      status: 'active',
      isOwner: true,
    };
    await store.setJSON(id, share);
    const origin = new URL(request.url).origin;
    return Response.json({
      id,
      link: `${origin}/s/${id}`,
      expiresAt: share.expiresAt,
      visibility: share.visibility,
      status: 'active',
    });
  }

  // GET /api/share/store — list (stub; not needed for sharing)
  return Response.json({ items: [], page: 1, pageSize: 20, total: 0 });
};

export const config: Config = { path: '/api/share/store' };
