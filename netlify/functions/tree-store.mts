import type { Config } from '@netlify/functions';
import { getSupabaseAsService, resolveAuthUser } from './_shareUtils.mts';
import { CreateShareBodySchema, parseJsonBody } from './_validation.mts';
import {
  checkMarkdownSize,
  checkRateLimit,
  rateLimitResponse,
} from './_rateLimit.mts';

export default async (request: Request) => {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const supabase = getSupabaseAsService();

  if (request.method === 'GET') {
    if (!token) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const auth = await resolveAuthUser(supabase, token);
    if (!auth) return Response.json({ error: 'Invalid token' }, { status: 401 });

    const rl = await checkRateLimit(supabase, {
      key: `share:list:${auth.userId}`,
      limit: 300,
      windowSeconds: 60,
    });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Number(url.searchParams.get('pageSize') || '50'));
    const scopeParam = (url.searchParams.get('scope') || 'all').toLowerCase();
    const scope: 'owned' | 'shared' | 'all' =
      scopeParam === 'owned' || scopeParam === 'shared' ? scopeParam : 'all';

    type Row = {
      id: string;
      name: string | null;
      visibility: string;
      created_at: string;
      updated_at: string;
      role: 'owner' | 'editor' | 'viewer';
    };
    const byId = new Map<string, Row>();

    if (scope !== 'shared') {
      const { data: owned, error: ownedError } = await supabase
        .from('trees')
        .select('id, name, visibility, created_at, updated_at')
        .eq('owner_id', auth.userId)
        .order('updated_at', { ascending: false });
      if (ownedError) return Response.json({ error: ownedError.message }, { status: 500 });
      for (const row of owned ?? []) {
        byId.set(row.id as string, { ...(row as Omit<Row, 'role'>), role: 'owner' });
      }
    }

    if (scope !== 'owned') {
      // Trees where caller has an accepted membership (user_id is set — pending
      // email-only invites don't count until claimed).
      const { data: memberships, error: memberError } = await supabase
        .from('tree_members')
        .select('role, tree:trees!inner(id, name, visibility, created_at, updated_at)')
        .eq('user_id', auth.userId);
      if (memberError) return Response.json({ error: memberError.message }, { status: 500 });
      for (const m of (memberships ?? []) as Array<{
        role: 'owner' | 'editor' | 'viewer';
        tree: Omit<Row, 'role'> | null;
      }>) {
        if (!m.tree) continue;
        // Owner query already populated with role='owner'; don't downgrade it.
        if (byId.has(m.tree.id)) continue;
        byId.set(m.tree.id, { ...m.tree, role: m.role });
      }
    }

    const merged = Array.from(byId.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    const total = merged.length;
    const from = (page - 1) * pageSize;
    const pageRows = merged.slice(from, from + pageSize);

    const items = pageRows.map(row => ({
      id: row.id,
      name: row.name ?? null,
      visibility: row.visibility,
      role: row.role,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      link: `/s/${row.id}`,
    }));

    return Response.json({ items, page, pageSize, total });
  }

  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (!token) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const auth = await resolveAuthUser(supabase, token);
  if (!auth) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, CreateShareBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const sizeCheck = checkMarkdownSize(body.markdown);
  if (!sizeCheck.ok) return sizeCheck.response;

  const rl = await checkRateLimit(supabase, {
    key: `share:create:${auth.tokenId ?? auth.userId}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  // owner_id is forced from the resolved auth — never read from the request
  // body. CreateShareBodySchema is .strict() so unknown fields are rejected
  // at validation, but we still set the field explicitly here so this stays
  // safe even if the schema is ever relaxed.
  const { data: share, error: shareError } = await supabase
    .from('trees')
    .insert({
      markdown: body.markdown,
      name: body.name ?? null,
      visibility: body.visibility ?? 'link-public',
      settings: body.settings ?? null,
      collapsed_ids: body.collapsedIds ?? null,
      owner_id: auth.userId,
    })
    .select('id')
    .single();

  if (shareError) return Response.json({ error: shareError.message }, { status: 500 });

  const { error: memberError } = await supabase
    .from('tree_members')
    .insert({ tree_id: share.id, user_id: auth.userId, role: 'owner', invited_by: null, invited_email: auth.userEmail });

  if (memberError) {
    await supabase.from('trees').delete().eq('id', share.id);
    return Response.json({ error: memberError.message }, { status: 500 });
  }

  return Response.json({ id: share.id, link: `/s/${share.id}` });
};

export const config: Config = { path: '/api/trees' };
