import { createClient } from '@supabase/supabase-js';

export type ShareRole = 'owner' | 'editor' | 'viewer';

export function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function resolveRole(
  supabase: ReturnType<typeof getSupabase>,
  shareId: string,
  userId: string | null,
  share: Record<string, unknown>,
): Promise<ShareRole | null> {
  if (share.visibility === 'public') {
    if (!userId) return 'viewer';
    if (userId === share.owner_id) return 'owner';
    const { data } = await supabase
      .from('share_members')
      .select('role')
      .eq('share_id', shareId)
      .eq('user_id', userId)
      .single();
    return data ? (data.role as ShareRole) : 'viewer';
  }

  if (!userId) return null;
  if (userId === share.owner_id) return 'owner';

  const { data } = await supabase
    .from('share_members')
    .select('role')
    .eq('share_id', shareId)
    .eq('user_id', userId)
    .single();

  if (data) return data.role as ShareRole;

  if (share.visibility === 'mozilla') return 'viewer';

  return null;
}
