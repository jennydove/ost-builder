-- 0009_tree_member_invites.sql
-- Support email-based invites: make user_id nullable, add invited_email column.

BEGIN;

-- Allow pending invites where user hasn't signed in yet
ALTER TABLE tree_members ALTER COLUMN user_id DROP NOT NULL;

-- Store the email used to invite someone
ALTER TABLE tree_members ADD COLUMN invited_email text;

-- Backfill email for existing members from auth.users
UPDATE tree_members SET invited_email = (
  SELECT email FROM auth.users WHERE id = tree_members.user_id
);

-- At least one of user_id or invited_email must be present
ALTER TABLE tree_members ADD CONSTRAINT tree_members_user_or_email
  CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL);

-- Prevent duplicate invites to the same email for the same tree
CREATE UNIQUE INDEX tree_members_tree_email_unique
  ON tree_members (tree_id, lower(invited_email))
  WHERE invited_email IS NOT NULL;

COMMIT;
