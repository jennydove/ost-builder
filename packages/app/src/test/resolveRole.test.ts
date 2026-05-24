import { describe, it, expect, vi } from 'vitest';
import { resolveRole, type ShareRole } from '../../../../netlify/functions/_shareUtils.mts';

function mockSupabase(memberRole: ShareRole | null, isOrgMember = false) {
  const memberSingle = vi.fn().mockResolvedValue(
    memberRole
      ? { data: { role: memberRole }, error: null }
      : { data: null, error: { code: 'PGRST116' } },
  );
  const orgSingle = vi.fn().mockResolvedValue(
    isOrgMember
      ? { data: { id: 'org-member-1' }, error: null }
      : { data: null, error: { code: 'PGRST116' } },
  );

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'org_members') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: orgSingle }),
          }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: memberSingle }),
        }),
      }),
    };
  });

  return { from };
}

function share(visibility: string, ownerId = 'owner-id', orgId: string | null = null) {
  return { visibility, owner_id: ownerId, org_id: orgId } as Record<string, unknown>;
}

describe('resolveRole', () => {
  // --- link-public visibility ---

  describe('link-public visibility', () => {
    it('anonymous user gets viewer', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', null, share('link-public'));
      expect(result).toBe('viewer');
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('owner gets owner (short-circuits before DB query)', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'owner-id', share('link-public'));
      expect(result).toBe('owner');
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('explicit editor member gets editor', async () => {
      const sb = mockSupabase('editor');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('link-public'));
      expect(result).toBe('editor');
    });

    it('explicit viewer member gets viewer', async () => {
      const sb = mockSupabase('viewer');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('link-public'));
      expect(result).toBe('viewer');
    });

    it('non-member authenticated user falls back to viewer', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('link-public'));
      expect(result).toBe('viewer');
    });

    it('owner-via-membership gets owner', async () => {
      const sb = mockSupabase('owner');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('link-public'));
      expect(result).toBe('owner');
    });
  });

  // --- domain-restricted visibility ---

  describe('domain-restricted visibility', () => {
    it('anonymous user is denied', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', null, share('domain-restricted', 'owner-id', 'org-1'));
      expect(result).toBeNull();
    });

    it('owner gets owner (short-circuits before DB query)', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'owner-id', share('domain-restricted', 'owner-id', 'org-1'));
      expect(result).toBe('owner');
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('explicit editor member gets editor', async () => {
      const sb = mockSupabase('editor');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('domain-restricted', 'owner-id', 'org-1'));
      expect(result).toBe('editor');
    });

    it('explicit viewer member gets viewer', async () => {
      const sb = mockSupabase('viewer');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('domain-restricted', 'owner-id', 'org-1'));
      expect(result).toBe('viewer');
    });

    it('org member (not share member) gets viewer', async () => {
      const sb = mockSupabase(null, true);
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('domain-restricted', 'owner-id', 'org-1'));
      expect(result).toBe('viewer');
    });

    it('non-org non-member user is denied', async () => {
      const sb = mockSupabase(null, false);
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('domain-restricted', 'owner-id', 'org-1'));
      expect(result).toBeNull();
    });

    it('domain-restricted without org_id denies non-member', async () => {
      const sb = mockSupabase(null, true);
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('domain-restricted', 'owner-id', null));
      expect(result).toBeNull();
    });

    it('owner-via-membership gets owner', async () => {
      const sb = mockSupabase('owner');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('domain-restricted', 'owner-id', 'org-1'));
      expect(result).toBe('owner');
    });
  });

  // --- restricted visibility ---

  describe('restricted visibility', () => {
    it('anonymous user is denied', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', null, share('restricted'));
      expect(result).toBeNull();
    });

    it('owner gets owner (short-circuits before DB query)', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'owner-id', share('restricted'));
      expect(result).toBe('owner');
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('explicit editor member gets editor', async () => {
      const sb = mockSupabase('editor');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('restricted'));
      expect(result).toBe('editor');
    });

    it('explicit viewer member gets viewer', async () => {
      const sb = mockSupabase('viewer');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('restricted'));
      expect(result).toBe('viewer');
    });

    it('non-member authenticated user is denied', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('restricted'));
      expect(result).toBeNull();
    });

    it('owner-via-membership gets owner', async () => {
      const sb = mockSupabase('owner');
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('restricted'));
      expect(result).toBe('owner');
    });
  });

  // --- edge cases ---

  describe('edge cases', () => {
    it('unknown visibility treated as restricted (non-member denied)', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', 'user-a', share('something-else'));
      expect(result).toBeNull();
    });

    it('unknown visibility treated as restricted (anonymous denied)', async () => {
      const sb = mockSupabase(null);
      const result = await resolveRole(sb as any, 'share-1', null, share('something-else'));
      expect(result).toBeNull();
    });
  });
});
