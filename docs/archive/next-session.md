# Next Session — ost-builder

## High Priority

**Deploy to Cloudflare Pages**
The production build is clean and fast. The app has been running against `wrangler pages dev` locally but hasn't been deployed. Push the latest build live.

**Verify panning feels smooth in production**
Dev server noise makes it hard to evaluate true performance. Test all panning modes (middle-click, left-click background, shift+drag) against the deployed URL to confirm the real-world experience.

## Medium Priority

**Sidebar still uses full store subscription**
`Sidebar.tsx` (or equivalent settings/detail panel component) still calls `useOSTStore()` with no selector, meaning it re-renders on every state change including panning. Lower priority than the Canvas fixes but worth cleaning up.

**Upstream contributions to thim81/ost-builder**
Two fixes are worth proposing back to the upstream repo:
- `SmartPointerSensor` — prevents dnd-kit from intercepting button/input clicks
- Selective Zustand subscriptions in `OSTCard` and `TreeNode` — clean performance pattern

**Status dropdown in sidebar**
The `z-[100]` fix for SelectContent was applied to the shared `select.tsx` component. Verify the status dropdown in the card detail panel is actually working correctly end-to-end (select, save, persist).

## Low Priority / Nice to Have

**E2E test for status dropdown**
The z-index fix for the status Select was a significant bug. Currently no guard test covers it — would need opening a card detail panel and interacting with the Select. Worth adding once the sidebar subscription cleanup is done.

**Bundle size**
Production bundle is 741 kB (231 kB gzipped). Vite is flagging it. Could investigate dynamic imports for page-level code splitting (`pages/Library`, `pages/StoredShareOpen`). Not urgent — load time is already reasonable.

**Firefox panning edge cases**
Panning works in Firefox but hasn't been tested as thoroughly as Chrome. The Playwright tests cover it, but manual testing of the full interaction set (middle-click, shift+drag, background left-click) in Firefox would be good to confirm.
