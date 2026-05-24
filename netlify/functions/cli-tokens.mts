import type { Config } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import { getSupabaseAsService, hashToken } from './_shareUtils.mts';

export default async (request: Request) => {
  const supabase = getSupabaseAsService();

  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return Response.json({ error: 'Invalid token' }, { status: 401 });

  if (request.method === 'GET') {
    const { data, error } = await supabase
      .from('cli_tokens')
      .select('id, label, last_used_at, expires_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      tokens: (data ?? []).map(t => ({
        id: t.id,
        label: t.label,
        lastUsedAt: t.last_used_at,
        expiresAt: t.expires_at,
        createdAt: t.created_at,
      })),
    });
  }

  if (request.method === 'POST') {
    let body: { label?: string } = {};
    try {
      body = await request.json() as { label?: string };
    } catch { /* empty body ok */ }

    const label = (body.label || '').trim().slice(0, 100) || 'CLI token';
    const raw = `ost_pat_${randomBytes(32).toString('hex')}`;
    const hash = hashToken(raw);

    const { error } = await supabase
      .from('cli_tokens')
      .insert({ user_id: user.id, token_hash: hash, label });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ token: raw, label }, { status: 201 });
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const tokenId = parts[parts.length - 1];

    if (!tokenId) return Response.json({ error: 'Missing token id' }, { status: 400 });

    const { error } = await supabase
      .from('cli_tokens')
      .delete()
      .eq('id', tokenId)
      .eq('user_id', user.id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config: Config = {
  path: ['/api/cli/tokens', '/api/cli/tokens/:id'],
};
