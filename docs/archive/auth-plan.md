# Auth + Owner Editing Plan

## What this enables

- Only @mozilla.com Google accounts can log in or view any share
- Three roles: **owner** (full control), **editor** (edit tree, can't manage members), **viewer** (read-only, can comment in future)
- Public shares: any authenticated Mozillan can view without being explicitly invited
- Private shares: only explicitly added members can access
- Edits auto-sync to Supabase while editing (no manual "Cloud share" re-click)
- Future comments: any authenticated Mozillan can comment on public shares; private share comments limited to members

---

## How it works

`@supabase/supabase-js` has auth built in — we already have the package. The flow:

1. User clicks "Sign in with Google" → redirected to Google → redirected back to app
2. Supabase stores the session in localStorage automatically
3. Every API request to Netlify Functions includes the Supabase JWT in the `Authorization` header
4. Netlify Functions verify the JWT to get the real user identity
5. RLS policies on the database enforce access at the row level — the database itself rejects unauthorized queries, not just the API

---

## Manual steps you need to do first

### Step 1 — Create a Google OAuth app

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing Mozilla one)
3. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
4. Application type: **Web application**, Name: `mozost`
5. Authorized redirect URIs — add (replace `<ref>` with your Supabase project ref):
   ```
   https://<ref>.supabase.co/auth/v1/callback
   ```
6. Save — copy the **Client ID** and **Client Secret**

### Step 2 — Enable Google OAuth in Supabase

Authentication → Providers → Google → enable, paste Client ID + Secret → Save

### Step 3 — Restrict to @mozilla.com

Authentication → Email → **Allowed email domains** → add `mozilla.com` → Save

> Any non-@mozilla.com Google account is rejected before a session is ever created.

### Step 4 — Run schema migration

```sql
-- Add owner to shares table
alter table shares add column owner_id uuid references auth.users(id);

-- Share members / RBAC
create table share_members (
  id          uuid primary key default gen_random_uuid(),
  share_id    uuid not null references shares(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'editor', 'viewer')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (share_id, user_id)
);

create index on share_members(share_id, user_id);
create index on share_members(user_id, share_id);

alter table share_members enable row level security;

-- Drop old permissive read policy
drop policy "public shares are readable" on shares;

-- Shares: read
create policy "read public shares"
  on shares for select
  using (visibility = 'public' and auth.uid() is not null);

create policy "members read private shares"
  on shares for select
  using (
    exists (
      select 1 from share_members
      where share_id = id and user_id = auth.uid()
    )
  );

-- Shares: create (must set themselves as owner)
create policy "create requires auth"
  on shares for insert
  with check (auth.uid() = owner_id);

-- Shares: update and delete handled via service role key in functions
-- (column-level checks — editors can update content but not visibility —
-- are enforced in the Netlify Function, not RLS)

-- share_members: read (only if you're a member)
create policy "members see membership"
  on share_members for select
  using (
    exists (
      select 1 from share_members sm2
      where sm2.share_id = share_id and sm2.user_id = auth.uid()
    )
  );

-- share_members: write — all done via service role key in Netlify Functions
-- (owner check is enforced in function code, not RLS, to keep policies simple)

-- Comments: update policies now that roles exist
drop policy if exists "read all comments" on share_comments;
drop policy if exists "authenticated users can comment" on share_comments;

create policy "read comments on accessible shares"
  on share_comments for select
  using (
    exists (
      select 1 from shares s
      where s.id = share_id
        and (
          s.visibility = 'public'
          or exists (
            select 1 from share_members sm
            where sm.share_id = s.id and sm.user_id = auth.uid()
          )
        )
        and auth.uid() is not null
    )
  );
```

### Step 5 — Add env vars to Netlify

Add `SUPABASE_ANON_KEY` (the public anon key — safe to expose, can only do what RLS allows).
Also add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the frontend.

---

## Roles reference

| Action | Owner | Editor | Viewer |
|--------|-------|--------|--------|
| View tree | ✅ | ✅ | ✅ |
| Edit tree (auto-sync) | ✅ | ✅ | ❌ |
| Change visibility | ✅ | ❌ | ❌ |
| Invite members | ✅ | ❌ | ❌ |
| Change member roles | ✅ | ❌ | ❌ |
| Remove members | ✅ | ❌ | ❌ |
| Delete share | ✅ | ❌ | ❌ |
| Comment (future) | ✅ | ✅ | ✅ |

---

## API changes

### Existing endpoints (updated)

**`GET /api/share/store/:id`** — returns `role: 'owner' | 'editor' | 'viewer'` instead of `isOwner: boolean`

**`POST /api/share/store`** — requires auth; inserts `owner_id` on the share row AND inserts an `owner` row into `share_members` in the same transaction

**`PATCH /api/share/store/:id`** — checks role: owner/editor can update content fields; only owner can update `visibility`

**`DELETE /api/share/store/:id`** — owner only

### New endpoints

**`GET /api/share/store/:id/members`** — returns member list with roles (owner/editor only)

**`POST /api/share/store/:id/members`** — invite a user by email; owner only; body: `{ email, role: 'editor' | 'viewer' }`

**`PATCH /api/share/store/:id/members/:memberId`** — change a member's role; owner only; body: `{ role: 'editor' | 'viewer' }` (cannot promote to owner via this endpoint)

**`DELETE /api/share/store/:id/members/:memberId`** — remove a member; owner only (cannot remove self as owner)

