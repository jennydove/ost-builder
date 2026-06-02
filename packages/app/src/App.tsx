import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route, useLocation, useMatch } from 'react-router-dom';
import { useEffect, useRef, lazy, Suspense } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useOSTStore } from '@/store/ostStore';
import { decodeMarkdownFromUrlFragment } from '@ost-builder/shared';
import {
  buildFragmentSourceKey,
  buildSnapshotPayloadHash,
  findLocalSnapshotBySource,
  getActiveLocalSnapshotSourceKey,
  setActiveLocalSnapshotSourceKey,
  upsertLocalSnapshotBySource,
  upsertDraftSnapshot,
  upsertShareSnapshot,
  updateLocalSnapshot,
} from '@/lib/localSnapshots';
import { getTree, listTreeComments, updateTree } from '@/lib/treeApi';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';
import CdnStats from '@/components/analytics/CdnStats';
import NotFound from './pages/NotFound';

const Index = lazy(() => import('./pages/Index'));
const StoredShareOpen = lazy(() => import('./pages/TreeOpen'));
const Settings = lazy(() => import('./pages/Settings'));
const Library = lazy(() => import('./pages/Library'));


function LibraryAutoSave() {
  const markdown = useOSTStore((state) => state.markdown);
  const projectName = useOSTStore((state) => state.projectName);
  const layoutDirection = useOSTStore((state) => state.layoutDirection);
  const experimentLayout = useOSTStore((state) => state.experimentLayout);
  const viewDensity = useOSTStore((state) => state.viewDensity);
  const collapsedCardIds = useOSTStore((state) => state.collapsedCardIds);
  const cloudShareMatch = useMatch('/s/:id');
  const urlCloudTreeId = cloudShareMatch?.params.id ?? null;
  const localTimerRef = useRef<number | null>(null);
  const cloudTimerRef = useRef<number | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      sessionRef.current = session;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      sessionRef.current = session;
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (localTimerRef.current) window.clearTimeout(localTimerRef.current);

    const payload = {
      name: projectName,
      markdown,
      settings: { layoutDirection, experimentLayout, viewDensity },
      collapsedIds: collapsedCardIds,
    };

    // Fast local save (1s debounce)
    localTimerRef.current = window.setTimeout(() => {
      let saved = null;
      if (urlCloudTreeId) {
        // URL is on /s/:id — autosave keys directly on the cloud snapshot.
        const cloudSourceKey = `cloud:${urlCloudTreeId}`;
        saved = upsertLocalSnapshotBySource(cloudSourceKey, 'share-cloud', payload);
        if (!saved.cloudTreeId) {
          saved = updateLocalSnapshot(saved.id, { cloudTreeId: urlCloudTreeId }) ?? saved;
        }
      } else {
        const activeSourceKey = getActiveLocalSnapshotSourceKey();
        if (activeSourceKey) {
          const existing = findLocalSnapshotBySource(activeSourceKey);
          if (existing?.sourceType) {
            saved = upsertLocalSnapshotBySource(activeSourceKey, existing.sourceType, payload);
          }
        }
        if (!saved) {
          saved = upsertDraftSnapshot(payload);
        }
      }

      // Throttled cloud sync (5s debounce, separate timer)
      if (supabaseConfigured && sessionRef.current && saved?.cloudTreeId) {
        const shareId = saved.cloudTreeId;
        const snapId = saved.id;
        const payloadHash = buildSnapshotPayloadHash(payload);

        // Skip if local state already matches the cloud's last-known hash —
        // e.g. the change was applied by the poller, not the user.
        const { cloudPayloadHash } = useOSTStore.getState();
        if (cloudPayloadHash === payloadHash) return;

        if (cloudTimerRef.current) window.clearTimeout(cloudTimerRef.current);
        cloudTimerRef.current = window.setTimeout(() => {
          const { beginCloudSync, finishCloudSync, failCloudSync } = useOSTStore.getState();
          beginCloudSync();
          void updateTree(shareId, {
            markdown: payload.markdown,
            name: payload.name,
            settings: payload.settings,
            collapsedIds: payload.collapsedIds,
          }).then(() => {
            updateLocalSnapshot(snapId, { syncedAt: Date.now() });
            finishCloudSync(payloadHash);
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Sync failed';
            failCloudSync(msg);
          });
        }, 4000);
      }
    }, 1000);

    return () => {
      if (localTimerRef.current) window.clearTimeout(localTimerRef.current);
    };
  }, [markdown, projectName, layoutDirection, experimentLayout, viewDensity, collapsedCardIds, urlCloudTreeId]);

  return null;
}

const TREE_POLL_INTERVAL_MS = 10_000;

function computeLocalHash(state: ReturnType<typeof useOSTStore.getState>): string {
  return buildSnapshotPayloadHash({
    name: state.projectName,
    markdown: state.markdown,
    settings: {
      layoutDirection: state.layoutDirection,
      experimentLayout: state.experimentLayout,
      viewDensity: state.viewDensity,
    },
    collapsedIds: state.collapsedCardIds,
  });
}

function resolveActiveCloudTreeIdFromStorage(): string | null {
  const sourceKey = getActiveLocalSnapshotSourceKey();
  const snap = sourceKey ? findLocalSnapshotBySource(sourceKey) : null;
  let id = snap?.cloudTreeId ?? null;
  if (!id && sourceKey?.startsWith('cloud:')) id = sourceKey.slice('cloud:'.length);
  return id;
}

