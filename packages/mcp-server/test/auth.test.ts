import { describe, it, expect } from 'vitest';
import { resolveAuth } from '../src/auth.js';

describe('resolveAuth', () => {
  it('uses OST_PAT env var when set', () => {
    const auth = resolveAuth({
      env: { OST_PAT: 'ost_pat_env', OST_API_BASE: 'https://example.com' },
      loadSession: () => ({ token: 'ost_pat_session', apiBase: 'https://other.example.com', savedAt: 0 }),
    });
    expect(auth.token).toBe('ost_pat_env');
    expect(auth.apiBase).toBe('https://example.com');
  });

  it('OST_PAT wins even when session exists', () => {
    const auth = resolveAuth({
      env: { OST_PAT: 'ost_pat_env' },
      loadSession: () => ({ token: 'ost_pat_session', apiBase: 'https://session.example.com', savedAt: 0 }),
    });
    expect(auth.token).toBe('ost_pat_env');
    // default API base when env doesn't set OST_API_BASE
    expect(auth.apiBase).toBe('https://mozost.netlify.app');
  });

  it('falls back to CLI session when OST_PAT is unset', () => {
    const auth = resolveAuth({
      env: {},
      loadSession: () => ({ token: 'ost_pat_session', apiBase: 'https://session.example.com/', savedAt: 0 }),
    });
    expect(auth.token).toBe('ost_pat_session');
    // trailing slash stripped
    expect(auth.apiBase).toBe('https://session.example.com');
  });

  it('throws helpful error when both are missing', () => {
    expect(() =>
      resolveAuth({
        env: {},
        loadSession: () => null,
      }),
    ).toThrow(/OST_PAT/);
    expect(() =>
      resolveAuth({
        env: {},
        loadSession: () => null,
      }),
    ).toThrow(/auth login/);
  });

  it('OST_API_BASE overrides default', () => {
    const auth = resolveAuth({
      env: { OST_PAT: 'ost_pat_x', OST_API_BASE: 'http://localhost:8888/' },
      loadSession: () => null,
    });
    expect(auth.apiBase).toBe('http://localhost:8888');
  });
});
