import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Supabase mock infrastructure ----------

type MockRow = Record<string, unknown>;

function chainMock(terminalValue: unknown) {
  const terminal = vi.fn().mockResolvedValue(terminalValue);
  const builder: Record<string, any> = {};
  const chainable = ['select', 'eq', 'order', 'range', 'insert', 'update', 'delete', 'from'];
  for (const m of chainable) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  builder.single = terminal;
  return builder;
}

interface MockSupabaseConfig {
  user?: { id: string; email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null;
  share?: MockRow | null;
  shareError?: { code: string; message: string } | null;
  memberRole?: string | null;
  shares?: MockRow[];
  insertedShare?: MockRow | null;
  insertMemberError?: { message: string } | null;
  updatedShare?: MockRow | null;
  comments?: MockRow[];
  insertedComment?: MockRow | null;
  existingComment?: MockRow | null;
  ownerUser?: { email?: string } | null;
}

function createMockSupabase(config: MockSupabaseConfig = {}) {
  const {
    user = null,
    share = null,
    shareError = null,
    memberRole = null,
    shares = [],
    insertedShare = null,
    insertMemberError = null,
    updatedShare = null,
    comments = [],
    insertedComment = null,
    existingComment = null,
    ownerUser = null,
  } = config;

  const mock: any = {
    auth: {
      getUser: vi.fn().mockResolvedValue(
        user
          ? { data: { user: { ...user, app_metadata: user.app_metadata ?? {}, user_metadata: user.user_metadata ?? {} } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
      admin: {
        getUserById: vi.fn().mockResolvedValue(
          ownerUser
            ? { data: { user: ownerUser }, error: null }
            : { data: null, error: { message: 'Not found' } },
        ),
      },
    },
    rpc: vi.fn().mockResolvedValue({ data: { allowed: true, retry_after: 0 }, error: null }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'trees') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, _val: unknown) => ({
              single: vi.fn().mockResolvedValue(
                shareError
                  ? { data: null, error: shareError }
                  : share
                    ? { data: share, error: null }
                    : { data: null, error: { code: 'PGRST116', message: 'Not found' } },
              ),
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: shares, error: null }),
              }),
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(
                  share ? { data: share, error: null } : { data: null, error: { code: 'PGRST116' } },
                ),
              }),
            })),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                insertedShare
                  ? { data: insertedShare, error: null }
                  : { data: null, error: { message: 'Insert failed' } },
              ),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(
                  updatedShare
                    ? { data: updatedShare, error: null }
                    : { data: null, error: { message: 'Update failed' } },
                ),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }

      if (table === 'tree_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(
                  memberRole
                    ? { data: { role: memberRole }, error: null }
                    : { data: null, error: { code: 'PGRST116' } },
                ),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue(
            insertMemberError
              ? { error: insertMemberError }
              : { error: null },
          ),
        };
      }

      if (table === 'tree_comments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, _val: unknown) => ({
              order: vi.fn().mockResolvedValue({ data: comments, error: null }),
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(
                  existingComment
                    ? { data: existingComment, error: null }
                    : { data: null, error: { code: 'PGRST116' } },
                ),
                order: vi.fn().mockResolvedValue({ data: comments, error: null }),
              }),
              single: vi.fn().mockResolvedValue(
                existingComment
                  ? { data: existingComment, error: null }
                  : { data: null, error: { code: 'PGRST116' } },
              ),
            })),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                insertedComment
                  ? { data: insertedComment, error: null }
                  : { data: null, error: { message: 'Insert failed' } },
              ),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }

      return chainMock({ data: null, error: null });
    }),
  };

  return mock;
}

// ---------- Module mocking ----------

let mockSb: any;

vi.mock('@supabase/supabase-js', () => ({
  createClient: (..._args: unknown[]) => mockSb,
}));

// Set env vars before importing handlers
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

// ---------- Helpers ----------

