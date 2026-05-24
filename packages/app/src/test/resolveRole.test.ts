import { describe, it, expect, vi } from 'vitest';
import { resolveRole, type ShareRole } from '../../../../netlify/functions/_shareUtils.mts';

function mockSupabase(memberRole: ShareRole | null) {
  const single = vi.fn().mockResolvedValue(
    memberRole
      ? { data: { role: memberRole }, error: null }
      : { data: null, error: { code: 'PGRST116' } },
  );
  const eq2 = vi.fn().mockReturnValue({ single });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });

  return { from, _calls: { select, eq1, eq2, single } };
}

function share(visibility: string, ownerId = 'owner-id') {
  return { visibility, owner_id: ownerId } as Record<string, unknown>;
}

describe('resolveRole', () => {
  // --- public visibility ---

  describe('public visibility', () => {
    it('anonymous user gets viewer', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', null, share('public'));
      expect(result).toBe('viewer');
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('owner gets owner (short-circuits before DB query)', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'owner-id', share('public'));
      expect(result).toBe('owner');
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('explicit editor member gets editor', async () => {
      const sb = mockSupabase('editor');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('public'));
      expect(result).toBe('editor');
    });

    it('explicit viewer member gets viewer', async () => {
      const sb = mockSupabase('viewer');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('public'));
      expect(result).toBe('viewer');
    });

    it('non-member authenticated user falls back to viewer', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('public'));
      expect(result).toBe('viewer');
    });

    it('owner-via-membership gets owner', async () => {
      const sb = mockSupabase('owner');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('public'));
      expect(result).toBe('owner');
    });
  });

  // --- mozilla visibility ---

  describe('mozilla visibility', () => {
    it('anonymous user is denied', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', null, share('mozilla'));
      expect(result).toBeNull();
    });

    it('owner gets owner (short-circuits before DB query)', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'owner-id', share('mozilla'));
      expect(result).toBe('owner');
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('explicit editor member gets editor', async () => {
      const sb = mockSupabase('editor');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('mozilla'));
      expect(result).toBe('editor');
    });

    it('explicit viewer member gets viewer', async () => {
      const sb = mockSupabase('viewer');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('mozilla'));
      expect(result).toBe('viewer');
    });

    it('non-member authenticated user gets viewer (mozilla = org-wide access)', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('mozilla'));
      expect(result).toBe('viewer');
    });

    it('owner-via-membership gets owner', async () => {
      const sb = mockSupabase('owner');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('mozilla'));
      expect(result).toBe('owner');
    });
  });

  // --- private visibility ---

  describe('private visibility', () => {
    it('anonymous user is denied', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', null, share('private'));
      expect(result).toBeNull();
    });

    it('owner gets owner (short-circuits before DB query)', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'owner-id', share('private'));
      expect(result).toBe('owner');
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('explicit editor member gets editor', async () => {
      const sb = mockSupabase('editor');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('private'));
      expect(result).toBe('editor');
    });

    it('explicit viewer member gets viewer', async () => {
      const sb = mockSupabase('viewer');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('private'));
      expect(result).toBe('viewer');
    });

    it('non-member authenticated user is denied', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('private'));
      expect(result).toBeNull();
    });

    it('owner-via-membership gets owner', async () => {
      const sb = mockSupabase('owner');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('private'));
      expect(result).toBe('owner');
    });
  });

  // --- edge cases ---

  describe('edge cases', () => {
    it('unknown visibility treated as private (non-member denied)', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('something-else'));
      expect(result).toBeNull();
    });

    it('unknown visibility treated as private (anonymous denied)', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', null, share('something-else'));
      expect(result).toBeNull();
    });
  });
});
