import type { Config } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;

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
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
};

export const config: Config = { path: '/api/share/store' };
