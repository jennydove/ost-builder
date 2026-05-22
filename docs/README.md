# OST Builder — Docs

## What's here

Current operating documentation. As of 2026-05-22 the four pre-existing docs (auth-plan, supabase-migration, mozilla-ost-backup, next-session) were moved to `archive/` — they covered work that's now shipped or stale handoff notes from earlier sessions.

## Production setup

- **App**: `mozost.netlify.app` (and `tree.productopscoach.com` once SSL provisions)
- **Auth**: Google OAuth restricted to `@mozilla.com` accounts, via Supabase
- **Storage**: Supabase Postgres (`shares`, `share_members`, `share_comments`)
- **Backend**: Netlify Functions at `/api/share/store/...` and `/api/auth/*`
- **Email**: Resend, sending from `noreply@tree.productopscoach.com`

## Current schema

```
shares (
  id uuid PK, owner_id uuid → auth.users,
  name text, markdown text NOT NULL,
  visibility text CHECK IN ('public','mozilla','private'),
  settings jsonb, collapsed_ids text[],
  created_at, updated_at timestamptz
)

share_members (
  id uuid PK, share_id uuid → shares (cascade),
  user_id uuid → auth.users (cascade),
  role text CHECK IN ('owner','editor','viewer'),
  invited_by uuid → auth.users, created_at, updated_at,
  UNIQUE (share_id, user_id)
)

share_comments (
  id uuid PK, share_id uuid → shares (cascade),
  card_id text NOT NULL,
  user_id uuid → auth.users (set null),
  author_name text, body text NOT NULL,
  created_at timestamptz
)
```

Card IDs in `share_comments.card_id` reference stable `{#abc12345}` markers embedded in `shares.markdown` (added in the stable-IDs migration; backfilled via `scripts/backfill-card-ids.mts`).

## Environment variables

Server-side (Netlify Functions):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `APP_BASE_URL`

Client-side (Vite, prefixed `VITE_`):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

See `.env.example` for the canonical list.

## Scripts

- `scripts/backfill-card-ids.mts` — one-shot: parse + re-serialize all shares so they have `{#id}` markers. Idempotent. Run with `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-card-ids.mts`.

## Before commits

`npm run build && npm run test:e2e` — all 16 E2E tests must pass.