function ActiveCloudShareTracker() {
  const setActiveCloudContext = useOSTStore((state) => state.setActiveCloudContext);
  const setCommentCounts = useOSTStore((state) => state.setCommentCounts);
  const loadFromStoredShare = useOSTStore((state) => state.loadFromStoredShare);
  const resetCloudSync = useOSTStore((state) => state.resetCloudSync);
  const cloudShareMatch = useMatch('/s/:id');
  const urlCloudTreeId = cloudShareMatch?.params.id ?? null;

  useEffect(() => {
    if (!supabaseConfigured) return;

    let cancelled = false;
    let currentTreeId: string | null = null;

    async function reconcile(isInitial: boolean) {
      // URL is the source of truth when on /s/:id. Otherwise fall back to
      // activeSourceKey (e.g. a draft that has been synced to cloud).
      const cloudTreeId = urlCloudTreeId ?? resolveActiveCloudTreeIdFromStorage();
      const treeSwitched = cloudTreeId !== currentTreeId;
      currentTreeId = cloudTreeId;

      if (!cloudTreeId) {
        if (treeSwitched) {
          setActiveCloudContext(null, false);
          setCommentCounts({});
          resetCloudSync(null);
        }
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled || cloudTreeId !== currentTreeId) return;
        if (!session) {
          setActiveCloudContext(cloudTreeId, false);
          return;
        }

        const [payload, commentsRes] = await Promise.all([
          getTree(cloudTreeId).catch(() => null),
          listTreeComments(cloudTreeId).catch(() => ({ comments: [] })),
        ]);
        if (cancelled || cloudTreeId !== currentTreeId) return;

        const isOwner = payload?.role === 'owner';
        setActiveCloudContext(cloudTreeId, isOwner);

        const counts: Record<string, number> = {};
        for (const c of commentsRes.comments) {
          counts[c.cardId] = (counts[c.cardId] ?? 0) + 1;
        }
        setCommentCounts(counts);

        if (!payload) return;

        const state = useOSTStore.getState();
        const localHash = computeLocalHash(state);

        // Determine if it's safe to apply the cloud payload. The dirty-check
        // is whether local diverges from the last cloud hash we know about.
        const localIsDirty =
          state.cloudPayloadHash !== null && localHash !== state.cloudPayloadHash;

        // If the cloud hasn't changed since our last successful sync, do nothing.
        // (Skip this short-circuit on initial mount — we may need to load it for the first time.)
        const cloudPayload = {
          name: payload.name ?? '',
          markdown: payload.markdown,
          settings: payload.settings,
          collapsedIds: payload.collapsedIds ?? [],
        };
        const cloudHash = buildSnapshotPayloadHash(cloudPayload);
        if (!isInitial && !treeSwitched && cloudHash === state.cloudPayloadHash) return;

        if (!isInitial && !treeSwitched && localIsDirty) {
          // Local has unpushed edits. Don't clobber — autosave will push, then
          // the next poll will reconcile.
          return;
        }

        if (!isInitial && !treeSwitched && state.editingCardId !== null) {
          // User has an inline card title editor open. loadFromStoredShare
          // resets editingCardId, which would unmount the input mid-edit.
          return;
        }

        if (localHash !== cloudHash || treeSwitched) {
          loadFromStoredShare({
            markdown: payload.markdown,
            name: payload.name ?? undefined,
            settings: payload.settings,
            collapsedIds: payload.collapsedIds,
          });
        }

        // Use the post-load store state as the canonical hash, so subsequent
        // autosaves don't see a phantom diff caused by applyProjectNameToMarkdown.
        const postState = useOSTStore.getState();
        const postHash = computeLocalHash(postState);
        resetCloudSync(postHash);

        const liveSourceKey = getActiveLocalSnapshotSourceKey();
        const liveSnap = liveSourceKey ? findLocalSnapshotBySource(liveSourceKey) : null;
        if (liveSnap) {
          updateLocalSnapshot(liveSnap.id, {
            markdown: postState.markdown,
            name: postState.projectName,
            settings: payload.settings ?? liveSnap.settings,
            collapsedIds: payload.collapsedIds ?? liveSnap.collapsedIds ?? [],
            syncedAt: Date.now(),
          });
        }
      } catch {
        // best-effort
      }
    }

    void reconcile(true);

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void reconcile(false);
    }, TREE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [setActiveCloudContext, setCommentCounts, loadFromStoredShare, resetCloudSync, urlCloudTreeId]);

  return null;
}

function ShareLinkLoader() {
  const location = useLocation();

  useEffect(() => {
    const hash = location.hash;
    if (!hash) return;

    const loaded = useOSTStore.getState().loadFromShareLink(hash);
    if (loaded) {
      const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
      const decoded = decodeMarkdownFromUrlFragment(fragment);
      if (decoded) {
        const sourceKey = buildFragmentSourceKey(fragment);
        upsertShareSnapshot(sourceKey, 'share-fragment', {
          name: decoded.name || useOSTStore.getState().projectName,
          markdown: decoded.markdown,
          settings: decoded.settings,
          collapsedIds: decoded.collapsedIds || [],
        });
        setActiveLocalSnapshotSourceKey(sourceKey);
      }
    }

    if (loaded && typeof window !== 'undefined') {
      window.history.replaceState(null, '', location.pathname + location.search);
    }
  }, [location.hash]);

  return null;
}

const App = () => (
  <TooltipProvider>
    <CdnStats />
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <LibraryAutoSave />
      <ActiveCloudShareTracker />
      <ShareLinkLoader />
      <Suspense>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/s/:id" element={<StoredShareOpen />} />
          <Route path="/library" element={<Library />} />
          <Route path="/settings" element={<Settings />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
