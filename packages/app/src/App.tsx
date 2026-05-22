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
  const timerRef = useRef<number | null>(null);
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
    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      const payload = {
        name: projectName,
        markdown,
        settings: { layoutDirection, experimentLayout, viewDensity },
        collapsedIds: collapsedCardIds,
      };

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

      // Auto-sync to cloud if this snapshot is linked to a cloud share
      if (supabaseConfigured && sessionRef.current && saved?.cloudShareId) {
        void updateStoredShare(saved.cloudShareId, {
          markdown: payload.markdown,
          name: payload.name,
          settings: payload.settings,
          collapsedIds: payload.collapsedIds,
        }).then(() => {
          if (saved) updateLocalSnapshot(saved.id, { syncedAt: Date.now() });
        }).catch(() => {
          // Best-effort; local is already saved
        });
      }
    }, 1000);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [markdown, projectName, layoutDirection, experimentLayout, viewDensity, collapsedCardIds]);

  return null;
}

function ActiveCloudShareTracker() {
  const markdown = useOSTStore((state) => state.markdown);
  const projectName = useOSTStore((state) => state.projectName);
  const setActiveCloudContext = useOSTStore((state) => state.setActiveCloudContext);
  const setCommentCounts = useOSTStore((state) => state.setCommentCounts);

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
      return;
    }

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
      } catch {
        // best-effort
      }
    })();

    return () => { cancelled = true; };
  }, [markdown, projectName, setActiveCloudContext, setCommentCounts]);

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
