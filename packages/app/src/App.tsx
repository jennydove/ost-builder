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
import { updateStoredShare } from '@/lib/storedShareApi';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';
import { MOZILLA_OST_MARKDOWN, MOZILLA_OST_NAME, MOZILLA_OST_SOURCE_KEY } from '@/lib/mozillaOST';
import CdnStats from '@/components/analytics/CdnStats';
import Index from './pages/Index';
import NotFound from './pages/NotFound';

const StoredShareOpen = lazy(() => import('./pages/StoredShareOpen'));
const Library = lazy(() => import('./pages/Library'));

// Seed the Mozilla OST into the library, always keeping it current
function seedMozillaOST() {
  upsertLocalSnapshotBySource(MOZILLA_OST_SOURCE_KEY, 'manual', {
    name: MOZILLA_OST_NAME,
    markdown: MOZILLA_OST_MARKDOWN,
    collapsedIds: [],
  });
}
seedMozillaOST();

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
