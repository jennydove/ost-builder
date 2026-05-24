# Continuity Brief (2026-05-24)

This document exists so any Claude session can read it and pick up without losing context.

**New session:** read this doc first, then `docs/codebase-audit-2026-05-22.md` for the original audit plan and `docs/rbac.md` + `docs/taxonomy.md` for the authorization model.

## Immediate next action

**Apply migration and merge PR #18.** This completes Task 9 / Phase B.

1. Jenny runs `supabase db push` (applies `0003_phase_g.sql`)
2. Merge PR #18 (`task-9/code-migration`)
3. Verify: create a share, read as anonymous, post a comment
4. Apply follow-up `0004_tighten_visibility_check.sql` to remove transitional old visibility values from CHECK constraint

`SUPABASE_ANON_KEY` is already in Netlify env vars (confirmed via CLI).

### What PR #18 changes

- `resolveRole`: `link-public` / `domain-restricted` (checks `org_members` via `org_id`) / `restricted`
- Write operations (PATCH, DELETE, comment POST/DELETE) use `getSupabaseAsUser(jwt)` — RLS defense-in-depth
- `share-store` GET list uses user-context (RLS filters)
- Frontend: generic visibility labels, "Sign in to view" copy, no mozost fallback
- All tests updated (316 unit, 22 resolveRole cases with org_members mock)

## Phase status

| Phase | Status | Notes |
|---|---|---|
| A — clear the decks | ✅ complete | |
| B — close security gaps | **PR #18 ready** | Blocked on `supabase db push` for 0003_phase_g.sql |
| C — testing safety net | ✅ complete | 316 unit tests, 16 E2E, CI on every PR |
| D — performance | **Partially done** | Shadcn cleanup (#19), background traffic fix (#20), visualizer (#21) landed. Remaining: lazy-load OSTBuilder, replace framer-motion, ostStore slices |
| E — CLI revival | not started | Depends on Phase B |
| F — repo hygiene | **Partially done** | DEPLOYMENT.md + runbook.md (#22) landed. Remaining: weekly test audit cadence |
| G — de-Mozilla | **In PR #18** | Bundled with Task 9 |
| H — rename share → tree | not started | After Phase G. Todoist `6ghfxgQ43Fr9jwjc` |

## After Phase B: what to work on next

### Phase D remaining (independent, no blockers)

1. **Lazy-load OSTBuilder** behind a route boundary — `/s/:id` share viewers currently download the full editor. Biggest potential bundle win.
2. **Replace framer-motion** with CSS transitions — used for one card-entry animation in `OSTCard.tsx`. Heavy dep.
3. **Refactor ostStore into slices** — canvas / cards / share / comments. 628 lines, 30+ actions in one file. `canvasState` subscriptions cause unnecessary re-renders (already noted in CLAUDE.md).

Run `npm run analyze` to see the treemap before deciding cut order.

### Phase E — CLI revival

- Implement `cli_tokens` table + `/api/cli/tokens` endpoints
- Rebuild CLI auth around PATs (personal access tokens) — no OAuth dance
- Verify all `library *` commands work end-to-end against Supabase
- `docs/cli.md` with agent-driven usage examples

### Phase H — rename share → tree

Separate migration from Phase G to limit risk. Rename tables (`shares` → `trees`, `share_members` → `tree_members`, `share_comments` → `tree_comments`), update all code references.

## Decisions (don't relitigate)

1. Anonymous users cannot comment. Auth required for reads and writes.
2. Visibility-change enforcement stays in PATCH handler TypeScript, not RLS.
3. Three roles only: owner / editor / viewer.
4. Visibility model: `link-public` / `domain-restricted` / `restricted` — Google-Docs-shaped.
5. Last-owner enforcement: Postgres trigger (implemented in 0003).
6. Phase H rename timing: separate from Phase G (implemented).
7. Service-role kept for: JWT verification, resolveRole, rate limiting, share_members bootstrap, admin getUserById. User-context for: data writes (RLS backstop), share list query.

## Conventions

**Git email.** Always use noreply — Jenny's GitHub blocks `jennywanger@gmail.com`:
```
GIT_COMMITTER_EMAIL="63123756+jennydove@users.noreply.github.com"
GIT_COMMITTER_NAME="Jenny Wanger"
git commit --author "Jenny Wanger <63123756+jennydove@users.noreply.github.com>" -m "..."
```

**Pre-commit gate.** `npm test && npm run build && npm run test:e2e` — all 316 unit + 16 E2E must pass.

**Branch + PR per task.** Branch: `task-N/short-description` or `phase-X/description`. PR titles match.

**Migrations.** Two-PR pattern: SQL-only PR first → Jenny applies via `supabase db push` → code PR second.

## Key paths

| Thing | Location |
|---|---|
| Audit doc | `docs/codebase-audit-2026-05-22.md` |
| RBAC model | `docs/rbac.md` |
| Deployment guide | `docs/DEPLOYMENT.md` |
| Runbook | `docs/runbook.md` |
| Vocabulary | `docs/taxonomy.md` |
| Supabase project | `https://yxmcfxggyxroiiaxzfbq.supabase.co` |
| Production app | `https://mozost.netlify.app` |
| GitHub repo | `https://github.com/jennydove/ost-builder` |
| Todoist audit parent | `6ghCqHw7Fx7pP2rR` |
| Todoist Phase D parent | `6ghCqP62Mf8m2WjR` |
| Todoist Phase H parent | `6ghfxgQ43Fr9jwjc` |