**`POST /api/share/store/:id/transfer`** — transfer ownership; owner only; body: `{ toUserId }` (atomically promotes new owner, demotes old owner to editor)

---

## Code changes (Claude does these after manual steps)

### Netlify Functions
- `auth-me.mts` — verify JWT, return real user
- `share-store.mts` — require auth, set `owner_id`, insert `share_members` owner row
- `share-store-item.mts` — resolve role, enforce per-role permissions, return `role` field
- New: `share-members.mts` — GET/POST at `/api/share/store/:id/members`
- New: `share-member.mts` — PATCH/DELETE at `/api/share/store/:id/members/:memberId`

### Frontend
- `src/lib/supabaseClient.ts` — new file, browser Supabase client with anon key
- `storedShareApi.ts` — pass JWT in Authorization header on all requests
- Login/logout UI in header — `signInWithOAuth({ provider: 'google' })`
- `CloudShareAction.tsx` — require login to create; show member management UI
- `StoredShareOpen.tsx` — hide edit controls if `role === 'viewer'`
- `LibraryAutoSave` (App.tsx) — when active source is `cloud:<uuid>` and user is owner or editor, PATCH Supabase on debounce

### Env vars
```
VITE_SUPABASE_URL=https://your-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_ANON_KEY=same-anon-key  (for functions JWT verification)
SUPABASE_SERVICE_ROLE_KEY=already-set
```

---

## Sequencing

**PR 1: Auth plumbing** — login/logout UI, `supabaseClient.ts`, JWT in API requests, `auth-me` returns real user, schema migration runs. No behavior change yet.

**PR 2: Owner enforcement + auto-sync** — read-only view for viewers, edit controls for owners/editors, require login to create shares, auto-sync on debounce.

**PR 3: Member management UI** — invite dialog, member list, role changes. The API is built in PR 2; this is just the UI.

---

## Assessment

### Why this permissions model over the alternatives

**vs. a simpler owner-only model (no editors)**
An editor role costs almost nothing to add now — one extra CHECK constraint on `share_members.role`. If you add it later, it's a schema migration plus updating every RLS policy and every API handler. The Mozilla use case already implies it: a senior PM might own the OST while a team member helps maintain it. Leaving it out now is false economy.

**vs. a more complex model with teams/groups**
Team-based access ("anyone on the Firefox team can view") requires a separate `teams` and `team_members` table, and the RLS policies become significantly more complex. That's a real feature with real design questions (who manages teams? how do you sync with LDAP?). Starting with per-share membership is the right first step — you can layer team grants on top of individual grants later without breaking anything.

**vs. per-column RLS for owner-vs-editor write distinction**
Supabase RLS can restrict which rows a user can touch, but not which columns on a given row. The distinction "editors can update content but not visibility" has to live in the Netlify Function, not in RLS. This is fine — the function is the only write path anyway. RLS is the safety net for catastrophic bugs; the function is where the actual business logic lives.

### Decisions made in this design

**`owner_id` on `shares` AND a row in `share_members`**
Denormalized, but deliberate. `shares.owner_id` gives a fast ownership check with no join (the most common query). `share_members` gives a uniform member list that includes the owner — the UI can do a single query to show all members. The invariant (they must always agree) is enforced by writing both in the same Supabase transaction. If they ever diverge, `owner_id` is the source of truth.

**Invite by user ID, not email, in the first pass**
Inviting by email requires a `users` profile table (mapping Supabase `auth.uid()` to email/name), and handling "pending invites" for people who haven't logged in yet. That's a meaningful chunk of additional work. The initial implementation invites by user ID (from the member list of an existing share, or from a future user search endpoint). Invite-by-email is the obvious follow-on.

**Service role key for write operations, not RLS**
All PATCH/DELETE/INSERT on `share_members` go through Netlify Functions using the service role key, which bypasses RLS. This means member management rules (only owner can invite) are enforced in code, not in database policies. This is a tradeoff: RLS would give deeper protection, but writing correct RLS for join-dependent policies (`INSERT ... where caller has 'owner' role in share_members`) is significantly harder to get right and debug. Application-layer enforcement is easier to reason about for complex multi-table rules.

**Gating public shares behind login**
Your note in the doc is right: require login to view anything. This is a clean enforcement point — anyone who opens a share link and isn't logged in gets a "Sign in with your Mozilla Google account" screen. This is worth the friction because it means every viewer is a known Mozillan, which is important for the commenting feature (you know who's commenting) and for any future access revocation.

### Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Google OAuth app in personal Google Cloud, not Mozilla | High | Ownership transfer friction if tool gets adopted | Acceptable for now; swap credentials to a Mozilla project when it's officially adopted |
| Supabase user IDs baked into every row | Certain | Hard migration if Mozilla moves to its own SSO | Known tradeoff; document it; migration is possible but painful |
| Existing test shares have null `owner_id` | Certain | They'll fail ownership checks | Delete them manually before deploying (they're test data) |
| Invite-only-by-user-ID is awkward UX | High | Users will ask for email invite immediately | Build user search endpoint early in PR 3; the schema supports it |
| Auto-sync creates write conflicts across two tabs/devices | Medium | Last write wins, could lose edits | 1-second debounce + Supabase's `updated_at` check make collisions unlikely; add a `version` column if it becomes a real problem |
| Owner account deletion orphans shares | Low | Shares become unmanageable | Require ownership transfer before account deletion; handle in a future account management screen |
