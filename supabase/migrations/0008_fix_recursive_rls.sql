-- 0008_fix_recursive_rls.sql
-- Fix infinite recursion in self-referential RLS policies on tree_members
-- and org_members. SECURITY DEFINER functions bypass RLS for the lookup.

BEGIN;

-- ============================================================
-- 1. Helper functions (SECURITY DEFINER = bypass RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_tree_member(p_tree_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tree_members WHERE tree_id = p_tree_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.tree_member_role(p_tree_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT role FROM tree_members WHERE tree_id = p_tree_id AND user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members WHERE org_id = p_org_id AND user_id = auth.uid()
  );
$$;

-- ============================================================
-- 2. Drop and recreate tree_members policies (no self-reference)
-- ============================================================

DROP POLICY IF EXISTS tree_members_select ON public.tree_members;
DROP POLICY IF EXISTS tree_members_insert ON public.tree_members;
DROP POLICY IF EXISTS tree_members_update_owner ON public.tree_members;
DROP POLICY IF EXISTS tree_members_update_editor ON public.tree_members;
DROP POLICY IF EXISTS tree_members_delete_owner ON public.tree_members;
DROP POLICY IF EXISTS tree_members_delete_editor ON public.tree_members;

CREATE POLICY tree_members_select ON public.tree_members FOR SELECT
  USING (public.is_tree_member(tree_id));

CREATE POLICY tree_members_insert ON public.tree_members FOR INSERT
  WITH CHECK (
    public.tree_member_role(tree_members.tree_id) = 'owner'
    OR (public.tree_member_role(tree_members.tree_id) = 'editor' AND tree_members.role != 'owner')
  );

CREATE POLICY tree_members_update_owner ON public.tree_members FOR UPDATE
  USING (public.tree_member_role(tree_members.tree_id) = 'owner');

CREATE POLICY tree_members_update_editor ON public.tree_members FOR UPDATE
  USING (
    tree_members.role != 'owner'
    AND public.tree_member_role(tree_members.tree_id) = 'editor'
  )
  WITH CHECK (tree_members.role != 'owner');

CREATE POLICY tree_members_delete_owner ON public.tree_members FOR DELETE
  USING (public.tree_member_role(tree_members.tree_id) = 'owner');

CREATE POLICY tree_members_delete_editor ON public.tree_members FOR DELETE
  USING (
    tree_members.role != 'owner'
    AND public.tree_member_role(tree_members.tree_id) = 'editor'
  );

-- ============================================================
-- 3. Fix trees policies that reference tree_members
-- ============================================================

DROP POLICY IF EXISTS trees_select_member ON public.trees;
DROP POLICY IF EXISTS trees_select_domain_restricted ON public.trees;
DROP POLICY IF EXISTS trees_update_member ON public.trees;
DROP POLICY IF EXISTS trees_delete ON public.trees;

CREATE POLICY trees_select_member ON public.trees FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_tree_member(id));

CREATE POLICY trees_select_domain_restricted ON public.trees FOR SELECT
  USING (
    visibility = 'domain-restricted'
    AND auth.uid() IS NOT NULL
    AND org_id IS NOT NULL
    AND public.is_org_member(org_id)
  );

CREATE POLICY trees_update_member ON public.trees FOR UPDATE
  USING (public.tree_member_role(id) IN ('owner', 'editor'));

CREATE POLICY trees_delete ON public.trees FOR DELETE
  USING (public.tree_member_role(id) = 'owner');

-- ============================================================
-- 4. Fix tree_comments policies that reference tree_members
-- ============================================================

DROP POLICY IF EXISTS tree_comments_delete ON public.tree_comments;

CREATE POLICY tree_comments_delete ON public.tree_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.tree_member_role(tree_id) = 'owner'
  );

-- ============================================================
-- 5. Fix org_members self-referential policy
-- ============================================================

DROP POLICY IF EXISTS org_members_select ON public.org_members;

CREATE POLICY org_members_select ON public.org_members FOR SELECT
  USING (public.is_org_member(org_id));

-- ============================================================
-- 6. Fix organizations policy that references org_members
-- ============================================================

DROP POLICY IF EXISTS org_select_member ON public.organizations;

CREATE POLICY org_select_member ON public.organizations FOR SELECT
  USING (public.is_org_member(id));

COMMIT;
