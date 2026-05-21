import type { Config } from '@netlify/functions';

export default async () => {
  return Response.json({
    user: { sub: 'local', provider: 'github', name: 'OST User' },
    featureEnabled: true,
  });
};

export const config: Config = { path: '/api/auth/me' };
