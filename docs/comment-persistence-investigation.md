# Comment-persistence investigation (2026-05-23)

Tracking Todoist `6ghX49fqC2RV57w2`. Static-analysis only — not yet reproduced live in browser.

## Symptoms (per Jenny, against `mozost.netlify.app`)

1. Comments don't persist past page refresh.
2. Comments don't sync across windows.

## Leading hypothesis — the reconcile is destroying unsynced local edits

`ActiveCloudShareTracker` in `App.tsx:96-178` reconciles cloud markdown into the local store on every mount, gated by a ref that resets every page load. The flow:

```ts
// On every mount (i.e., every page refresh)
const sourceKey = getActiveLocalSnapshotSourceKey();          // 'cloud:<id>'
const snap = findLocalSnapshotBySource(sourceKey);
let cloudShareId = snap?.cloudShareId ?? null;
if (!cloudShareId && sourceKey?.startsWith('cloud:')) {
  cloudShareId = sourceKey.slice('cloud:'.length);            // fallback
}

// ... fetches share payload + comments ...

if (payload && lastReconciledRef.current !== cloudShareId) {
  lastReconciledRef.current = cloudShareId;
  if (payload.markdown !== useOSTStore.getState().markdown) {
    loadFromStoredShare({ markdown: payload.markdown, ... });  // CLOUD WINS
  }
}
```

The bug chain:

1. `upsertShareSnapshot()` (called from `StoredShareOpen.tsx:28` and `App.tsx:193`) **never sets `cloudShareId` on the snapshot record** — its `SnapshotPayload` type (`localSnapshots.ts:14-19`) doesn't include the field.
2. Because the snapshot has no `cloudShareId`, `LibraryAutoSave` (`App.tsx:74`) **skips the cloud-sync branch entirely** for shares opened via `/s/:id`:
   ```ts
   if (supabaseConfigured && sessionRef.current && saved?.cloudShareId) {
     void updateStoredShare(saved.cloudShareId, { markdown, name, ... });
   }
   ```
3. So local edits — including new cards with new `{#id}` markers — never reach the cloud.
4. User posts a comment on a locally-created card. The comment **does** hit the DB (`share-store-comments.mts` doesn't care whether the card_id exists in `shares.markdown`). DB now has `share_comments` rows with `card_id` values that exist only in local markdown.
5. User refreshes. Local markdown rehydrates from `ost-storage` correctly. But then `ActiveCloudShareTracker` fires its reconcile and **replaces local markdown with the cloud's stale copy** (which lacks the new cards). Cards disappear; comments orphan; UI shows "no comments."

The clue that this is real: commit `3ddb974` ("Cloud-first sync + comment polling") explicitly added the reconcile to "fix the drift problems surfaced by comments" — that fix is partially correct (it stabilizes the open-from-link case) but breaks the round-trip when locally created cards haven't yet round-tripped to the cloud.

### Probable two-line fix

In `localSnapshots.ts`, accept and store `cloudShareId` in `upsertShareSnapshot`:

```ts
// localSnapshots.ts
export function upsertShareSnapshot(
  sourceKey: string,
  sourceType: 'share-cloud' | 'share-fragment',
  input: SnapshotPayload & { cloudShareId?: string },  // add
): LocalSnapshot { ... }
```

In `StoredShareOpen.tsx:28-33`, pass `cloudShareId: id`. That alone unblocks `LibraryAutoSave` and the rest of the chain works.

Even better: make the reconcile **only run when the local snapshot has never been synced** (no `syncedAt`, or `syncedAt < cloud.updatedAt`). That makes refresh non-destructive in both directions.

## Secondary issue — cross-window sync is 10s polling, throttled

`CommentsSection.tsx:91-94` polls every 10s while panel is open and `document.visibilityState === 'visible'`. Two limitations:

- **Chrome throttles background-tab timers** to ~1/min after ~5 min of inactivity. Two windows side-by-side on the same monitor: the unfocused one is "background" and won't poll on schedule.
- **Polling is per-card.** Window A on card X, Window B on card Y — B never sees A's new comment on X until B clicks X.

The correct fix is **Supabase Realtime channel subscription** on `share_comments` filtered by `share_id`. That's a small, isolated change (~30 lines) and removes the polling entirely. Worth pairing with the Phase B work since it touches the same surface.

## What I want to confirm by reproducing in browser

1. Open `/s/<id>` as owner. Edit cards (create new ones). Refresh.
2. Inspect `localStorage`:
   - `ost:local:active-source-key` — should still point to `cloud:<id>` ✓
   - `ost:local:snapshots:v1` — entry for that source key — does it have `cloudShareId`? **Expecting: no.**
3. In DevTools, set `useOSTStore.getState().activeCloudShareId` — does it match `<id>`?
4. Inspect Network: did `PATCH /api/share/store/<id>` fire during typing? **Expecting: no.** That's the smoking gun for #2 above.
5. After refresh, did the local cards disappear (replaced by cloud markdown)? **Expecting: yes**, for cards created since the last cloud sync that happened via Share/CloudShare action.

## Not the cause

Things I considered and ruled out via code-read:

- **Card ID instability** — `markdownOST.ts:194-201` correctly preserves explicit `{#id}` markers, and `serializeTreeToMarkdown` writes them back in. Store actions (`addCard`/`updateCard`/etc.) all re-serialize, so persisted markdown always has IDs. Fixed by commit `42b1348`.
- **RLS blocking comment GET** — current RLS is bypassed by service-role; the function-level `resolveRole` returns `'viewer'` for public shares regardless of auth. Not a gate.
- **Session loss on refresh** — Supabase JS client persists session in localStorage by default. Verified the auth path uses `getSession()`, not `getUser()`, so cached session works synchronously.

## Recommended fix scope (don't merge yet — pending repro)

If browser repro confirms hypothesis #1:

1. Plumb `cloudShareId` through `upsertShareSnapshot` and the two call sites that use `cloud:` source keys.
2. Tighten the reconcile gate in `ActiveCloudShareTracker` so it doesn't overwrite local on refresh when there are unsynced changes.
3. (Bonus, in scope) Replace 10s polling with Supabase Realtime subscription in `CommentsSection`.

All three are small; the first two are bug fixes and should land together. The Realtime swap is an enhancement and could be a separate PR.