function makeRequest(method: string, url: string, body?: unknown, token?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const VALID_TOKEN = 'valid-jwt-token';
const USER = { id: 'user-1', email: 'test@example.com', user_metadata: { full_name: 'Test User' }, app_metadata: { provider: 'google' } };
const OWNER_USER = { id: 'owner-1', email: 'owner@example.com', user_metadata: { full_name: 'Owner' }, app_metadata: {} };

// ---------- auth-me tests ----------

describe('auth-me', () => {
  let handler: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../netlify/functions/auth-me.mts');
    handler = mod.default;
  });

  it('returns user data with valid token', async () => {
    mockSb = createMockSupabase({ user: USER });
    const res = await handler(makeRequest('GET', 'http://localhost/api/auth/me', undefined, VALID_TOKEN));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.user.sub).toBe('user-1');
    expect(json.user.email).toBe('test@example.com');
    expect(json.featureEnabled).toBe(true);
  });

  it('returns null user when no token', async () => {
    mockSb = createMockSupabase();
    const res = await handler(makeRequest('GET', 'http://localhost/api/auth/me'));
    const json = await res.json();
    expect(json.user).toBeNull();
    expect(json.featureEnabled).toBe(false);
  });

  it('returns null user with invalid token', async () => {
    mockSb = createMockSupabase({ user: null });
    const res = await handler(makeRequest('GET', 'http://localhost/api/auth/me', undefined, 'bad-token'));
    const json = await res.json();
    expect(json.user).toBeNull();
    expect(json.featureEnabled).toBe(false);
  });
});

// ---------- share-store tests ----------

describe('share-store', () => {
  let handler: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../netlify/functions/tree-store.mts');
    handler = mod.default;
  });

  describe('POST (create share)', () => {
    it('creates share with valid token and body', async () => {
      mockSb = createMockSupabase({
        user: USER,
        insertedShare: { id: 'new-share-1' },
      });
      const res = await handler(makeRequest(
        'POST',
        'http://localhost/api/trees',
        { markdown: '# Test', name: 'Test OST', visibility: 'link-public' },
        VALID_TOKEN,
      ));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.id).toBe('new-share-1');
      expect(json.link).toBe('/s/new-share-1');
    });

    it('returns 401 without token', async () => {
      mockSb = createMockSupabase();
      const res = await handler(makeRequest(
        'POST',
        'http://localhost/api/trees',
        { markdown: '# Test' },
      ));
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      mockSb = createMockSupabase({ user: null });
      const res = await handler(makeRequest(
        'POST',
        'http://localhost/api/trees',
        { markdown: '# Test' },
        'bad-token',
      ));
      expect(res.status).toBe(401);
    });
  });

  describe('GET (list shares)', () => {
    it('returns paginated list for authenticated user', async () => {
      mockSb = createMockSupabase({
        user: USER,
        shares: [
          { id: 's1', name: 'Share 1', visibility: 'link-public', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
        ],
      });
      const res = await handler(makeRequest(
        'GET',
        'http://localhost/api/trees',
        undefined,
        VALID_TOKEN,
      ));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.items).toHaveLength(1);
      expect(json.items[0].id).toBe('s1');
    });

    it('returns 401 without token', async () => {
      mockSb = createMockSupabase();
      const res = await handler(makeRequest('GET', 'http://localhost/api/trees'));
      expect(res.status).toBe(401);
    });
  });
});

// ---------- share-store-item tests ----------

