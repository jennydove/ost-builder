import type { Config } from '@netlify/functions';
import { getSupabaseAsService, resolveRole } from './_shareUtils.mts';
import { AddMemberBodySchema, UpdateMemberRoleSchema, parseJsonBody } from './_validation.mts';
import { composeInviteEmail } from './_emailUtils.mts';
import { checkRateLimit, rateLimitResponse } from './_rateLimit.mts';

async function sendInviteEmail(opts: {
  to: string;
  inviterName: string;
  treeName: string;
  treeId: string;
  role: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn('sendInviteEmail: RESEND_API_KEY not set'); return; }
  const from = process.env.RESEND_FROM_ADDRESS || 'OST Builder <onboarding@resend.dev>';
  const appUrl = process.env.APP_BASE_URL;
  if (!appUrl) { console.warn('sendInviteEmail: APP_BASE_URL not set'); return; }

  const payload = composeInviteEmail({ ...opts, from, appUrl });
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
    console.error(`sendInviteEmail failed: ${res.status} ${body}`);
  }
}

export default async (request: Request) => {
  const parts = new URL(request.url).pathname.split('/');
  // /api/trees/<treeId>/members[/<memberId>]
  const treeId = parts[3] ?? '';
  const memberId = parts[5] ?? '';

  if (!treeId) return Response.json({ error: 'Missing tree id' }, { status: 400 });

  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const supabase = getSupabaseAsService();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return Response.json({ error: 'Invalid token' }, { status: 401 });

  const { data: tree, error: fetchError } = await supabase
    .from('trees')
    .select('*')
    .eq('id', treeId)
    .single();

  if (fetchError?.code === 'PGRST116' || !tree) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });

  const role = await resolveRole(supabase, treeId, user.id, tree as Record<string, unknown>, user.email);
  if (!role) return Response.json({ error: 'Forbidden' }, { status: 403 });

  if (request.method === 'GET') {
    const { data: rows, error } = await supabase
      .from('tree_members')
      .select('id, user_id, invited_email, role, created_at')
      .eq('tree_id', treeId)
      .order('created_at', { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const members = await Promise.all((rows ?? []).map(async (row) => {
      if (row.user_id) {
        const { data: userData } = await supabase.auth.admin.getUserById(row.user_id as string);
        const meta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
        return {
          id: row.id,
          email: userData?.user?.email ?? row.invited_email ?? '',
          name: (meta.full_name as string) || (meta.name as string) || null,
          role: row.role,
          pending: false,
          createdAt: new Date(row.created_at as string).getTime(),
        };
      }
      return {
        id: row.id,
        email: row.invited_email ?? '',
        name: null,
        role: row.role,
        pending: true,
        createdAt: new Date(row.created_at as string).getTime(),
      };
    }));

    return Response.json({ members });
  }

  if (request.method === 'POST') {
    if (role !== 'owner') {
      return Response.json({ error: 'Only the owner can invite members' }, { status: 403 });
    }

    const parsed = await parseJsonBody(request, AddMemberBodySchema);
    if (!parsed.ok) return parsed.response;

    const email = parsed.data.email.toLowerCase().trim();
    const inviteRole = parsed.data.role;

    const rl = await checkRateLimit(supabase, {
      key: `member:invite:${user.id}`,
      limit: 60,
      windowSeconds: 60,
    });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const { data: existing } = await supabase
      .from('tree_members')
      .select('id')
      .eq('tree_id', treeId)
      .ilike('invited_email', email)
      .single();

    if (existing) {
      return Response.json({ error: 'This email has already been invited' }, { status: 409 });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('tree_members')
      .insert({
        tree_id: treeId,
        user_id: null,
        invited_email: email,
        role: inviteRole,
      })
      .select('id, invited_email, role, created_at')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return Response.json({ error: 'Already a member' }, { status: 409 });
      }
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const inviterName =
      (meta.full_name as string) || (meta.name as string) || user.email || 'Someone';

    try {
      await sendInviteEmail({
        to: email,
        inviterName,
        treeName: (tree.name as string) || 'Untitled OST',
        treeId,
        role: inviteRole,
      });
    } catch (err) {
      console.error('sendInviteEmail error:', err);
    }

    return Response.json(
      {
        member: {
          id: inserted.id,
          email: inserted.invited_email,
          name: null,
          role: inserted.role,
          pending: true,
          createdAt: new Date(inserted.created_at as string).getTime(),
        },
      },
      { status: 201 },
    );
  }

  if (request.method === 'PATCH') {
    if (role !== 'owner') {
      return Response.json({ error: 'Only the owner can change roles' }, { status: 403 });
    }
    if (!memberId) return Response.json({ error: 'Missing member id' }, { status: 400 });

    const { data: target } = await supabase
      .from('tree_members')
      .select('id, role, user_id, invited_email')
      .eq('id', memberId)
      .eq('tree_id', treeId)
      .single();

    if (!target) return Response.json({ error: 'Member not found' }, { status: 404 });
    if (target.role === 'owner') {
      return Response.json({ error: 'Cannot change the owner role' }, { status: 400 });
    }

    const parsed = await parseJsonBody(request, UpdateMemberRoleSchema);
    if (!parsed.ok) return parsed.response;

    const { error } = await supabase
      .from('tree_members')
      .update({ role: parsed.data.role })
      .eq('id', memberId);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      member: {
        id: target.id,
        email: target.invited_email ?? '',
        name: null,
        role: parsed.data.role,
        pending: !target.user_id,
        createdAt: 0,
      },
    });
  }

  if (request.method === 'DELETE') {
    if (!memberId) return Response.json({ error: 'Missing member id' }, { status: 400 });

    const { data: target } = await supabase
      .from('tree_members')
      .select('id, role, user_id')
      .eq('id', memberId)
      .eq('tree_id', treeId)
      .single();

    if (!target) return Response.json({ error: 'Member not found' }, { status: 404 });

    const isSelf = target.user_id === user.id;
    if (!isSelf && role !== 'owner') {
      return Response.json({ error: 'Only the owner can remove members' }, { status: 403 });
    }
    if (target.role === 'owner' && !isSelf) {
      return Response.json({ error: 'Cannot remove the owner' }, { status: 400 });
    }

    const { error } = await supabase
      .from('tree_members')
      .delete()
      .eq('id', memberId);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config: Config = {
  path: ['/api/trees/:id/members', '/api/trees/:id/members/:memberId'],
};
