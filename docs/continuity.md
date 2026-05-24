# Continuity Brief (2026-05-24)

Where Phase B left off and how to resume. This document exists so any Claude session — different account, different machine, no prior memory — can read it and pick up without losing context.

**If you're a new Claude session opening this repo:** read this doc first, then `docs/codebase-audit-2026-05-22.md` for the original audit plan and `docs/rbac.md` + `docs/taxonomy.md` for the authorization model.

## Current status

**Phase A** — clear the decks. ✅ Landed in `main` (merge commit `76775c8`).

**Phase B** — close security gaps. **Partially landed.**

| Task | Status | PR | Notes |
|---|---|---|---|
| 7. Email HTML escape | ✅ merged | #3 → main | `netlify/functions/_emailUtils.mts` |
| 8. `docs/rbac.md` + `docs/taxonomy.md` | ✅ merged | #4 → main | All review feedback applied; 3 decisions recorded, 2 low-stakes still default-only |
| (new) Service-role split | ⏳ next | not started | Prereq for Task 9 — refactor `getSupabase()` into `getSupabaseAsUser(jwt)` + `getSupabaseAsService()`. Todoist `6ghfx9vfvWhP5WW6` |
| 9. RLS rewrite + Phase G bundled | ⏳ blocked on service-role split | not started | Drop existing buggy policies, write new ones from `docs/rbac.md`, migrate functions, add multi-org schema |
| 10. zod validation | ✅ merged | #5 → main | `netlify/functions/_validation.mts` |
| 11. Rate limits + 256 KB payload cap | ✅ merged | #7 → main | Migration `0002_rate_limits.sql` **not yet applied to production Supabase** — needs `supabase db push` |

**Phase B tracking:** Todoist parent `6ghCqMXRpmG864w2` (under audit parent `6ghCqHw7Fx7pP2rR`).

## What to do next, in order

