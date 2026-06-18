import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

export type TreeRole = 'owner' | 'editor' | 'viewer';

export function getSupabaseAsService() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function resolvePatUser(
  supabase: ReturnType<typeof getSupabaseAsService>,
  token: string,
): Promise<{ userId: string; tokenId: string } | null> {
  if (!token.startsWith('ost_pat_')) return null;
  const hash = hashToken(token);
  const { data } = await supabase
    .from('cli_tokens')
    .select('id, user_id, expires_at')
    .eq('token_hash', hash)
    .single();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) return null;
  // Netlify function containers tear down after the response is sent. Awaiting
  // here ensures the last_used_at write actually lands.
  await supabase.from('cli_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return { userId: data.user_id as string, tokenId: data.id as string };
}

// Creates a client that acts as the authenticated user — RLS policies apply.
// Requires SUPABASE_ANON_KEY in env (add to Netlify dashboard before Task 9 lands).
export function getSupabaseAsUser(jwt: string) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export type ResolvedAuth = {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  // Set when the request was authenticated via a PAT. Used as a stable
  // rate-limit key for PAT-driven writes so a noisy PAT doesn't share a bucket
  // with the same user's browser session.
  tokenId: string | null;
};

export async function resolveAuthUser(
  supabase: ReturnType<typeof getSupabaseAsService>,
  token: string | null,
): Promise<ResolvedAuth | null> {
  if (!token) return null;

  if (token.startsWith('ost_pat_')) {
    const pat = await resolvePatUser(supabase, token);
    if (!pat) return null;
    const { data } = await supabase.auth.admin.getUserById(pat.userId);
    const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const email = data?.user?.email ?? null;
    const name = (meta.full_name as string) || (meta.name as string) || email || null;
    return { userId: pat.userId, userName: name, userEmail: email, tokenId: pat.tokenId };
  }

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? null;
  const name = (meta.full_name as string) || (meta.name as string) || email || null;
  return { userId: user.id, userName: name, userEmail: email, tokenId: null };
}

// Lazy domain-based provisioning: when a user signs into a domain-restricted
// share but has no org_members row yet, check whether their email domain
// matches the org's allowed_email_domains and create the row on the fly.
// Returns true if the user is now an org member (newly added or already a
// member via concurrent insert).
async function tryAutoJoinOrgByDomain(
  supabase: ReturnType<typeof getSupabaseAsService>,
  orgId: string,
  userId: string,
  userEmail: string,
): Promise<boolean> {
  const at = userEmail.indexOf('@');
  if (at === -1) return false;
  const domain = userEmail.slice(at + 1).toLowerCase();
  if (!domain) return false;

  const { data: org } = await supabase
    .from('organizations')
    .select('allowed_email_domains')
    .eq('id', orgId)
    .single();

  const allowed = ((org?.allowed_email_domains as string[] | undefined) ?? [])
    .map(d => d.toLowerCase());
  if (!allowed.includes(domain)) return false;

  const { error } = await supabase
    .from('org_members')
    .insert({ org_id: orgId, user_id: userId, role: 'member' });
  // 23505 = unique_violation: another concurrent request already inserted.
  if (error && error.code !== '23505') return false;
  return true;
}

async function claimPendingInvite(
  supabase: ReturnType<typeof getSupabaseAsService>,
  treeId: string,
  userId: string,
  email: string,
): Promise<TreeRole | null> {
  const { data: pending } = await supabase
    .from('tree_members')
    .select('id, role')
    .eq('tree_id', treeId)
    .ilike('invited_email', email)
    .is('user_id', null)
    .single();

  if (!pending) return null;

  await supabase
    .from('tree_members')
    .update({ user_id: userId })
    .eq('id', pending.id);

  return pending.role as TreeRole;
}

export async function resolveRole(
  supabase: ReturnType<typeof getSupabaseAsService>,
  shareId: string,
  userId: string | null,
  share: Record<string, unknown>,
  userEmail?: string | null,
): Promise<TreeRole | null> {
  if (share.visibility === 'link-public') {
    if (!userId) return 'viewer';
    if (userId === share.owner_id) return 'owner';
    const { data } = await supabase
      .from('tree_members')
      .select('role')
      .eq('tree_id', shareId)
      .eq('user_id', userId)
      .single();
    if (data) return data.role as TreeRole;

    if (userEmail) {
      const claimed = await claimPendingInvite(supabase, shareId, userId, userEmail);
      if (claimed) return claimed;
    }

    return 'viewer';
  }

  if (!userId) return null;
  if (userId === share.owner_id) return 'owner';

  const { data } = await supabase
    .from('tree_members')
    .select('role')
    .eq('tree_id', shareId)
    .eq('user_id', userId)
    .single();

  if (data) return data.role as TreeRole;

  if (userEmail) {
    const claimed = await claimPendingInvite(supabase, shareId, userId, userEmail);
    if (claimed) return claimed;
  }

  if (share.visibility === 'domain-restricted' && share.org_id) {
    const { data: orgMember } = await supabase
      .from('org_members')
      .select('id')
      .eq('org_id', share.org_id as string)
      .eq('user_id', userId)
      .single();
    if (orgMember) return 'viewer';

    if (userEmail) {
      const joined = await tryAutoJoinOrgByDomain(
        supabase,
        share.org_id as string,
        userId,
        userEmail,
      );
      if (joined) return 'viewer';
    }
  }

  return null;
}

// Single chokepoint for write-path auth on an existing tree. Wraps the
// handler so callers can't accidentally skip the role check the way they
// could with a freestanding helper. Inner handler receives the auth context,
// the fetched share row, and the supabase client — no token/role bookkeeping
// inside the handler.
//
// Rejected requests short-circuit with a Response; the handler never runs.
// Used by PATCH and DELETE on /api/trees/:id. Create (POST /api/trees) does
// not use this wrapper because there is no existing tree to role-check —
// auth alone is sufficient, and the resolved userId is the *only* allowed
// owner_id for the new row.
export type WriteAuthContext = ResolvedAuth & {
  role: TreeRole;
  share: Record<string, unknown>;
};

export async function withWriteAuth(
  supabase: ReturnType<typeof getSupabaseAsService>,
  request: Request,
  treeId: string,
  handler: (ctx: WriteAuthContext) => Promise<Response>,
  opts: { requireOwner?: boolean } = {},
): Promise<Response> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? null;
  if (!token) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const auth = await resolveAuthUser(supabase, token);
  if (!auth) return Response.json({ error: 'Invalid token' }, { status: 401 });

  const { data: share, error: fetchError } = await supabase
    .from('trees')
    .select('*')
    .eq('id', treeId)
    .single();

  if (fetchError?.code === 'PGRST116' || !share) {
    return Response.json({ error: 'Not found', reason: 'not_found' }, { status: 404 });
  }
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });

  const role = await resolveRole(
    supabase,
    treeId,
    auth.userId,
    share as Record<string, unknown>,
    auth.userEmail,
  );

  if (!role || role === 'viewer') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (opts.requireOwner && role !== 'owner') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  return handler({ ...auth, role, share: share as Record<string, unknown> });
}
