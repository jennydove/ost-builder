# Continuity Brief (2026-05-25)

This document exists so any Claude session can read it and pick up without losing context.

**New session:** read this doc first, then `docs/codebase-audit-2026-05-22.md` for the original audit plan and `docs/rbac.md` + `docs/taxonomy.md` for the authorization model.

## Immediate next action

**Apply migration 0009 and deploy the sharing feature.**

1. Jenny runs `supabase db push` (applies `0009_tree_member_invites.sql`)
2. Deploy code to Netlify (backward-compatible — works before migration, invite features activate after)
3. Test the full invite flow: share a tree, invite by email, recipient signs in, auto-claim grants access

### What migration 0009 changes

- `tree_members.user_id` becomes nullable (pending invites have no user yet)
- New `invited_email` column for email-based invites
- Backfills existing members' emails from `auth.users`
- CHECK constraint: either `user_id` or `invited_email` must be set
- Case-insensitive unique index on `(tree_id, lower(invited_email))`

### What the code changes (already on main)

- New `tree-members.mts` endpoint — CRUD for member management (`/api/trees/:id/members`)
- `resolveRole` auto-claims pending invites by email on first tree access
- Google Docs-style share dialog: email input + role picker, member list, general access, copy link
- Invite email via Resend
- Deleted dead `CloudShareAction.tsx`, consolidated into `ShareAction.tsx`

## Phase status

| Phase | Status | Notes |
|---|---|---|
| A — clear the decks | ✅ | |
| B — close security gaps | ✅ | Migrations 0003–0004, RLS, RBAC |
| C — testing safety net | ✅ | 328 unit tests, 60 E2E, GitHub Actions CI |
| D — performance | ✅ | Bundle 684→360 kB (-47%), no per-keystroke network calls |
| E — CLI revival | ✅ | PAT auth, library commands, `/settings` token page |
| F — repo hygiene | ✅ | DEPLOYMENT.md, runbook.md, test audit cadence |
| G — de-Mozilla | ✅ | Generic visibility labels, no mozost fallback |
| H — rename share → tree | ✅ | 3 tables, 15 RLS policies, 6 functions, all types |
| Sharing feature | ✅ code, ⏳ migration | Google Docs-style invite-by-email, migration 0009 pending |

## Decisions (don't relitigate)

1. Anonymous users cannot comment. Auth required for reads and writes.
2. Visibility-change enforcement stays in PATCH handler TypeScript, not RLS.
3. Three roles only: owner / editor / viewer.
4. Visibility model: `link-public` / `domain-restricted` / `restricted`.
5. Last-owner enforcement: Postgres trigger (in 0003).
6. Service-role for: JWT verification, resolveRole, rate limiting, member bootstrap, admin getUserById. User-context for: data writes (RLS backstop), share list query.
7. CLI auth: PATs, not OAuth dance. Stored as hashed tokens in `cli_tokens` table.
8. SECURITY DEFINER functions (`is_tree_member`, `tree_member_role`, `is_org_member`) bypass RLS for membership lookups to avoid infinite recursion.
9. Only owners can manage members (add/change role/remove). Matches Google Docs model.
10. Pending invites stored in `tree_members` with nullable `user_id` — auto-claimed via `resolveRole` on first access.

## Conventions

**Git email.** Always use noreply:
```
GIT_COMMITTER_EMAIL="63123756+jennydove@users.noreply.github.com"
GIT_COMMITTER_NAME="Jenny Wanger"
git commit --author "Jenny Wanger <63123756+jennydove@users.noreply.github.com>" -m "..."
```

**Pre-commit gate.** `npm test && npm run build && npm run test:e2e` — all 328 unit + 60 E2E must pass.

**Migrations.** Two-PR pattern: SQL-only PR first → `supabase db push` → code PR second.

**Bundle analysis.** `npm run analyze` opens treemap. Current: 360 kB initial (116 kB gz).

## Key paths

| Thing | Location |
|---|---|
| Audit doc | `docs/codebase-audit-2026-05-22.md` |
| RBAC model | `docs/rbac.md` |
| Deployment guide | `docs/DEPLOYMENT.md` |
| Runbook | `docs/runbook.md` |
| CLI docs | `docs/cli.md` |
| Vocabulary | `docs/taxonomy.md` |
| Store slices | `packages/app/src/store/slices/` |
| Supabase project | `https://yxmcfxggyxroiiaxzfbq.supabase.co` |
| Production app | `https://mozost.netlify.app` |
| GitHub repo | `https://github.com/jennydove/ost-builder` |