1. **Apply migration `0002_rate_limits.sql`** to production via `supabase db push`. (Currently the rate-limiter code in main calls an RPC that doesn't exist in prod yet — it fails open with a `console.warn`, so prod still works, but rate limits are silently ineffective until applied.)
2. **Service-role split** (Todoist `6ghfx9vfvWhP5WW6`). Refactor only, no behavior change. One small PR.
3. **Task 9 + Phase G** (Todoist parent `6ghCqWFH26wCGvq2`). The big one — schema migration `0003_phase_g.sql` covering:
   - Drop the 4 existing buggy RLS policies (`members read private shares`, `members see membership`, `read public shares`, `create requires auth` — see `supabase/migrations/0001_baseline.sql:167-191`)
   - Write the new policies from `docs/rbac.md`
   - Rename visibility values: `'mozilla'` → `'domain-restricted'`, `'public'` → `'link-public'`, `'private'` → `'restricted'` (CHECK constraint + data migration)
   - Add `organizations` + `org_members` tables
   - Add nullable `org_id` to `shares`, backfill existing rows to a Mozilla org
   - Last-owner trigger (decided default: trigger over app check)
   - `restrict_to_allowed_domains()` generalized or kept as global allowlist (open decision; lean: generalized)
   - Migrate Netlify functions to use the new `getSupabaseAsUser(jwt)` for read/update/list paths
   - Generic copy in `StoredShareOpen.tsx` (no "Mozilla Google account" string), `CommentsSection.tsx`
   - Remove hardcoded `mozost.netlify.app` fallback in `share-store-comments.mts`
   - Replace seeded Mozilla OST or remove seeding entirely

After Task 9, Phase B is done. Then audit Phase C (testing safety net) → D (performance) → E (CLI revival) → F (repo hygiene) → H (rename `share` → `tree`).

## Decisions made during review (don't relitigate)

From `docs/rbac.md`:

1. **Anonymous users cannot comment.** Auth required for comment reads and writes both. `link-public` trees are anonymously viewable but commenting requires sign-in.
2. **Visibility-change enforcement stays in app code.** Server-side check in the PATCH handler; no stored procedure.
3. **Service-role split happens BEFORE Task 9.** Not part of it.
4. **Editors can CRUD non-owner members** but cannot mutate owner rows. Encoded directly in `tree_members` RLS via separate policies for owner vs editor actors.
5. **Three roles only: owner / editor / viewer.** No commenter, no moderator on the roadmap.
6. **Visibility model is Google-Docs-shaped:** `link-public` / `domain-restricted` / `restricted` — independent of org assignment and explicit members, all three compose.
7. **Capability naming is resource:action format** (e.g., `tree:read`, `tree:write`). Industry-standard.
8. **Rename `share` → `tree`** is a future Phase H, kept separate from Phase G to limit per-migration risk. Tracked in Todoist `6ghfxgQ43Fr9jwjc`.

Defaults for the two still-open decisions (Jenny approved):
- Last-owner enforcement → Postgres trigger
- Phase H rename timing → separate from Phase G

## Conventions

**Git author/committer email.** Jenny's GitHub blocks pushes from `jennywanger@gmail.com` due to email privacy. Always use:

```
GIT_COMMITTER_EMAIL="63123756+jennydove@users.noreply.github.com"
GIT_COMMITTER_NAME="Jenny Wanger"
git commit --author "Jenny Wanger <63123756+jennydove@users.noreply.github.com>" -m "..."
```

Per the safety protocol, do NOT modify git config — pass via env vars / `--author` for each commit.

**Pre-commit gate.** `npm run build && npm run test:e2e` must pass (16 tests). Not optional. Already documented in `CLAUDE.md`. `npm test` (unit) has 6 pre-existing failures in `markdownOST.test.ts` unrelated to recent work (tracked separately as Todoist `6ghX85RV5jQJmpF6`) — those don't block commits, but new unit tests Claude adds should pass.

**Branch + PR per task.** Each Todoist task gets its own branch named `task-N/short-description` (or `phase-X/...` for whole phases) and its own PR against `main`. PR titles match `Task N: ...`. PR descriptions reference Todoist IDs.

**Stacked PRs.** If a task depends on another in-flight PR, stack via `--base task-N/branch`. Note in PR body that it depends on the upstream PR. After upstream merges, GitHub auto-closes the stacked PR — reopen it via a fresh `gh pr create` against `main` (the branch survives).

**Migrations deploy via `supabase db push`.** Jenny runs this — not automated. Claude commits the SQL file under `supabase/migrations/0NNN_name.sql` and notes in the PR that the migration needs to be applied.

## Key paths and IDs

| Thing | Location |
|---|---|
| Audit doc | `docs/codebase-audit-2026-05-22.md` |
| RBAC model | `docs/rbac.md` |
| Vocabulary | `docs/taxonomy.md` |
| Supabase project URL | `https://yxmcfxggyxroiiaxzfbq.supabase.co` |
| Production app | `https://mozost.netlify.app` |
| GitHub repo | `https://github.com/jennydove/ost-builder` |
| Todoist audit parent | `6ghCqHw7Fx7pP2rR` |
| Todoist Phase B parent | `6ghCqMXRpmG864w2` |
| Todoist Phase H parent | `6ghfxgQ43Fr9jwjc` |
| Service-role split task | `6ghfx9vfvWhP5WW6` |
| Service worker MCP availability | `td` CLI (Todoist), `gh` CLI (GitHub), Playwright MCP for browser, Supabase CLI for migrations |

## Env requirements for local dev

Required in `packages/app/.env.local`:

```
VITE_SUPABASE_URL=https://yxmcfxggyxroiiaxzfbq.supabase.co
VITE_SUPABASE_ANON_KEY=<from Supabase dashboard>
```

Without these, the cloud UI is gated off and the app falls back to local-only mode (no login, no comments). The `supabaseConfigured` check in `packages/app/src/lib/supabaseClient.ts:7` is what enforces this.

Production env (Netlify dashboard) requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `APP_BASE_URL`.

## What's in flight that Claude should know

- **Rate-limit migration not deployed yet.** The function code is in prod but the SQL function it calls isn't. Currently no-ops with a console warning. Won't break anything but won't enforce limits either.
- **PR template etc.** not yet added (Phase C item).
- **Pre-existing markdownOST.test.ts failures** — 6 tests in `packages/app/src/test/markdownOST.test.ts` fail on main (`@next`, `@done` status not stripped from card titles after commit `42b1348`). Tracked in Todoist `6ghX85RV5jQJmpF6`. Don't get bogged down trying to fix these — they predate Phase B.

## How to verify continuity worked

After moving the repo and starting a new Claude session, the new session should:

1. Read `CLAUDE.md` → finds the continuity-doc pointer
2. Read `docs/continuity.md` (this file) → learns current state
3. Verify by running `git log --oneline -5` and confirming the recent merges
4. Verify by running `gh pr list --state merged --limit 5` and confirming PRs #3 #4 #5 #7 are there
5. Verify by running `td task list --parent "id:6ghCqMXRpmG864w2" --json` and confirming Phase B subtasks are visible
6. Resume with the "service-role split" task as the next concrete unit of work
