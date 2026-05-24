-- 0005_cli_tokens.sql
-- Phase E: Personal Access Tokens for CLI authentication

CREATE TABLE public.cli_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cli_tokens OWNER TO postgres;
ALTER TABLE public.cli_tokens ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.cli_tokens TO anon, authenticated, service_role;

CREATE INDEX cli_tokens_user_id_idx ON public.cli_tokens (user_id);
CREATE INDEX cli_tokens_token_hash_idx ON public.cli_tokens (token_hash);

CREATE POLICY cli_tokens_select ON public.cli_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY cli_tokens_insert ON public.cli_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY cli_tokens_delete ON public.cli_tokens FOR DELETE
  USING (user_id = auth.uid());
