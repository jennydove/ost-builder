# ost-builder — Instructions for Claude

## Before Every Commit

Always run the E2E guard tests before committing any change to the app package:

```
npm run build && npm run test:e2e
```

All 16 tests must pass (Chromium + Firefox) before committing. If a test fails, fix the regression first — do not commit around it.

The tests cover the interactions that have repeatedly regressed:
- Zoom controls responding to clicks
- Card three-dot menu opening
- Middle-click and left-click-drag canvas panning
- Card drag not triggering canvas pan

## Project Overview

OST (Opportunity Solution Tree) builder — React + Vite frontend, Netlify Functions backend, Supabase (Postgres + Auth) for data and identity.

**Run locally:** `npm run dev` (Vite dev server, slow first load due to module-per-file) or `npm run build && npm run preview` (production build, fast).

**Key packages:**
- `packages/app` — React frontend
- `packages/shared` — shared types + markdown serialization
- `packages/cli` — npm CLI tool (legacy auth/library commands disabled pending Phase E PAT-based rebuild — see `docs/codebase-audit-2026-05-22.md`)
- `netlify/functions/` — live backend (Supabase JWT auth, service-role DB access — Phase B will add RLS)

## Performance Notes

- Dev server (`npm run dev`) has 100+ module requests on first load — normal Vite behavior, not a bug
- Production build is a single ~684 kB JS bundle (~212 kB gzipped). Phase D will diagnose with rollup-plugin-visualizer and code-split.
- Canvas panning performance is sensitive to React re-render count — avoid subscriptions to frequently-changing store slices (canvasState) inside card/tree components
