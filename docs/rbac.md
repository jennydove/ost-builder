# OST Builder — RBAC (Role-Based Access Control)

Draft for review (Phase B Task 8 — gates Task 9 RLS rewrite). Status: **draft, awaiting review**.

This document defines the authorization model for ost-builder. Implementation translates directly into Supabase Row Level Security policies (Phase B Task 9) and Phase G's multi-org schema.

## Design principles

1. **Capability-based under the hood, role-based at the API.** Users see roles ("editor"); the system checks capabilities ("can_edit_content"). Roles are bundles. This lets us add new roles (commenter, moderator) without rewriting policies.
2. **Defense in depth.** Authorization is enforced at three layers: (a) RLS in Postgres, (b) `resolveRole` in Netlify functions, (c) UI gating. Each layer assumes the others might fail.
3. **Tenant-agnostic.** Mozilla is one organization, not a special case. The visibility scheme works for any company.
4. **Minimum privilege.** New endpoints default to "deny"; capabilities are opt-in.

## Subjects

| Subject | Identifies |
|---|---|
| **Anonymous** | No session, no JWT. Can view public shares only. |
| **Authenticated user** | Has Supabase auth session (`auth.uid()` non-null). Allowed-domain gating still applies at sign-up via `restrict_to_allowed_domains` hook. |
| **Org member** | Authenticated user with a row in `org_members(user_id, org_id)`. (New table; Phase G.) |
| **Share member** | Authenticated user with a row in `share_members(share_id, user_id, role)`. |

## Objects

| Object | Notes |
|---|---|
| **Share** | Row in `shares`. Has `visibility`, `owner_id`, `org_id` (Phase G). |
| **Comment** | Row in `share_comments`. Inherits accessibility from its share. |
| **Membership** | Row in `share_members`. The capability to read/write membership rows is itself permissioned. |

## Capabilities

The full set, defined once. Roles are bundles of these.

| Capability | What it permits |
|---|---|
| `can_view_share` | Read the share's markdown, name, settings, collapsed_ids |
| `can_edit_content` | Update markdown, name, settings, collapsed_ids |
| `can_change_visibility` | Update `shares.visibility` |
| `can_delete_share` | Delete the share (and cascades comments + memberships) |
| `can_invite` | Insert into `share_members` for this share |
| `can_remove_member` | Delete from `share_members` for this share |
| `can_view_members` | Read `share_members` rows for this share |
| `can_comment` | Insert into `share_comments` |
| `can_delete_own_comment` | Delete a `share_comments` row where `user_id = auth.uid()` |
| `can_moderate_comments` | Delete any `share_comments` row in this share |
| `can_view_card(card_id)` | Read comments and metadata tied to a specific card. Stub for future per-card permissions — currently always returns true if `can_view_share` is true. **Carry through the model from day one** so policies don't need rewriting when per-card permissions ship. |

## Roles (capability bundles)

| Role | Bundle |
|---|---|
| **owner** | All capabilities above, including the ones marked owner-only |
| **editor** | `can_view_share` + `can_edit_content` + `can_comment` + `can_delete_own_comment` + `can_view_members` |
| **viewer** | `can_view_share` + `can_comment` + `can_delete_own_comment` + `can_view_members` |
| _(future)_ **commenter** | `can_view_share` + `can_comment` + `can_delete_own_comment` (no other read access — e.g., a stakeholder invited only to comment) |
| _(future)_ **moderator** | `can_view_share` + `can_comment` + `can_delete_own_comment` + `can_moderate_comments` |

Owner-only capabilities: `can_change_visibility`, `can_delete_share`, `can_invite`, `can_remove_member`, `can_moderate_comments`.

## Visibility × Subject matrix

The visibility column is `'public' | 'company-limited' | 'private'` (Phase G renames `'mozilla'` → `'company-limited'` and pairs with `org_id`).

| | Anonymous | Authenticated user (no membership) | Org member (same org as share) | Share member |
|---|---|---|---|---|
| **public** | viewer | viewer | viewer | their `share_members.role` |
| **company-limited** | denied | denied | viewer | their `share_members.role` |
| **private** | denied | denied | denied | their `share_members.role` |

Where "viewer" means the viewer role bundle.

`share_members.role` always overrides the fallback. An owner sees their own share regardless of visibility; a viewer remains viewer.

## How this translates to RLS

Each policy expresses "what set of rows can the current `auth.uid()` see / write." Below is the intended shape — concrete SQL lands in Phase B Task 9.

### `shares` table

```sql
-- SELECT
-- Anyone can see public shares.
CREATE POLICY shares_select_public ON shares FOR SELECT
  USING (visibility = 'public');

-- Org members can see company-limited shares for their org.
CREATE POLICY shares_select_org ON shares FOR SELECT
  USING (
    visibility = 'company-limited'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = shares.org_id AND om.user_id = auth.uid()
    )
  );

-- Share members (any role) can see the share they belong to, regardless of visibility.
CREATE POLICY shares_select_member ON shares FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM share_members sm
      WHERE sm.share_id = shares.id AND sm.user_id = auth.uid()
    )
  );

-- INSERT (create new share) — auth required; user becomes owner.
CREATE POLICY shares_insert ON shares FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = owner_id);

-- UPDATE — editor+ on this share.
CREATE POLICY shares_update_member ON shares FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM share_members sm
      WHERE sm.share_id = shares.id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'editor')
    )
  );

-- DELETE — owner only. Visibility changes additionally require owner — enforced by UPDATE column-level grant or in app code (since RLS UPDATE policy above allows editors to update markdown/name/settings, we must gate visibility separately).
CREATE POLICY shares_delete ON shares FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM share_members sm
      WHERE sm.share_id = shares.id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );
```