describe('share-store-item', () => {
  let handler: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../netlify/functions/tree-store-item.mts');
    handler = mod.default;
  });

  describe('GET (read share)', () => {
    it('returns share with viewer role for public+anonymous', async () => {
      mockSb = createMockSupabase({
        share: { id: 's1', visibility: 'link-public', owner_id: 'owner-1', markdown: '# Test', name: 'Test', settings: null, collapsed_ids: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
      });
      const res = await handler(makeRequest('GET', 'http://localhost/api/trees/s1'));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.role).toBe('viewer');
      expect(json.markdown).toBe('# Test');
    });

    it('returns share with owner role for owner', async () => {
      mockSb = createMockSupabase({
        user: OWNER_USER,
        share: { id: 's1', visibility: 'link-public', owner_id: 'owner-1', markdown: '# Test', name: 'Test', settings: null, collapsed_ids: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
      });
      const res = await handler(makeRequest('GET', 'http://localhost/api/trees/s1', undefined, VALID_TOKEN));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.role).toBe('owner');
    });

    it('returns 404 for nonexistent share', async () => {
      mockSb = createMockSupabase({ share: null });
      const res = await handler(makeRequest('GET', 'http://localhost/api/trees/nonexistent'));
      expect(res.status).toBe(404);
    });

    it('returns 401 for private share without auth', async () => {
      mockSb = createMockSupabase({
        share: { id: 's1', visibility: 'restricted', owner_id: 'owner-1', markdown: '# Test', name: 'Test', settings: null, collapsed_ids: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
      });
      const res = await handler(makeRequest('GET', 'http://localhost/api/trees/s1'));
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH (update share)', () => {
    it('allows owner to update', async () => {
      mockSb = createMockSupabase({
        user: OWNER_USER,
        share: { id: 's1', visibility: 'link-public', owner_id: 'owner-1', markdown: '# Test', name: 'Test', settings: null, collapsed_ids: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
        updatedShare: { id: 's1', visibility: 'link-public', updated_at: '2026-01-03T00:00:00Z' },
      });
      const res = await handler(makeRequest(
        'PATCH',
        'http://localhost/api/trees/s1',
        { markdown: '# Updated' },
        VALID_TOKEN,
      ));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.id).toBe('s1');
    });

    it('returns 403 for viewer trying to update', async () => {
      mockSb = createMockSupabase({
        user: USER,
        share: { id: 's1', visibility: 'link-public', owner_id: 'owner-1', markdown: '# Test', name: 'Test', settings: null, collapsed_ids: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
        memberRole: null,
      });
      const res = await handler(makeRequest(
        'PATCH',
        'http://localhost/api/trees/s1',
        { markdown: '# Hack' },
        VALID_TOKEN,
      ));
      // non-member on public share is viewer → 403
      expect(res.status).toBe(403);
    });

    it('returns 403 when editor tries to change visibility', async () => {
      mockSb = createMockSupabase({
        user: USER,
        share: { id: 's1', visibility: 'link-public', owner_id: 'owner-1', markdown: '# Test', name: 'Test', settings: null, collapsed_ids: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
        memberRole: 'editor',
      });
      const res = await handler(makeRequest(
        'PATCH',
        'http://localhost/api/trees/s1',
        { visibility: 'restricted' },
        VALID_TOKEN,
      ));
      expect(res.status).toBe(403);
    });

    it('returns 401 without auth', async () => {
      mockSb = createMockSupabase({
        share: { id: 's1', visibility: 'link-public', owner_id: 'owner-1', markdown: '# Test', name: 'Test', settings: null, collapsed_ids: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
      });
      const res = await handler(makeRequest(
        'PATCH',
        'http://localhost/api/trees/s1',
        { markdown: '# Hack' },
      ));
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE', () => {
    it('allows owner to delete', async () => {
      mockSb = createMockSupabase({
        user: OWNER_USER,
        share: { id: 's1', visibility: 'link-public', owner_id: 'owner-1', markdown: '# Test', name: 'Test', settings: null, collapsed_ids: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
      });
      const res = await handler(makeRequest(
        'DELETE',
        'http://localhost/api/trees/s1',
        undefined,
        VALID_TOKEN,
      ));
      expect(res.status).toBe(204);
    });

    it('returns 403 for non-owner', async () => {
      mockSb = createMockSupabase({
        user: USER,
        share: { id: 's1', visibility: 'link-public', owner_id: 'owner-1', markdown: '# Test', name: 'Test', settings: null, collapsed_ids: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
        memberRole: 'editor',
      });
      const res = await handler(makeRequest(
        'DELETE',
        'http://localhost/api/trees/s1',
        undefined,
        VALID_TOKEN,
      ));
      expect(res.status).toBe(403);
    });

    it('returns 401 without auth', async () => {
      mockSb = createMockSupabase({
        share: { id: 's1', visibility: 'link-public', owner_id: 'owner-1', markdown: '# Test', name: 'Test', settings: null, collapsed_ids: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
      });
      const res = await handler(makeRequest(
        'DELETE',
        'http://localhost/api/trees/s1',
      ));
      expect(res.status).toBe(401);
    });
  });
});

// ---------- share-store-comments tests ----------

describe('share-store-comments', () => {
  let handler: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../../../netlify/functions/tree-store-comments.mts');
    handler = mod.default;
  });

  const publicShare = { id: 's1', visibility: 'link-public', owner_id: 'owner-1', markdown: '# Test', name: 'Test', settings: null, collapsed_ids: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' };

  describe('GET (list comments)', () => {
    it('returns comments for authenticated user on public share', async () => {
      mockSb = createMockSupabase({
        user: USER,
        share: publicShare,
        comments: [
          { id: 'c1', card_id: 'card-1', user_id: 'user-1', author_name: 'Test User', body: 'Hello', created_at: '2026-01-01T00:00:00Z' },
        ],
      });
      const res = await handler(makeRequest(
        'GET',
        'http://localhost/api/trees/s1/comments',
        undefined,
        VALID_TOKEN,
      ));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.comments).toHaveLength(1);
      expect(json.comments[0].id).toBe('c1');
    });

    it('returns 401 for private share without auth', async () => {
      mockSb = createMockSupabase({
        share: { ...publicShare, visibility: 'restricted' },
      });
      const res = await handler(makeRequest(
        'GET',
        'http://localhost/api/trees/s1/comments',
      ));
      expect(res.status).toBe(401);
    });
  });

  describe('POST (create comment)', () => {
    it('creates comment and returns 201', async () => {
      mockSb = createMockSupabase({
        user: USER,
        share: publicShare,
        insertedComment: { id: 'c-new', card_id: 'card-1', user_id: 'user-1', author_name: 'Test User', body: 'New comment', created_at: '2026-01-01T00:00:00Z' },
      });
      const res = await handler(makeRequest(
        'POST',
        'http://localhost/api/trees/s1/comments',
        { cardId: 'card-1', body: 'New comment' },
        VALID_TOKEN,
      ));
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.comment.id).toBe('c-new');
    });

    it('returns 401 without auth', async () => {
      mockSb = createMockSupabase({ share: publicShare });
      const res = await handler(makeRequest(
        'POST',
        'http://localhost/api/trees/s1/comments',
        { cardId: 'card-1', body: 'Anon comment' },
      ));
      expect(res.status).toBe(401);
    });

    it('returns 400 for empty body', async () => {
      mockSb = createMockSupabase({ user: USER, share: publicShare });
      const res = await handler(makeRequest(
        'POST',
        'http://localhost/api/trees/s1/comments',
        { cardId: 'card-1', body: '' },
        VALID_TOKEN,
      ));
      expect(res.status).toBe(400);
    });

    it('returns 400 for empty cardId', async () => {
      mockSb = createMockSupabase({ user: USER, share: publicShare });
      const res = await handler(makeRequest(
        'POST',
        'http://localhost/api/trees/s1/comments',
        { cardId: '', body: 'Hello' },
        VALID_TOKEN,
      ));
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE (delete comment)', () => {
    it('allows comment author to delete', async () => {
      mockSb = createMockSupabase({
        user: USER,
        share: publicShare,
        existingComment: { id: 'c1', user_id: 'user-1' },
      });
      const res = await handler(makeRequest(
        'DELETE',
        'http://localhost/api/trees/s1/comments/c1',
        undefined,
        VALID_TOKEN,
      ));
      expect(res.status).toBe(204);
    });

    it('allows share owner to delete any comment', async () => {
      mockSb = createMockSupabase({
        user: OWNER_USER,
        share: publicShare,
        existingComment: { id: 'c1', user_id: 'user-1' },
      });
      const res = await handler(makeRequest(
        'DELETE',
        'http://localhost/api/trees/s1/comments/c1',
        undefined,
        VALID_TOKEN,
      ));
      expect(res.status).toBe(204);
    });

    it('returns 403 for non-author non-owner', async () => {
      mockSb = createMockSupabase({
        user: { id: 'user-other', email: 'other@example.com' },
        share: publicShare,
        memberRole: 'editor',
        existingComment: { id: 'c1', user_id: 'user-1' },
      });
      const res = await handler(makeRequest(
        'DELETE',
        'http://localhost/api/trees/s1/comments/c1',
        undefined,
        VALID_TOKEN,
      ));
      expect(res.status).toBe(403);
    });

    it('returns 404 for nonexistent comment', async () => {
      mockSb = createMockSupabase({
        user: USER,
        share: publicShare,
        existingComment: null,
      });
      const res = await handler(makeRequest(
        'DELETE',
        'http://localhost/api/trees/s1/comments/nonexistent',
        undefined,
        VALID_TOKEN,
      ));
      expect(res.status).toBe(404);
    });

    it('returns 401 without auth', async () => {
      mockSb = createMockSupabase({ share: publicShare });
      const res = await handler(makeRequest(
        'DELETE',
        'http://localhost/api/trees/s1/comments/c1',
      ));
      expect(res.status).toBe(401);
    });
  });
});
