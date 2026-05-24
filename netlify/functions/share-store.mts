import type { Config } from '@netlify/functions';
import { getSupabase } from './_shareUtils.mts';
import { CreateShareBodySchema, parseJsonBody } from './_validation.mts';
import {
  checkMarkdownSize,
  checkRateLimit,
  rateLimitResponse,
} from './_rateLimit.mts';

export default async (request: Request) => {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const supabase = getSupabase();

  if (request.method === 'GET') {
    if (!token) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return Response.json({ error: 'Invalid token' }, { status: 401 });

    const rl = await checkRateLimit(supabase, {
      key: `share:list:${user.id}`,
      limit: 300,
      windowSeconds: 60,
    });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Number(url.searchParams.get('pageSize') || '50'));
    const from = (page - 1) * pageSize;

    const { data: rows, error: listError } = await supabase
      .from('shares')
      .select('id, name, visibility, created_at, updated_at')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (listError) return Response.json({ error: listError.message }, { status: 500 });

    const items = (rows ?? []).map(row => ({
      id: row.id,
      name: row.name ?? null,
      visibility: row.visibility,
      createdAt: new Date(row.created_at as string).getTime(),
      updatedAt: new Date(row.updated_at as string).getTime(),
      link: `/s/${row.id}`,
    }));

    return Response.json({ items, page, pageSize, total: items.length });
  }

  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (!token) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, CreateShareBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const sizeCheck = checkMarkdownSize(body.markdown);
  if (!sizeCheck.ok) return sizeCheck.response;

  const rl = await checkRateLimit(supabase, {
    key: `share:create:${user.id}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { data: share, error: shareError } = await supabase
    .from('shares')
    .insert({
      markdown: body.markdown,
      name: body.name ?? null,
      visibility: body.visibility ?? 'public',
      settings: body.settings ?? null,
      collapsed_ids: body.collapsedIds ?? null,
      owner_id: user.id,
    })
    .select('id')
    .single();

  if (shareError) return Response.json({ error: shareError.message }, { status: 500 });

  const { error: memberError } = await supabase
    .from('share_members')
    .insert({ share_id: share.id, user_id: user.id, role: 'owner', invited_by: null });

  if (memberError) {
    await supabase.from('shares').delete().eq('id', share.id);
    return Response.json({ error: memberError.message }, { status: 500 });
  }

  return Response.json({ id: share.id, link: `/s/${share.id}` });
};

export const config: Config = { path: '/api/share/store' };
