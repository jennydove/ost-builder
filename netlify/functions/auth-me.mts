import type { Config } from '@netlify/functions';
import { getSupabase } from './_shareUtils.mts';

export default async (request: Request) => {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return Response.json({ user: null, featureEnabled: false });
  }

  const { data: { user }, error } = await getSupabase().auth.getUser(token);
  if (error || !user) {
    return Response.json({ user: null, featureEnabled: false });
  }

  return Response.json({
    user: {
      sub: user.id,
      provider: (user.app_metadata.provider as string) || 'google',
      name: (user.user_metadata.full_name as string) || (user.user_metadata.name as string) || null,
      email: user.email,
      avatarUrl: (user.user_metadata.avatar_url as string) || null,
    },
    featureEnabled: true,
  });
};

export const config: Config = { path: '/api/auth/me' };
