-- 0004_tighten_visibility_check.sql
-- Remove old visibility values from CHECK constraint now that all code uses new values.

ALTER TABLE public.shares DROP CONSTRAINT IF EXISTS shares_visibility_check;
ALTER TABLE public.shares ADD CONSTRAINT shares_visibility_check
  CHECK (visibility IN ('link-public', 'domain-restricted', 'restricted'));
