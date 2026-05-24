-- 0003_phase_g.sql
-- Phase G: Multi-org schema, visibility rename, RLS rewrite, last-owner trigger
--
-- DEPLOYMENT: Apply via `supabase db push` BEFORE merging the code PR.
-- During the transition window (migration applied, old code still deployed),
-- old visibility values remain valid in the CHECK constraint. The follow-up
-- migration 0004 tightens the CHECK after the code PR deploys.

BEGIN;

-- ============================================================
-- 1. Drop existing buggy RLS policies
-- ============================================================

DROP POLICY IF EXISTS "members read private shares" ON public.shares;
DROP POLICY IF EXISTS "read public shares" ON public.shares;
DROP POLICY IF EXISTS "create requires auth" ON public.shares;
DROP POLICY IF EXISTS "members see membership" ON public.share_members;
DROP POLICY IF EXISTS "read comments on accessible shares" ON public.share_comments;

-- ============================================================
-- 2. Create organizations + org_members tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  allowed_email_domains text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations OWNER TO postgres;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.organizations TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

ALTER TABLE public.org_members OWNER TO postgres;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS org_members_org_id_user_id_idx ON public.org_members (org_id, user_id);
CREATE INDEX IF NOT EXISTS org_members_user_id_org_id_idx ON public.org_members (user_id, org_id);

GRANT ALL ON TABLE public.org_members TO anon, authenticated, service_role;

-- org_members must exist before these policies reference it
CREATE POLICY org_select_member ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = organizations.id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY org_members_select ON public.org_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om2
      WHERE om2.org_id = org_members.org_id AND om2.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. Add org_id to shares
-- ============================================================

ALTER TABLE public.shares ADD COLUMN IF NOT EXISTS org_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shares_org_id_idx ON public.shares (org_id);

-- ============================================================
-- 4. Visibility rename
-- ============================================================

-- Widen CHECK to accept both old and new values during transition
ALTER TABLE public.shares DROP CONSTRAINT IF EXISTS shares_visibility_check;
ALTER TABLE public.shares ADD CONSTRAINT shares_visibility_check
  CHECK (visibility IN (
    'public', 'mozilla', 'private',
    'link-public', 'domain-restricted', 'restricted'
  ));

-- Migrate existing data to new values
UPDATE public.shares SET visibility = 'link-public' WHERE visibility = 'public';
UPDATE public.shares SET visibility = 'domain-restricted' WHERE visibility = 'mozilla';
UPDATE public.shares SET visibility = 'restricted' WHERE visibility = 'private';

-- ============================================================
-- 5. Backfill: create Mozilla org, assign existing data
-- ============================================================

INSERT INTO public.organizations (name, slug, allowed_email_domains)
VALUES ('Mozilla', 'mozilla', ARRAY['mozilla.com'])
ON CONFLICT (slug) DO NOTHING;

UPDATE public.shares
SET org_id = (SELECT id FROM public.organizations WHERE slug = 'mozilla')
WHERE org_id IS NULL;

-- Add all existing share owners as org members
INSERT INTO public.org_members (org_id, user_id, role)
SELECT DISTINCT
  (SELECT id FROM public.organizations WHERE slug = 'mozilla'),
  s.owner_id,
  'member'
FROM public.shares s
WHERE s.owner_id IS NOT NULL
ON CONFLICT (org_id, user_id) DO NOTHING;

-- Add all existing share members as org members
INSERT INTO public.org_members (org_id, user_id, role)
SELECT DISTINCT
  (SELECT id FROM public.organizations WHERE slug = 'mozilla'),
  sm.user_id,
  'member'
FROM public.share_members sm
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ============================================================
-- 6. New RLS policies on shares (6 policies)
-- ============================================================

CREATE POLICY shares_select_link_public ON public.shares FOR SELECT
  USING (visibility = 'link-public');

CREATE POLICY shares_select_domain_restricted ON public.shares FOR SELECT
  USING (
    visibility = 'domain-restricted'
    AND auth.uid() IS NOT NULL
    AND shares.org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = shares.org_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY shares_select_member ON public.shares FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.share_members sm
      WHERE sm.share_id = shares.id AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY shares_insert ON public.shares FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = owner_id);

CREATE POLICY shares_update_member ON public.shares FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.share_members sm
      WHERE sm.share_id = shares.id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'editor')
    )
  );

CREATE POLICY shares_delete ON public.shares FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.share_members sm
      WHERE sm.share_id = shares.id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

-- ============================================================
-- 7. New RLS policies on share_members (6 policies)
-- ============================================================

CREATE POLICY share_members_select ON public.share_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.share_members sm2
      WHERE sm2.share_id = share_members.share_id AND sm2.user_id = auth.uid()
    )
  );

-- Owner can invite any role; editor can invite non-owner roles only.
-- Bootstrap: the first owner row is inserted via service-role.
CREATE POLICY share_members_insert ON public.share_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.share_members sm
      WHERE sm.share_id = share_members.share_id
        AND sm.user_id = auth.uid()
        AND (
          sm.role = 'owner'
          OR (sm.role = 'editor' AND share_members.role != 'owner')
        )
    )
  );

CREATE POLICY share_members_update_owner ON public.share_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.share_members sm
      WHERE sm.share_id = share_members.share_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

CREATE POLICY share_members_update_editor ON public.share_members FOR UPDATE
  USING (
    share_members.role != 'owner'
    AND EXISTS (
      SELECT 1 FROM public.share_members sm
      WHERE sm.share_id = share_members.share_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'editor'
    )
  )
  WITH CHECK (share_members.role != 'owner');

CREATE POLICY share_members_delete_owner ON public.share_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.share_members sm
      WHERE sm.share_id = share_members.share_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

CREATE POLICY share_members_delete_editor ON public.share_members FOR DELETE
  USING (
    share_members.role != 'owner'
    AND EXISTS (
      SELECT 1 FROM public.share_members sm
      WHERE sm.share_id = share_members.share_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'editor'
    )
  );

-- ============================================================
-- 8. New RLS policies on share_comments (3 policies)
-- ============================================================

-- Anyone who can read the share can read its comments.
-- The EXISTS subquery resolves through RLS on shares.
CREATE POLICY share_comments_select ON public.share_comments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.shares s WHERE s.id = share_comments.share_id)
  );

CREATE POLICY share_comments_insert ON public.share_comments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.shares s WHERE s.id = share_id)
  );

-- Author can delete own comment; share owner can delete any comment
CREATE POLICY share_comments_delete ON public.share_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.share_members sm
      WHERE sm.share_id = share_comments.share_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

-- ============================================================
-- 9. Last-owner triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.share_members
      WHERE share_id = OLD.share_id AND role = 'owner' AND id != OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot remove the last owner of a share';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_last_owner_removal
  BEFORE DELETE ON public.share_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_removal();

CREATE OR REPLACE FUNCTION public.prevent_last_owner_demotion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.share_members
      WHERE share_id = OLD.share_id AND role = 'owner' AND id != OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot demote the last owner of a share';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_last_owner_demotion
  BEFORE UPDATE ON public.share_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_demotion();

-- ============================================================
-- 10. Ensure RLS is enabled on all tables
-- ============================================================

ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_comments ENABLE ROW LEVEL SECURITY;

COMMIT;
