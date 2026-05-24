# ost-builder — Instructions for Claude

## Before Every Commit

Run the full test gate before committing any change to the app package:

```
npm test && npm run build && npm run test:e2e
```

All unit tests and all 60 E2E tests must pass (Chromium + Firefox) before committing. If a test fails, fix the regression first — do not commit around it.

## Testing Requirements

Every change must include appropriate tests:

- **New Netlify function or endpoint:** at least one auth test (anonymous denied / wrong-role denied / owner allowed) and one happy-path test
- **New `ostStore` action:** a reducer test asserting the post-state
- **New user-visible UI feature:** at least one E2E or component test of the happy path
- **Bug fix:** a test that fails without the fix and passes with it

## Project Overview

OST (Opportunity Solution Tree) builder — React + Vite frontend, Netlify Functions backend, Supabase (Postgres + Auth) for data and identity.

**Run locally:** `npm run dev` (Vite dev server, slow first load due to module-per-file) or `npm run build && npm run preview` (production build, fast).

**Key packages:**
- `packages/app` — React frontend
- `packages/shared` — shared types + markdown serialization
- `packages/cli` — npm CLI tool (legacy auth/library commands disabled pending Phase E PAT-based rebuild — see `docs/codebase-audit-2026-05-22.md`)
- `netlify/functions/` — live backend (Supabase JWT auth, RLS defense-in-depth)

## Current Work Context

For where the audit work left off and what's next, read **`docs/continuity.md`** — it captures the current phase, decisions, conventions (including the git noreply-email pattern), and the next concrete unit of work.

## Performance Notes

- Dev server (`npm run dev`) has 100+ module requests on first load — normal Vite behavior, not a bug
- Production build is ~360 kB initial JS (~116 kB gzipped) plus a lazy-loaded editor chunk. Run `npm run analyze` to inspect bundle composition.
- Canvas panning performance is sensitive to React re-render count — avoid subscriptions to frequently-changing store slices (canvasState) inside card/tree components
