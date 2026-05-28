import type { Config } from '@netlify/functions';
import { getSupabaseAsService, getSupabaseAsUser, resolveRole } from './_shareUtils.mts';
import { composeCommentEmail } from './_emailUtils.mts';
import { CreateCommentBodySchema, UpdateCommentBodySchema, parseJsonBody } from './_validation.mts';
import { checkRateLimit, rateLimitResponse } from './_rateLimit.mts';

async function sendCommentEmail(opts: {
  to: string;
  commenterName: string;
  shareName: string;
  shareId: string;
  body: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;

  const from = process.env.RESEND_FROM_ADDRESS || 'OST Builder <onboarding@resend.dev>';
  const appUrl = process.env.APP_BASE_URL;
  if (!appUrl) return;

  const payload = composeCommentEmail({ ...opts, from, appUrl });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`sendCommentEmail failed: ${res.status} ${body}`);
  }
}

export default async (request: Request) => {
  const parts = new URL(request.url).pathname.split('/');
  // /api/trees/<treeId>/comments[/<commentId>]
  const shareId = parts[3] ?? '';
  const commentId = parts[5] ?? '';

  if (!shareId) return Response.json({ error: 'Missing share id' }, { status: 400 });

  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const supabase = getSupabaseAsService();

  let userId: string | null = null;
  let userName: string | null = null;
  let userEmail: string | null = null;

  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    userId = user?.id ?? null;
    userEmail = user?.email ?? null;
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    userName =
      (meta.full_name as string | undefined) ||
      (meta.name as string | undefined) ||
      user?.email ||
      null;
  }

  const { data: share, error: fetchError } = await supabase
    .from('trees')
    .select('*')
    .eq('id', shareId)
    .single();

  if (fetchError?.code === 'PGRST116' || !share) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });

  const role = await resolveRole(supabase, shareId, userId, share as Record<string, unknown>, userEmail);

  if (request.method === 'GET') {
    if (!role) {
      return Response.json({ error: 'Sign in to view comments', reason: 'auth_required' }, { status: 401 });
    }

    const url = new URL(request.url);
    const cardIdFilter = url.searchParams.get('cardId');

    let query = supabase
      .from('tree_comments')
      .select('id, card_id, user_id, author_name, body, created_at')
      .eq('tree_id', shareId)
      .order('created_at', { ascending: true });

    if (cardIdFilter) {
      query = query.eq('card_id', cardIdFilter);
    }

    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      comments: (data ?? []).map(row => ({
        id: row.id,
        cardId: row.card_id,
        userId: row.user_id,
        authorName: row.author_name,
        body: row.body,
        createdAt: new Date(row.created_at as string).getTime(),
      })),
    });
  }

  if (request.method === 'POST') {
    if (!userId || !role) {
      return Response.json({ error: 'Sign in to comment', reason: 'auth_required' }, { status: 401 });
    }

    const parsed = await parseJsonBody(request, CreateCommentBodySchema);
    if (!parsed.ok) return parsed.response;
    const cardId = parsed.data.cardId.trim();
    const body = parsed.data.body.trim();
    if (!cardId) return Response.json({ error: 'cardId required' }, { status: 400 });
    if (!body) return Response.json({ error: 'Comment body required' }, { status: 400 });

    const commentRl = await checkRateLimit(supabase, {
      key: `comment:create:${userId}`,
      limit: 60,
      windowSeconds: 60,
    });
    if (!commentRl.allowed) return rateLimitResponse(commentRl.retryAfter);

    const userSupabase = getSupabaseAsUser(token!);
    const { data: inserted, error } = await userSupabase
      .from('tree_comments')
      .insert({
        tree_id: shareId,
        card_id: cardId,
        user_id: userId,
        author_name: userName,
        body,
      })
      .select('id, card_id, user_id, author_name, body, created_at')
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Owner notification, capped to 5 emails per share per minute.
    // Awaited because Netlify can tear down the function container after returning.
    if (userId !== share.owner_id) {
      try {
        const emailRl = await checkRateLimit(supabase, {
          key: `email:share:${shareId}`,
          limit: 5,
          windowSeconds: 60,
        });
        if (emailRl.allowed) {
          const { data: ownerData } = await supabase.auth.admin.getUserById(share.owner_id as string);
          if (ownerData?.user?.email) {
            await sendCommentEmail({
              to: ownerData.user.email,
              commenterName: userName || 'Someone',
              shareName: (share.name as string) || 'Untitled OST',
              shareId,
              body,
            });
          }
        }
      } catch (err) {
        console.error('sendCommentEmail error:', err);
      }
    }

    return Response.json(
      {
        comment: {
          id: inserted.id,
          cardId: inserted.card_id,
          userId: inserted.user_id,
          authorName: inserted.author_name,
          body: inserted.body,
          createdAt: new Date(inserted.created_at as string).getTime(),
        },
      },
      { status: 201 },
    );
  }

  if (request.method === 'DELETE') {
    if (!userId) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (!commentId) return Response.json({ error: 'Missing comment id' }, { status: 400 });

    const { data: existing } = await supabase
      .from('tree_comments')
      .select('id, user_id')
      .eq('id', commentId)
      .eq('tree_id', shareId)
      .single();

    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    if (existing.user_id !== userId && role !== 'owner') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userSupabase = getSupabaseAsUser(token!);
    const { error } = await userSupabase.from('tree_comments').delete().eq('id', commentId);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return new Response(null, { status: 204 });
  }

  if (request.method === 'PATCH') {
    if (!userId) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (!commentId) return Response.json({ error: 'Missing comment id' }, { status: 400 });

    const { data: existing } = await supabase
      .from('tree_comments')
      .select('id, user_id')
      .eq('id', commentId)
      .eq('tree_id', shareId)
      .single();

    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    if (existing.user_id !== userId) {
      return Response.json({ error: 'Only the author can edit a comment' }, { status: 403 });
    }

    const parsed = await parseJsonBody(request, UpdateCommentBodySchema);
    if (!parsed.ok) return parsed.response;

    const userSupabase = getSupabaseAsUser(token!);
    const { data: updated, error } = await userSupabase
      .from('tree_comments')
      .update({ body: parsed.data.body.trim() })
      .eq('id', commentId)
      .select('id, card_id, user_id, author_name, body, created_at')
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      comment: {
        id: updated.id,
        cardId: updated.card_id,
        userId: updated.user_id,
        authorName: updated.author_name,
        body: updated.body,
        createdAt: new Date(updated.created_at as string).getTime(),
      },
    });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config: Config = {
  path: [
    '/api/trees/:id/comments',
    '/api/trees/:id/comments/:commentId',
  ],
};
