# Migrate share storage to Supabase

## Overview

Replace Netlify Blobs with Supabase Postgres. Short URLs stay the same (`/s/<uuid>`), but shares persist permanently with no TTL. The `share_comments` table is included now so the comments feature won't need a separate migration.

---

## Step 1 — You do this: Supabase setup

1. Create a free project at [supabase.com](https://supabase.com)
2. In the SQL editor, run:

```sql
create table shares (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  markdown      text not null,
  visibility    text not null default 'public' check (visibility in ('public', 'private')),
  settings      jsonb,
  collapsed_ids text[],
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Pre-created for the comments feature
create table share_comments (
  id         uuid primary key default gen_random_uuid(),
  share_id   uuid not null references shares(id) on delete cascade,
  author     text,
  body       text not null,
  created_at timestamptz not null default now()
);

-- Row-level security: public reads only; server bypasses via service role key
alter table shares enable row level security;
alter table share_comments enable row level security;

create policy "public shares are readable"
  on shares for select
  using (visibility = 'public');
```

3. Go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **Service role key** (not anon key) → `SUPABASE_SERVICE_ROLE_KEY`

4. In Netlify → Site settings → Environment variables, add both.

---

## Step 2 — Code changes (Claude does this)

### `package.json` (root)
- Remove `@netlify/blobs`
- Add `@supabase/supabase-js`

### `netlify/functions/share-store.mts`
Rewrite to use Supabase instead of Blobs. Same endpoint (`POST /api/share/store`), same request/response shape — only the storage layer changes.

### `netlify/functions/share-store-item.mts`
Rewrite GET / PATCH / DELETE to use Supabase. Maps Postgres `snake_case` → camelCase in responses to match the existing `StoredSharePayload` type.

### No frontend changes
`CloudShareAction.tsx`, `StoredShareOpen.tsx`, `storedShareApi.ts` — all unchanged. The API contract is identical.

---

## Response mapping

Postgres uses `snake_case`; the API uses `camelCase`. The functions handle the mapping:

| Postgres column   | API field       |
|-------------------|-----------------|
| `collapsed_ids`   | `collapsedIds`  |
| `created_at`      | `createdAt` (ms epoch) |
| `updated_at`      | `updatedAt` (ms epoch) |
| *(no expiresAt)*  | field omitted   |

---

## Verification (after deploy)

```bash
# Create a share
curl -X POST https://mozost.netlify.app/api/share/store \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Test","name":"Test OST","visibility":"public"}'
# → {"id":"<uuid>","link":"/s/<uuid>"}

# Retrieve it
curl https://mozost.netlify.app/api/share/store/<uuid>
# → full share payload

# Open in browser
open https://mozost.netlify.app/s/<uuid>
# → tree loads

# Confirm row in Supabase Table Editor (no expiresAt column)
# Run E2E tests
npm run build && npm run test:e2e  # all 16 must pass
```

---

## Assessment

### Why Supabase over the alternatives

**vs. keeping Netlify Blobs**
Blobs is a key-value store, not a database. It has no query capability — you can't list all shares, search by name, or build a "my saved OSTs" view. It also has a 30-day default TTL, which means shared links expire. For internal tooling at Mozilla where links get dropped in Confluence docs or Slack threads and referenced weeks later, that's a real problem. Supabase gives you Postgres: permanent storage, full query support, and a table editor where you can inspect or fix data without writing code.

**vs. URL-embedded shares (encoding the tree in the URL itself)**
This approach requires no server at all — the URL contains a compressed copy of the tree, so it works forever. The downside: the Mozilla OST encodes to ~4,700 characters even with compression. That's within browser limits but gets truncated in some tools and looks unwieldy. It also can't be updated — if you share a link and then change the tree, the old link is stale. Supabase gives you short, clean URLs that can be updated in place.

**vs. a self-hosted database**
Supabase's free tier is enough for this use case (500MB, unlimited API requests). It's managed — no server to maintain, automatic backups, built-in dashboard. The main risk is vendor dependency, but the data is just Postgres; migrating away is straightforward if needed.

### Decisions made in this design

**Service role key, not anon key**
The Netlify Functions run server-side, so they can safely hold the service role key (which bypasses row-level security). This is the right pattern: the client never touches Supabase directly, only the functions do. Using the anon key server-side would work but is unnecessarily restricted.

**Row-level security enabled but minimal**
RLS is on so that if a Supabase anon key ever leaked into the frontend, it couldn't write data. The only policy is "public shares are readable" — the service role key the functions use bypasses RLS entirely, so writes go through without needing policies for each operation.

**`collapsed_ids` as `text[]` not `jsonb`**
It's a flat list of string IDs, so a Postgres array is more appropriate than JSON. It's also easier to query later (e.g., `where 'some-id' = any(collapsed_ids)`). The API still sends/receives it as a regular JSON array — the mapping happens in the functions.

**`settings` as `jsonb`**
Settings (layout direction, density, etc.) are a small object that will likely gain fields over time. `jsonb` is the right call: schema-flexible, indexable if needed, no migration required when a new setting is added.

**`share_comments` created now**
The table has a foreign key to `shares` with `on delete cascade`. If a share is deleted, its comments go with it automatically — no orphaned rows, no cleanup code needed. Building the relationship now costs nothing; adding it later would require a migration.

### Risks and mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Supabase free tier limits hit | Low — this is internal tooling with ~10–50 users | Monitor in Supabase dashboard; upgrade is $25/mo |
| Service role key leaked | Low — only lives in Netlify env vars, never in frontend | Rotate key in Supabase if ever compromised |
| Existing Netlify Blobs shares break | Certain — they'll return 404 after migration | Acceptable: there are no production shares yet, only test data |
| Supabase outage | Rare | Share loading would fail with an error page; the tree builder itself is unaffected |