**Open question on visibility changes:** RLS works at row level, not column level. Either (a) split visibility-change into a separate stored procedure that owners can call, or (b) keep the visibility check in `resolveRole()` server-side as defense in depth. Recommend (b) for now; revisit if we need to support visibility change via direct DB connection (CLI).

### `share_members` table

```sql
-- SELECT — share members see other members of shares they belong to.
CREATE POLICY share_members_select ON share_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM share_members sm2
      WHERE sm2.share_id = share_members.share_id AND sm2.user_id = auth.uid()
    )
  );

-- INSERT — owner only (invite). The system service-role bypass is reserved for creating the owner row at share creation.
CREATE POLICY share_members_insert ON share_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM share_members sm
      WHERE sm.share_id = share_members.share_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

-- UPDATE / DELETE — owner only (role changes, removal).
CREATE POLICY share_members_update ON share_members FOR UPDATE
  USING (... owner check ...);

CREATE POLICY share_members_delete ON share_members FOR DELETE
  USING (... owner check ...);
```

### `share_comments` table

```sql
-- SELECT — anyone who can view the share can view comments.
CREATE POLICY share_comments_select ON share_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shares s
      WHERE s.id = share_comments.share_id
      -- Inherits via RLS on shares: if the user can see the share, they can see comments.
    )
  );

-- INSERT — anyone with view-access AND not anonymous on company-limited/private.
-- (Anonymous on public: capability says they can comment, but Phase B keeps comments auth-only.)
CREATE POLICY share_comments_insert ON share_comments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id  -- author must be the row's author
    AND EXISTS (SELECT 1 FROM shares s WHERE s.id = share_id)  -- share exists; visibility checked via SELECT RLS
  );

-- DELETE — author OR moderator OR owner of share.
CREATE POLICY share_comments_delete ON share_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM share_members sm
      WHERE sm.share_id = share_comments.share_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner')  -- moderator role added in future
    )
  );
```

## Anonymous user policy

Anonymous (no JWT) users can:
- View public shares
- View comments on public shares (currently — open question: should anonymous users see comments at all, or only signed-in users?)
- **Not** comment, edit, or invite (no `user_id` to attribute)

Anonymous reads of public shares are gated only by visibility, not by membership. They go through the same RLS policies; `auth.uid()` is null but the `visibility = 'public'` branch matches.

## Service-role usage policy

The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. After Phase B Task 9, **service-role is permitted only for**:

1. **Creating the owner row** in `share_members` during share creation, since the row doesn't yet exist for the RLS check.
2. **System operations** that don't have a user context (scheduled cleanup, email worker, future cron jobs).
3. **CLI auth flow** if we revive bearer tokens that don't carry a Supabase JWT (Phase E PAT design).

Every other endpoint must call Supabase **as the user** by attaching `Authorization: Bearer <jwt>` to the supabase-js client. The `getSupabase()` helper in `_shareUtils.mts` should be split into:
- `getSupabaseAsUser(jwt)` — default
- `getSupabaseAsService()` — explicit, audited usage

## Multi-org evolution (Phase G plan)

When Phase G lands (bundled with Task 9 per Jenny's decision):

1. New tables: `organizations` (id, name, slug, allowed_email_domains text[]), `org_members` (org_id, user_id, role).
2. `shares.org_id` column added; backfilled to a `mozilla` org row for existing data.
3. `restrict_to_allowed_domains()` function generalized to look up by `org_members` rather than hardcoded `mozilla.com`/`jennywanger.com`. (Or kept as global allowlist with org assignment happening post-signup.)
4. `'mozilla'` visibility value renamed to `'company-limited'` via a CHECK constraint update and data migration.
5. RLS policies for `company-limited` use the `EXISTS (SELECT 1 FROM org_members ...)` pattern shown above — no Mozilla-string in policy code.

## Per-card permissions (future stub)

Not implementing now. The capability `can_view_card(card_id)` exists in the model so when product wants "this opportunity is only visible to the leadership team," we add a `card_permissions(share_id, card_id, user_id, can_view, can_edit)` sidecar table and a single policy on `share_comments` / future `card_metadata` tables that checks the capability. No RLS rewrite needed elsewhere.

## Decisions still open (for review)

1. **Anonymous comment visibility on public shares.** Today the function returns 401 if there's no JWT — but Supabase RLS would allow it via the `select` policy. Keep auth-required for comments? Recommend: yes, until we have spam controls.
2. **Visibility change column-level enforcement.** Stick with server-side in `resolveRole` (recommended) or write a stored procedure that owners call?
3. **Moderator role timing.** Define now (so policies are already there) or defer until product asks for it? Recommend: leave the capability in the model and the policy SQL ready, but don't surface in UI until needed.
4. **Service-role split.** Refactor `getSupabase()` into `getSupabaseAsUser(jwt)` + `getSupabaseAsService()` as part of Task 9, or before?
