import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, useRef, lazy, Suspense } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useOSTStore } from '@/store/ostStore';
import { decodeMarkdownFromUrlFragment } from '@ost-builder/shared';
import {
  buildFragmentSourceKey,
  findLocalSnapshotBySource,
  getActiveLocalSnapshotSourceKey,
  setActiveLocalSnapshotSourceKey,
  upsertLocalSnapshotBySource,
  upsertDraftSnapshot,
  upsertShareSnapshot,
  updateLocalSnapshot,
} from '@/lib/localSnapshots';
import { getStoredShare, listShareComments, updateStoredShare } from '@/lib/storedShareApi';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';
import CdnStats from '@/components/analytics/CdnStats';
import Index from './pages/Index';
import NotFound from './pages/NotFound';

const StoredShareOpen = lazy(() => import('./pages/StoredShareOpen'));
const Library = lazy(() => import('./pages/Library'));


function LibraryAutoSave() {
  const markdown = useOSTStore((state) => state.markdown);
  const projectName = useOSTStore((state) => state.projectName);
  const layoutDirection = useOSTStore((state) => state.layoutDirection);
  const experimentLayout = useOSTStore((state) => state.experimentLayout);
  const viewDensity = useOSTStore((state) => state.viewDensity);
  const collapsedCardIds = useOSTStore((state) => state.collapsedCardIds);
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
      const activeSourceKey = getActiveLocalSnapshotSourceKey();
      let saved = null;
      if (activeSourceKey) {
        const existing = findLocalSnapshotBySource(activeSourceKey);
        if (existing?.sourceType) {
          saved = upsertLocalSnapshotBySource(activeSourceKey, existing.sourceType, payload);
        }
      }
      if (!saved) {
        saved = upsertDraftSnapshot(payload);
      }

      // Throttled cloud sync (5s debounce, separate timer)
      if (supabaseConfigured && sessionRef.current && saved?.cloudShareId) {
        const shareId = saved.cloudShareId;
        const snapId = saved.id;
        if (cloudTimerRef.current) window.clearTimeout(cloudTimerRef.current);
        cloudTimerRef.current = window.setTimeout(() => {
          void updateStoredShare(shareId, {
            markdown: payload.markdown,
            name: payload.name,
            settings: payload.settings,
            collapsedIds: payload.collapsedIds,
          }).then(() => {
            updateLocalSnapshot(snapId, { syncedAt: Date.now() });
          }).catch(() => {});
        }, 4000);
      }
    }, 1000);

    return () => {
      if (localTimerRef.current) window.clearTimeout(localTimerRef.current);
    };
  }, [markdown, projectName, layoutDirection, experimentLayout, viewDensity, collapsedCardIds]);

  return null;
}

function ActiveCloudShareTracker() {
  const setActiveCloudContext = useOSTStore((state) => state.setActiveCloudContext);
  const setCommentCounts = useOSTStore((state) => state.setCommentCounts);
  const loadFromStoredShare = useOSTStore((state) => state.loadFromStoredShare);
  const lastReconciledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const sourceKey = getActiveLocalSnapshotSourceKey();
    const snap = sourceKey ? findLocalSnapshotBySource(sourceKey) : null;
    let cloudShareId: string | null = snap?.cloudShareId ?? null;
    if (!cloudShareId && sourceKey?.startsWith('cloud:')) {
      cloudShareId = sourceKey.slice('cloud:'.length);
    }

    if (!cloudShareId) {
      setActiveCloudContext(null, false);
      setCommentCounts({});
      lastReconciledRef.current = null;
      return;
    }

    if (lastReconciledRef.current === cloudShareId) return;

    let cancelled = false;

    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) {
          if (!cancelled) setActiveCloudContext(cloudShareId, false);
          return;
        }
        const [payload, commentsRes] = await Promise.all([
          getStoredShare(cloudShareId!).catch(() => null),
          listShareComments(cloudShareId!).catch(() => ({ comments: [] })),
        ]);
        if (cancelled) return;

        const isOwner = payload?.role === 'owner';
        setActiveCloudContext(cloudShareId, isOwner);

        const counts: Record<string, number> = {};
        for (const c of commentsRes.comments) {
          counts[c.cardId] = (counts[c.cardId] ?? 0) + 1;
        }
        setCommentCounts(counts);

        if (payload) {
          lastReconciledRef.current = cloudShareId;
          if (payload.markdown !== useOSTStore.getState().markdown) {
            loadFromStoredShare({
              markdown: payload.markdown,
              name: payload.name ?? undefined,
              settings: payload.settings,
              collapsedIds: payload.collapsedIds,
            });
            const liveSourceKey = getActiveLocalSnapshotSourceKey();
            const liveSnap = liveSourceKey ? findLocalSnapshotBySource(liveSourceKey) : null;
            if (liveSnap) {
              updateLocalSnapshot(liveSnap.id, {
                markdown: payload.markdown,
                name: payload.name ?? liveSnap.name,
                settings: payload.settings ?? liveSnap.settings,
                collapsedIds: payload.collapsedIds ?? liveSnap.collapsedIds ?? [],
                syncedAt: Date.now(),
              });
            }
          }
        }
      } catch {
        // best-effort
      }
    })();

    return () => { cancelled = true; };
  }, [setActiveCloudContext, setCommentCounts, loadFromStoredShare]);

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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
