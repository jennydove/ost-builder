-- Migration: rate_limits table + consume_rate_limit() function
-- Phase B Task 11: app-level rate limiting backed by Postgres.
-- Auth-level limits (sign-in, token refresh, etc.) are handled by Supabase's
-- built-in rate limiter; this table covers application operations
-- (comments, share create/update, list reads, email sends).

-- Single-row-per-key counter table with a rolling window.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits OWNER TO postgres;

-- No RLS — only accessed via the consume_rate_limit() function below,
-- which runs as SECURITY DEFINER. Anon/authenticated roles cannot read/write
-- the table directly.
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

-- Atomic check-and-increment.
-- Returns one row: (allowed, count, retry_after_seconds)
-- - allowed: true if this request is within the limit
-- - count: the new counter value within the window
-- - retry_after_seconds: how long until the window resets (clamped to >= 0)
--
-- Semantics: rolling fixed window. The first request in a fresh window
-- starts the window. Subsequent requests in the same window increment.
-- Once the window expires (window_start + window_seconds < now()),
-- the next request resets the counter to 1 and starts a new window.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, "count" integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_window_start timestamptz;
  v_now timestamptz := now();
  v_window_interval interval := make_interval(secs => p_window_seconds);
BEGIN
  INSERT INTO public.rate_limits AS rl (key, count, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
          WHEN rl.window_start + v_window_interval < v_now THEN 1
          ELSE rl.count + 1
        END,
        window_start = CASE
          WHEN rl.window_start + v_window_interval < v_now THEN v_now
          ELSE rl.window_start
        END
  RETURNING rl.count, rl.window_start INTO v_count, v_window_start;

  RETURN QUERY SELECT
    v_count <= p_limit,
    v_count,
    GREATEST(0, EXTRACT(EPOCH FROM (v_window_start + v_window_interval - v_now))::integer);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO authenticated;

-- Optional housekeeping: drop very old keys to keep the table small.
-- Run periodically via scheduled task (Supabase pg_cron, etc.).
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits(p_older_than_seconds integer DEFAULT 86400)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - make_interval(secs => p_older_than_seconds)
  RETURNING * INTO v_deleted;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_rate_limits(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits(integer) TO service_role;
