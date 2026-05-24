# Operational Runbook

Troubleshooting guide for common production issues.

## Resend quota exhaustion

**Symptom:** Comment notifications stop arriving. No errors in function logs (email send is fire-and-forget).

**Check:** Resend dashboard → Usage. Free tier is 100 emails/day.

**Fix:** Either upgrade the Resend plan or wait for the daily reset. Comment posting is unaffected — only notifications stop.

**Prevention:** The per-share email rate limit (5/min per share via `consume_rate_limit`) prevents a single share from burning the quota, but high overall comment volume across many shares can still exhaust it.

## Rate limiting not working

**Symptom:** No rate limiting despite the code being in place. Console shows `Rate limit check failed, allowing request` warnings.

**Cause:** Migration `0002_rate_limits.sql` not applied — the `consume_rate_limit` RPC function doesn't exist in the database.

**Fix:** Run `supabase db push` to apply pending migrations.

**Note:** The rate limiter fails open by design — if the RPC call fails, the request is allowed. This prevents rate-limit infrastructure issues from blocking legitimate users.

## Share returns 500

**Symptom:** Loading a share (`/s/:id`) returns a 500 error.

**Check:**
1. Netlify function logs (Netlify dashboard → Functions → share-store-item)
2. Supabase logs (Supabase dashboard → Logs → Edge Functions or Postgres)

**Common causes:**
- Supabase is down or the project is paused (free tier pauses after inactivity)
- `SUPABASE_SERVICE_ROLE_KEY` is invalid or rotated without updating Netlify
- Migration applied but references a table/column that doesn't exist

## OAuth redirect mismatch

**Symptom:** Google sign-in fails with "redirect_uri_mismatch" error.

**Fix:** In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client, ensure the authorized redirect URI is exactly:

```
https://yxmcfxggyxroiiaxzfbq.supabase.co/auth/v1/callback
```

No trailing slash. Must be HTTPS.

## Migration failed or partially applied

**Symptom:** `supabase db push` fails partway through a migration.

**Check:** Connect to the database and verify which parts applied:
```sql
-- Check if tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- Check constraints
SELECT conname FROM pg_constraint WHERE conrelid = 'public.shares'::regclass;
```

**Fix:** Migrations wrapped in `BEGIN`/`COMMIT` are atomic — a failure rolls back all changes. If using a non-transactional migration, manually apply the remaining statements or write a corrective migration.

## App loads but shows no cards / blank canvas

**Symptom:** The app loads but the canvas is empty.

**Common causes:**
- localStorage is corrupted — clear site data in browser DevTools
- The markdown in the store is empty or malformed — check `ost-storage` key in localStorage
- Supabase env vars missing in `.env.local` (local dev) — app falls back to local mode but may have stale state from a previous cloud session
