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
  void supabase.from('cli_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return { userId: data.user_id as string, tokenId: data.id as string };
}

// Creates a client that acts as the authenticated user — RLS policies apply.
// Requires SUPABASE_ANON_KEY in env (add to Netlify dashboard before Task 9 lands).
export function getSupabaseAsUser(jwt: string) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export async function resolveAuthUser(
  supabase: ReturnType<typeof getSupabaseAsService>,
  token: string | null,
): Promise<{ userId: string; userName: string | null } | null> {
  if (!token) return null;

  if (token.startsWith('ost_pat_')) {
    const pat = await resolvePatUser(supabase, token);
    if (!pat) return null;
    const { data } = await supabase.auth.admin.getUserById(pat.userId);
    const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const name = (meta.full_name as string) || (meta.name as string) || data?.user?.email || null;
    return { userId: pat.userId, userName: name };
  }

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = (meta.full_name as string) || (meta.name as string) || user.email || null;
  return { userId: user.id, userName: name };
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
  }

  return null;
}
