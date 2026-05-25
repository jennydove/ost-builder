-- 0007_drop_share_views.sql
-- Drop backward-compatible views now that all code uses new table names.

DROP VIEW IF EXISTS public.shares;
DROP VIEW IF EXISTS public.share_members;
DROP VIEW IF EXISTS public.share_comments;
