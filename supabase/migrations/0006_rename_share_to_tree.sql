-- 0006_rename_share_to_tree.sql
-- Phase H: Rename share → tree tables (DDD-aligned vocabulary)
--
-- Strategy: rename tables, drop old RLS policies, create new ones
-- with updated references, then create backward-compatible views
-- so old code continues to work during the deployment window.

BEGIN;

-- ============================================================
-- 1. Drop all existing RLS policies (they reference old names)
-- ============================================================

-- shares policies
DROP POLICY IF EXISTS shares_select_link_public ON public.shares;
DROP POLICY IF EXISTS shares_select_domain_restricted ON public.shares;
DROP POLICY IF EXISTS shares_select_member ON public.shares;
DROP POLICY IF EXISTS shares_insert ON public.shares;
DROP POLICY IF EXISTS shares_update_member ON public.shares;
DROP POLICY IF EXISTS shares_delete ON public.shares;

-- share_members policies
DROP POLICY IF EXISTS share_members_select ON public.share_members;
DROP POLICY IF EXISTS share_members_insert ON public.share_members;
DROP POLICY IF EXISTS share_members_update_owner ON public.share_members;
DROP POLICY IF EXISTS share_members_update_editor ON public.share_members;
DROP POLICY IF EXISTS share_members_delete_owner ON public.share_members;
DROP POLICY IF EXISTS share_members_delete_editor ON public.share_members;

-- share_comments policies
DROP POLICY IF EXISTS share_comments_select ON public.share_comments;
DROP POLICY IF EXISTS share_comments_insert ON public.share_comments;
DROP POLICY IF EXISTS share_comments_delete ON public.share_comments;

-- ============================================================
-- 2. Drop triggers before rename (recreate after)
-- ============================================================

DROP TRIGGER IF EXISTS trg_prevent_last_owner_removal ON public.share_members;
DROP TRIGGER IF EXISTS trg_prevent_last_owner_demotion ON public.share_members;

-- ============================================================
-- 3. Rename tables
-- ============================================================

ALTER TABLE public.shares RENAME TO trees;
ALTER TABLE public.share_members RENAME TO tree_members;
ALTER TABLE public.share_comments RENAME TO tree_comments;

-- Rename foreign key columns
ALTER TABLE public.tree_members RENAME COLUMN share_id TO tree_id;
ALTER TABLE public.tree_comments RENAME COLUMN share_id TO tree_id;

-- ============================================================
-- 4. Recreate RLS policies with new names
-- ============================================================

-- trees policies (6)
CREATE POLICY trees_select_link_public ON public.trees FOR SELECT
  USING (visibility = 'link-public');

CREATE POLICY trees_select_domain_restricted ON public.trees FOR SELECT
  USING (
    visibility = 'domain-restricted'
    AND auth.uid() IS NOT NULL
    AND trees.org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = trees.org_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY trees_select_member ON public.trees FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tree_members tm
      WHERE tm.tree_id = trees.id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY trees_insert ON public.trees FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = owner_id);

CREATE POLICY trees_update_member ON public.trees FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_members tm
      WHERE tm.tree_id = trees.id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'editor')
    )
  );

CREATE POLICY trees_delete ON public.trees FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_members tm
      WHERE tm.tree_id = trees.id
        AND tm.user_id = auth.uid()
        AND tm.role = 'owner'
    )
  );

-- tree_members policies (6)
CREATE POLICY tree_members_select ON public.tree_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_members tm2
      WHERE tm2.tree_id = tree_members.tree_id AND tm2.user_id = auth.uid()
    )
  );

CREATE POLICY tree_members_insert ON public.tree_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tree_members tm
      WHERE tm.tree_id = tree_members.tree_id
        AND tm.user_id = auth.uid()
        AND (
          tm.role = 'owner'
          OR (tm.role = 'editor' AND tree_members.role != 'owner')
        )
    )
  );

CREATE POLICY tree_members_update_owner ON public.tree_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_members tm
      WHERE tm.tree_id = tree_members.tree_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'owner'
    )
  );

CREATE POLICY tree_members_update_editor ON public.tree_members FOR UPDATE
  USING (
    tree_members.role != 'owner'
    AND EXISTS (
      SELECT 1 FROM public.tree_members tm
      WHERE tm.tree_id = tree_members.tree_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'editor'
    )
  )
  WITH CHECK (tree_members.role != 'owner');

CREATE POLICY tree_members_delete_owner ON public.tree_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tree_members tm
      WHERE tm.tree_id = tree_members.tree_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'owner'
    )
  );

CREATE POLICY tree_members_delete_editor ON public.tree_members FOR DELETE
  USING (
    tree_members.role != 'owner'
    AND EXISTS (
      SELECT 1 FROM public.tree_members tm
      WHERE tm.tree_id = tree_members.tree_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'editor'
    )
  );

-- tree_comments policies (3)
CREATE POLICY tree_comments_select ON public.tree_comments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.trees t WHERE t.id = tree_comments.tree_id)
  );

CREATE POLICY tree_comments_insert ON public.tree_comments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.trees t WHERE t.id = tree_id)
  );

CREATE POLICY tree_comments_delete ON public.tree_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tree_members tm
      WHERE tm.tree_id = tree_comments.tree_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'owner'
    )
  );

-- ============================================================
-- 5. Recreate triggers on renamed table
-- ============================================================

CREATE TRIGGER trg_prevent_last_owner_removal
  BEFORE DELETE ON public.tree_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_removal();

CREATE TRIGGER trg_prevent_last_owner_demotion
  BEFORE UPDATE ON public.tree_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_demotion();

-- ============================================================
-- 6. Update trigger functions to reference new table/column names
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tree_members
      WHERE tree_id = OLD.tree_id AND role = 'owner' AND id != OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot remove the last owner of a tree';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_last_owner_demotion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tree_members
      WHERE tree_id = OLD.tree_id AND role = 'owner' AND id != OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot demote the last owner of a tree';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 7. Backward-compatible views (old names → new tables)
-- Allows old code to work during deployment window.
-- Drop these in a follow-up migration after code PR deploys.
-- ============================================================

CREATE VIEW public.shares AS
  SELECT id, owner_id, name, markdown, visibility, org_id, settings, collapsed_ids, created_at, updated_at
  FROM public.trees;
CREATE VIEW public.share_members AS
  SELECT id, tree_id AS share_id, user_id, role, created_at, updated_at
  FROM public.tree_members;
CREATE VIEW public.share_comments AS
  SELECT id, tree_id AS share_id, card_id, user_id, author_name, body, created_at
  FROM public.tree_comments;

COMMIT;
