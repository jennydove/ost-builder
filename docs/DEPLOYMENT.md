# Deployment Guide

## Architecture

- **Frontend:** React + Vite, deployed as static files on Netlify
- **Backend:** Netlify Functions (TypeScript, `netlify/functions/`)
- **Database:** Supabase (Postgres + Auth + RLS)
- **Email:** Resend (invite emails + comment notifications)

## Netlify Setup

### Build config (`netlify.toml`)

- **Base:** `packages/app`
- **Build command:** `cd ../.. && npm run build`
- **Publish:** `dist`
- **Functions:** `../../netlify/functions`
- **SPA routing:** `/*` → `/index.html` (status 200)

### Environment variables (Netlify dashboard)

| Variable | Scope | Description |
|---|---|---|
| `SUPABASE_URL` | All | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions, Runtime | Service-role key (bypasses RLS) |
| `SUPABASE_ANON_KEY` | All | Anon key (respects RLS) |
| `VITE_SUPABASE_URL` | All | Same as SUPABASE_URL (Vite client-side) |
| `VITE_SUPABASE_ANON_KEY` | All | Same as SUPABASE_ANON_KEY (Vite client-side) |
| `RESEND_API_KEY` | Functions, Runtime | Resend API key for email |
| `RESEND_FROM_ADDRESS` | All | Sender address for notifications |
| `APP_BASE_URL` | All | Production URL (e.g., `https://mozost.netlify.app`) |

### Local development

Copy `.env.example` to `packages/app/.env.local` and fill in the Supabase values:

```
VITE_SUPABASE_URL=https://yxmcfxggyxroiiaxzfbq.supabase.co
VITE_SUPABASE_ANON_KEY=<from Supabase dashboard>
```

Without these, the app runs in local-only mode (no login, no cloud sync, no comments).

## Supabase Setup

### Project

- **URL:** `https://yxmcfxggyxroiiaxzfbq.supabase.co`
- **Auth providers:** Google OAuth + Email/Password (both enabled in Supabase dashboard → Authentication → Providers)

### Google OAuth redirect URI

In the Google Cloud Console, the authorized redirect URI must be:

```
https://yxmcfxggyxroiiaxzfbq.supabase.co/auth/v1/callback
```

### Schema migrations

Migrations live in `supabase/migrations/` and are applied manually:

```bash
supabase db push
```

Each migration is committed as a numbered SQL file (`0001_baseline.sql`, `0002_rate_limits.sql`, etc.) and noted in the PR description when it needs to be applied.

**Current migrations:**
1. `0001_baseline.sql` — tables (shares, share_members, share_comments), indexes
2. `0002_rate_limits.sql` — rate_limits table + consume_rate_limit RPC
3. `0003_phase_g.sql` — organizations, org_members, visibility rename, RLS policies, last-owner triggers
4. `0004_tighten_visibility_check.sql` — visibility CHECK constraint tightening
5. `0005_cli_tokens.sql` — `cli_tokens` table for PAT-based CLI auth
6. `0006_rename_share_to_tree.sql` — rename `shares` → `trees`, `share_members` → `tree_members`, `share_comments` → `tree_comments` (3 tables, 15 RLS policies, 6 functions)
7. `0007_drop_share_views.sql` — drop legacy backward-compat views from the rename
8. `0008_fix_recursive_rls.sql` — SECURITY DEFINER helpers (`is_tree_member`, `tree_member_role`, `is_org_member`) to break RLS recursion
9. `0009_tree_member_invites.sql` — email-based invites: `user_id` nullable, `invited_email` column, case-insensitive unique index

### Service-role key rotation

1. Generate a new service-role key in Supabase dashboard → Settings → API
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Netlify environment variables
3. Trigger a Netlify redeploy (or push any commit)
4. The old key is invalidated immediately — there will be a brief window of errors between key rotation and deploy completion

## Deploy flow

1. Push to `main` (or merge PR) → Netlify auto-builds and deploys
2. If the PR includes a migration file → apply via `supabase db push` before or after merge depending on the PR instructions
3. Netlify deploy takes ~1-2 minutes

## CI

GitHub Actions (`.github/workflows/`):

- **`ci.yml`** — runs on every PR and push to `main`. Four jobs:
  - `unit-tests` — `npm test` + coverage upload
  - `build` — `npm run build`
  - `e2e` — Playwright (Chromium + Firefox), runs after `build`
  - `lint` — `npm run lint` (eslint). Errors fail the job. Note: lint is NOT part of the local pre-commit gate (`npm test && npm run build && npm run test:e2e`) — CI catches it.
- **`claude-review.yml`** — runs on every PR open/synchronize. Uses `anthropics/claude-code-action@v1` to post inline review comments for correctness, security, and convention issues. Requires `ANTHROPIC_API_KEY` repo secret.
