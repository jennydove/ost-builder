# Continuity Brief (2026-05-24)

This document exists so any Claude session can read it and pick up without losing context.

**New session:** read this doc first, then `docs/codebase-audit-2026-05-22.md` for the original audit plan and `docs/rbac.md` + `docs/taxonomy.md` for the authorization model.

## Immediate next action

**Apply migration and merge PR #18.** This completes Task 9 / Phase B / Phase G.

1. Jenny runs `supabase db push` (applies `0003_phase_g.sql`)
2. Merge PR #18 (`task-9/code-migration`)
3. Verify: create a share, read as anonymous, post a comment
4. Commit `0004_tighten_visibility_check.sql` — tightens CHECK to only accept new visibility values

`SUPABASE_ANON_KEY` is already in Netlify env vars (confirmed via CLI).

### What PR #18 changes

- `resolveRole`: `link-public` / `domain-restricted` (checks `org_members` via `org_id`) / `restricted`
- Write operations use `getSupabaseAsUser(jwt)` — RLS defense-in-depth
- `share-store` GET list uses user-context (RLS filters)
- Frontend: generic visibility labels, "Sign in to view" copy, no mozost fallback
- All tests updated (316 unit, 22 resolveRole cases with org_members mock)

## Phase status

| Phase | Status | Notes |
|---|---|---|
| A — clear the decks | ✅ | |
| B — close security gaps | **PR #18 ready** | Blocked on `supabase db push` |
| C — testing safety net | ✅ | 316 unit tests, 16 E2E, GitHub Actions CI |
| D — performance | ✅ | Bundle 684→360 kB (-47%), no per-keystroke network calls, ostStore sliced |
| E — CLI revival | **next** | Depends on Phase B landing |
| F — repo hygiene | **2 items left** | DEPLOYMENT.md + runbook.md done. Remaining: test audit cadence, mozilla vault CLAUDE.md |
| G — de-Mozilla | **In PR #18** | Bundled with Task 9 |
| H — rename share → tree | not started | After Phase B. Todoist `6ghfxgQ43Fr9jwjc` |

## After Phase B lands

### Phase E — CLI revival (highest priority)

The CLI is the AI-agent product surface. Current CLI has legacy auth (HMAC/GitHub OAuth) that doesn't work against Supabase.

1. **Schema:** `cli_tokens` table (user_id, token_hash, label, last_used_at, expires_at)
2. **Endpoints:** `POST /api/cli/tokens` (issue), `DELETE /api/cli/tokens/:id` (revoke), `GET /api/cli/tokens` (list)
3. **CLI auth:** `ost-builder auth login <token>` stores PAT in `~/.config/ost-builder/cli-session.json`
4. **Frontend:** `/settings/tokens` page for generating PATs
5. **CLI commands:** verify `library list`, `library upload`, `library download` work end-to-end
6. **Docs:** `docs/cli.md` with agent-driven usage examples

### Phase H — rename share → tree

Separate migration: rename tables (`shares` → `trees`, `share_members` → `tree_members`, `share_comments` → `tree_comments`), update all RLS policy references, update all code. Grep-and-replace scope is large but mechanical. Test suite catches regressions.

### Phase F remaining

- Set up weekly test-quality audit (scheduled task or `/loop`)
- Update Mozilla vault CLAUDE.md to remove ost-builder references (it's now a standalone repo at `~/projects/ost-builder`)

## Decisions (don't relitigate)

1. Anonymous users cannot comment. Auth required for reads and writes.
2. Visibility-change enforcement stays in PATCH handler TypeScript, not RLS.
3. Three roles only: owner / editor / viewer.
4. Visibility model: `link-public` / `domain-restricted` / `restricted`.
5. Last-owner enforcement: Postgres trigger (in 0003).
6. Phase H rename: separate from Phase G.
7. Service-role for: JWT verification, resolveRole, rate limiting, member bootstrap, admin getUserById. User-context for: data writes (RLS backstop), share list query.
8. CLI auth: PATs, not OAuth dance. Stored as hashed tokens in `cli_tokens` table.

## Conventions

**Git email.** Always use noreply:
```
GIT_COMMITTER_EMAIL="63123756+jennydove@users.noreply.github.com"
GIT_COMMITTER_NAME="Jenny Wanger"
git commit --author "Jenny Wanger <63123756+jennydove@users.noreply.github.com>" -m "..."
```

**Pre-commit gate.** `npm test && npm run build && npm run test:e2e` — all 316 unit + 16 E2E must pass.

**Migrations.** Two-PR pattern: SQL-only PR first → `supabase db push` → code PR second.

**Bundle analysis.** `npm run analyze` opens treemap. Current: 360 kB initial (116 kB gz), 171 kB editor chunk (48 kB gz).

## Key paths

| Thing | Location |
|---|---|
| Audit doc | `docs/codebase-audit-2026-05-22.md` |
| RBAC model | `docs/rbac.md` |
| Deployment guide | `docs/DEPLOYMENT.md` |
| Runbook | `docs/runbook.md` |
| Vocabulary | `docs/taxonomy.md` |
| Store slices | `packages/app/src/store/slices/` |
| Supabase project | `https://yxmcfxggyxroiiaxzfbq.supabase.co` |
| Production app | `https://mozost.netlify.app` |
| GitHub repo | `https://github.com/jennydove/ost-builder` |
| Todoist audit parent | `6ghCqHw7Fx7pP2rR` |
| Todoist Phase E parent | `6ghCqP9mXRXHcMxR` |
| Todoist Phase H parent | `6ghfxgQ43Fr9jwjc` |
