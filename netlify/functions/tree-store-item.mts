import type { Config } from '@netlify/functions';
import { getSupabaseAsService, resolveAuthUser, resolveRole, withWriteAuth, type TreeRole } from './_shareUtils.mts';
import { UpdateShareBodySchema, parseJsonBody } from './_validation.mts';
import {
  checkMarkdownSize,
  checkRateLimit,
  rateLimitResponse,
} from './_rateLimit.mts';

function rowToPayload(row: Record<string, unknown>, role: TreeRole) {
  return {
    id: row.id,
    name: row.name ?? null,
    markdown: row.markdown,
    visibility: row.visibility,
    settings: row.settings ?? null,
    collapsedIds: (row.collapsed_ids as string[] | null) ?? [],
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
    role,
  };
}

export default async (request: Request) => {
  const id = new URL(request.url).pathname.split('/').pop() ?? '';
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

  const supabase = getSupabaseAsService();

  if (request.method === 'GET') {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');

    // GET allows anonymous viewers on link-public shares — resolve auth
    // lazily and don't require it up front.
    let userId: string | null = null;
    let userEmail: string | null = null;
    if (token) {
      const auth = await resolveAuthUser(supabase, token);
      userId = auth?.userId ?? null;
      userEmail = auth?.userEmail ?? null;
    }

    const { data: share, error: fetchError } = await supabase
      .from('trees')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError?.code === 'PGRST116' || !share) {
      return Response.json({ error: 'Not found', reason: 'not_found' }, { status: 404 });
    }
    if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });

    const role = await resolveRole(supabase, id, userId, share as Record<string, unknown>, userEmail);

    if (!role) {
      if (!userId) {
        return Response.json({ error: 'Sign in to view this share', reason: 'auth_required' }, { status: 401 });
      }
      return Response.json({ error: 'You do not have access to this share', reason: 'forbidden' }, { status: 403 });
    }

    const rateKey = userId
      ? `share:read:user:${userId}`
      : `share:read:ip:${request.headers.get('x-forwarded-for') ?? request.headers.get('x-nf-client-connection-ip') ?? 'unknown'}`;
    const rl = await checkRateLimit(supabase, { key: rateKey, limit: 300, windowSeconds: 60 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    return Response.json(rowToPayload(share as Record<string, unknown>, role));
  }

  if (request.method === 'PATCH') {
    return withWriteAuth(supabase, request, id, async (ctx) => {
      const parsed = await parseJsonBody(request, UpdateShareBodySchema);
      if (!parsed.ok) return parsed.response;
      const body = parsed.data;

      if (body.markdown !== undefined) {
        const sizeCheck = checkMarkdownSize(body.markdown);
        if (!sizeCheck.ok) return sizeCheck.response;
      }

      const rl = await checkRateLimit(supabase, {
        key: `share:update:${ctx.tokenId ?? ctx.userId}`,
        limit: 120,
        windowSeconds: 60,
      });
      if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.markdown !== undefined) updates.markdown = body.markdown;
      if (body.name !== undefined) updates.name = body.name;
      if (body.settings !== undefined) updates.settings = body.settings;
      if (body.collapsedIds !== undefined) updates.collapsed_ids = body.collapsedIds;
      if (body.visibility !== undefined) {
        if (ctx.role !== 'owner') {
          return Response.json({ error: 'Only the owner can change visibility' }, { status: 403 });
        }
        updates.visibility = body.visibility;
      }

      const { data, error } = await supabase
        .from('trees')
        .update(updates)
        .eq('id', id)
        .select('id, visibility, updated_at')
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({
        id: data.id,
        visibility: data.visibility,
        updatedAt: new Date(data.updated_at as string).getTime(),
      });
    });
  }

  if (request.method === 'DELETE') {
    return withWriteAuth(
      supabase,
      request,
      id,
      async () => {
        await supabase.from('trees').delete().eq('id', id);
        return new Response(null, { status: 204 });
      },
      { requireOwner: true },
    );
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config: Config = { path: '/api/trees/:id' };
