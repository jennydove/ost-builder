# OST Builder — RBAC (Role-Based Access Control)

Draft for review (Phase B Task 8 — gates Task 9 RLS rewrite). Status: **draft, awaiting review**.

This document defines the authorization model. Implementation translates directly into Supabase Row Level Security policies (Phase B Task 9) and Phase G's multi-org schema. Vocabulary defined in **`docs/taxonomy.md`** — read that first if any term is unclear.

## Design principles

1. **Capability-based under the hood, role-based at the API.** Users see roles ("editor"); the system checks capabilities (`tree:write`). Roles are bundles.
2. **Defense in depth.** Authorization is enforced at three layers: (a) RLS in Postgres, (b) function-level checks in Netlify functions, (c) UI gating.
3. **Visibility, org, and explicit membership are independent.** A tree's visibility setting is one dimension; its org assignment is another; explicit members are a third. They compose.
4. **Tenant-agnostic.** Mozilla is one organization, not a special case.
5. **Minimum privilege.** New endpoints default to "deny"; capabilities are opt-in.

## Subjects

| Subject | Identifies |
|---|---|
| **Anonymous** | No session. Can view `link-public` trees only. |
| **Authenticated user** | Has Supabase auth session (`auth.uid()` non-null). Allowed-domain gating still applies at sign-up via `restrict_to_allowed_domains` hook. |
| **Org member** | Authenticated user with a row in `org_members(user_id, org_id)`. |
| **Tree member** | Authenticated user with a row in `tree_members(tree_id, user_id, role)`. |

## Objects

| Object | Notes |
|---|---|
| **Tree** | Row in `trees`. Has `visibility`, `owner_id`, optional `org_id`. |
| **Comment** | Row in `tree_comments`. Inherits accessibility from its tree. |
| **Tree member row** | Row in `tree_members`. Editors can manage these for non-owner members; only owners can manage owner rows. |

## Visibility model

Three discrete visibility settings, each defining the *default* access for anyone reaching the tree's link. Tree members overlay this — explicit grants apply regardless of visibility.

