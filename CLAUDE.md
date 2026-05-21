# ost-builder — Instructions for Claude

## Before Every Commit

Always run the E2E guard tests before committing any change to the app package:

```
npm run build && npm run test:e2e
```

All 14 tests must pass (Chromium + Firefox) before committing. If a test fails, fix the regression first — do not commit around it.

The tests cover the interactions that have repeatedly regressed:
- Zoom controls responding to clicks
- Card three-dot menu opening
- Middle-click and left-click-drag canvas panning
- Card drag not triggering canvas pan

## Project Overview

OST (Opportunity Solution Tree) builder — React + Vite + Cloudflare Pages.

**Run locally:** `npm run dev` (Vite dev server, slow first load due to module-per-file) or `npm run build && npm run preview` (production build, fast).

**Key packages:**
- `packages/app` — React frontend
- `packages/shared` — shared types + markdown serialization
- `packages/cli` — npm CLI tool

## Performance Notes

- Dev server (`npm run dev`) has 100+ module requests on first load — normal Vite behavior, not a bug
- Production build is a single 741 kB JS bundle (~231 kB gzipped)
- Canvas panning performance is sensitive to React re-render count — avoid subscriptions to frequently-changing store slices (canvasState) inside card/tree components