| Setting | Anonymous | Auth'd, no org match, not a member | Auth'd, org member of tree's org | Tree member |
|---|---|---|---|---|
| `link-public` | viewer | viewer | viewer | their `tree_members.role` |
| `domain-restricted` | denied | denied | viewer | their `tree_members.role` |
| `restricted` | denied | denied | denied (org match alone doesn't grant access) | their `tree_members.role` |

Key composition rules:

- **Org and visibility are independent.** A `restricted` tree does *not* need an `org_id`. A personal-domain user (no org) can create one and share with named people.
- **Tree members overlay everything.** Adding `alice@example.com` as a `viewer` on a `restricted` tree gives her access regardless of org.
- **Owner is a tree-member role.** The creator gets a `tree_members` row with role `owner` at creation time.

This is intentionally Google-Docs-shaped: "Restricted" / "Anyone at example.com with the link" / "Anyone with the link" — orthogonal from the explicit named-people grants.

## Capabilities

Capabilities are named `<resource>:<action>`. Industry-standard format (AWS IAM, GitHub, etc.) and unambiguous about which resource is gated.

| Capability | What it permits |
|---|---|
| `tree:read` | Read a tree's markdown, name, settings, collapsed_ids |
| `tree:write` | Update markdown, name, settings, collapsed_ids |
| `tree:visibility` | Update the tree's visibility setting |
| `tree:delete` | Delete the tree (and cascades comments + members) |
| `tree:invite` | Insert into `tree_members` for this tree (constrained: see below) |
| `tree:revoke` | Update / delete `tree_members` rows for this tree (constrained: see below) |
| `tree:members:read` | Read `tree_members` rows for this tree |
| `comment:create` | Insert into `tree_comments` |
| `comment:delete:own` | Delete a `tree_comments` row where `user_id = auth.uid()` |
| `card:read(card_id)` | Read comments / metadata tied to a specific card. Stub for future per-card permissions — today always true if `tree:read` is true. Cost of carrying it through the model: ~zero; payoff if per-card permissions ship: no RLS rewrite. |

### Constraint on member-mutation capabilities

`tree:invite` and `tree:revoke` are not free passes over the entire `tree_members` table. The constraint:

> **You cannot create, update, or delete a `tree_members` row whose role is `owner` unless you yourself are an `owner` of that tree.**

In practice:

- **Editors** can invite new members as `editor` or `viewer`, demote/promote between those two roles, and remove non-owner members. They cannot add a new owner, demote an owner, or remove an owner.
- **Owners** can do all of the above plus owner-level grants and removals.

Encoded in RLS: each `tree_members` INSERT/UPDATE/DELETE policy checks both (a) the actor's role on the tree and (b) the target row's role.

## Roles

Three roles. No commenter, no moderator — added back if and when product asks.

| Role | Bundle |
|---|---|
| **owner** | All capabilities. Unconstrained over `tree_members` (can grant/revoke owners). |
| **editor** | `tree:read` + `tree:write` + `tree:invite` + `tree:revoke` + `tree:members:read` + `comment:create` + `comment:delete:own`. Member-mutation capabilities are constrained to non-owner targets. |
| **viewer** | `tree:read` + `tree:members:read` + `comment:create` + `comment:delete:own` |

Owner-only capabilities: `tree:visibility`, `tree:delete`, plus the unconstrained form of `tree:invite` and `tree:revoke`.

## How this translates to RLS

Concrete SQL lands with Task 9. Below is the intended shape. Note the table names use the target schema (`trees`, `tree_members`, `tree_comments`); the existing live tables are still `shares` / `share_members` / `share_comments` and will be renamed in Phase H. For Task 9, write the policies against the current table names; Phase H rename updates them mechanically.

### `trees` (currently `shares`) table

```sql
-- SELECT: link-public is open to anyone (auth'd or not).
CREATE POLICY trees_select_link_public ON trees FOR SELECT
  USING (visibility = 'link-public');

-- SELECT: domain-restricted is open to org members of the tree's org.
CREATE POLICY trees_select_domain_restricted ON trees FOR SELECT
  USING (
    visibility = 'domain-restricted'
    AND auth.uid() IS NOT NULL
    AND trees.org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = trees.org_id AND om.user_id = auth.uid()
    )
  );

-- SELECT: tree members can always see their tree.
CREATE POLICY trees_select_member ON trees FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tree_members tm
      WHERE tm.tree_id = trees.id AND tm.user_id = auth.uid()
    )
  );

-- INSERT: auth required; the inserting user must be the owner_id.
CREATE POLICY trees_insert ON trees FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = owner_id);

-- UPDATE: editor+. Visibility column is gated separately in app code
-- (RLS works at row level, not column level).
CREATE POLICY trees_update_member ON trees FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tree_members tm
      WHERE tm.tree_id = trees.id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'editor')
    )
  );

-- DELETE: owner only.
CREATE POLICY trees_delete ON trees FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM tree_members tm
      WHERE tm.tree_id = trees.id
        AND tm.user_id = auth.uid()
        AND tm.role = 'owner'
    )
  );
```

### `tree_members` (currently `share_members`) table

The constraint "editors can manage non-owners; only owners can manage owners" is encoded directly in the policies.

```sql
-- SELECT: tree members can see other members of trees they belong to.
CREATE POLICY tree_members_select ON tree_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tree_members tm2
      WHERE tm2.tree_id = tree_members.tree_id AND tm2.user_id = auth.uid()
    )
  );

-- INSERT: owner can insert any role; editor can insert only non-owner roles.
-- Bootstrap exception: the very first owner row at tree creation is inserted
-- via service-role (no existing tree_members row to check against).
CREATE POLICY tree_members_insert ON tree_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tree_members tm
      WHERE tm.tree_id = tree_members.tree_id
        AND tm.user_id = auth.uid()
        AND (
          tm.role = 'owner'                                            -- owner: any target role
          OR (tm.role = 'editor' AND tree_members.role != 'owner')     -- editor: non-owner targets only
        )
    )
  );

-- UPDATE: owner can change any row; editor can update only if both
-- the existing role and the new role are non-owner.
-- (Postgres RLS USING checks the existing row; WITH CHECK checks the new row.)
CREATE POLICY tree_members_update_owner ON tree_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tree_members tm
      WHERE tm.tree_id = tree_members.tree_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'owner'
    )
  );

CREATE POLICY tree_members_update_editor ON tree_members FOR UPDATE
  USING (
    tree_members.role != 'owner'
    AND EXISTS (
      SELECT 1 FROM tree_members tm
      WHERE tm.tree_id = tree_members.tree_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'editor'
    )
  )
  WITH CHECK (tree_members.role != 'owner');

-- DELETE: owner can remove anyone (subject to "must have at least one owner"
-- enforced via trigger or app code); editor can remove only non-owners.
CREATE POLICY tree_members_delete_owner ON tree_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM tree_members tm
      WHERE tm.tree_id = tree_members.tree_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'owner'
    )
  );

CREATE POLICY tree_members_delete_editor ON tree_members FOR DELETE
  USING (
    tree_members.role != 'owner'
    AND EXISTS (
      SELECT 1 FROM tree_members tm
      WHERE tm.tree_id = tree_members.tree_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'editor'
    )
  );
```

A trigger or app-level check should prevent removing the last owner of a tree (otherwise a tree becomes ownerless and undeletable).

### `tree_comments` (currently `share_comments`) table

```sql
-- SELECT: anyone who can read the tree can read its comments.
-- (Inherits via RLS on trees — the EXISTS resolves through tree policies.)
CREATE POLICY tree_comments_select ON tree_comments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM trees t WHERE t.id = tree_comments.tree_id)
  );

-- INSERT: must be authenticated, the author of the row, and have tree access.
CREATE POLICY tree_comments_insert ON tree_comments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM trees t WHERE t.id = tree_id)
  );

-- DELETE: author OR tree owner.
CREATE POLICY tree_comments_delete ON tree_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tree_members tm
      WHERE tm.tree_id = tree_comments.tree_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'owner'
    )
  );
```

## Anonymous user policy

Anonymous (no JWT) users can:

- View `link-public` trees
- View comments on `link-public` trees (open question — see below)
- **Not** comment, edit, or invite (no `user_id` to attribute)

## Service-role usage policy

The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. After Phase B Task 9, service-role is permitted only for:

1. **Creating the owner's own `tree_members` row** at tree creation — chicken-and-egg, no row exists yet for the INSERT policy to check.
2. **System operations** without user context (scheduled cleanup, email worker, rate-limit RPC).
3. **CLI auth flow** if PAT-based bearer tokens (Phase E) don't carry a Supabase JWT.

Every other endpoint calls Supabase **as the user**. The `getSupabase()` helper splits into:

- `getSupabaseAsUser(jwt)` — default
- `getSupabaseAsService()` — explicit, audited usage

## Multi-org evolution (Phase G, bundled with Task 9)

1. New tables: `organizations` (id, name, slug, allowed_email_domains text[]), `org_members` (org_id, user_id, role).
2. `trees.org_id` column added (nullable — supports personal trees without an org).
3. `restrict_to_allowed_domains()` generalized or kept as a global allowlist with org-assignment post-signup.
4. Visibility value migration: `'mozilla'` → `'domain-restricted'`, `'public'` → `'link-public'`, `'private'` → `'restricted'`. CHECK constraint updated, data migrated.
5. RLS policies for `domain-restricted` use the `EXISTS (SELECT 1 FROM org_members ...)` pattern — no Mozilla-string in policy code.

## Per-card permissions (future stub)

Not implementing now. The capability `card:read(card_id)` exists so when product wants "this opportunity is only visible to leadership," we add a `card_permissions(tree_id, card_id, user_id, can_view, can_edit)` table and a single policy on `tree_comments` / future card_metadata tables. No RLS rewrite needed elsewhere.

## Decisions still open (for review)

1. **Anonymous comment visibility on `link-public` trees.** The function currently returns 401 if there's no JWT; the RLS policy above would allow it. Keep auth-required for comment reads (recommended), until we have spam controls?
2. **Visibility-change enforcement.** RLS is row-level, not column-level. Keep the visibility check in app code (recommended) or wrap in a stored procedure?
3. **Service-role split.** Refactor `getSupabase()` into `AsUser` / `AsService` as part of Task 9 (recommended) or before?
4. **"Last owner" enforcement.** Trigger to prevent removing the last owner of a tree, or app-code check? Recommend: trigger — runs regardless of which endpoint or future CLI path makes the call.
5. **Phase H rename timing.** Rename `shares` → `trees` etc. — bundle with Phase G migration (one big schema change, deploy once) or keep separate? Recommend: separate Phase H. Visibility/org work is already a meaningful schema change; piling a full rename on top compounds risk.
