import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { encodeMarkdownToUrlFragment } from '@ost-builder/shared';
import {
  ArrowLeft,
  Cloud,
  Copy,
  Edit3,
  FileDown,
  Library as LibraryIcon,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  deleteStoredShare,
  getStoredShare,
  listStoredShares,
} from '@/lib/storedShareApi';
import {
  clearActiveLocalSnapshotSourceKey,
  deleteLocalSnapshot,
  findLocalSnapshotBySource,
  getActiveLocalSnapshotSourceKey,
  listLocalSnapshots,
  saveLocalSnapshot,
  setActiveLocalSnapshotSourceKey,
  updateLocalSnapshot,
  upsertShareSnapshot,
  type LocalSnapshot,
} from '@/lib/localSnapshots';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';
import { toast } from '@/components/ui/use-toast';
import { useOSTStore } from '@/store/ostStore';

const DEFAULT_PROJECT_NAME = 'My Opportunity Solution Tree';

function localSourceLabel(sourceType?: LocalSnapshot['sourceType'], isActive?: boolean): string {
  if (isActive) return 'active';
  if (sourceType === 'share-cloud') return 'cloud';
  if (sourceType === 'share-fragment') return 'from link';
  return 'local';
}

function sourceBadgeClass(isActive?: boolean): string | undefined {
  if (isActive) {
    return 'bg-emerald-500/15 text-emerald-700 border-emerald-400/50 motion-safe:animate-pulse';
  }
  return undefined;
}

function applyProjectNameToMarkdown(markdown: string, name: string): string {
  const safeName = name.trim() || DEFAULT_PROJECT_NAME;
  const lines = markdown.split('\n');
  if (lines[0]?.startsWith('# ')) {
    lines[0] = `# ${safeName}`;
    return lines.join('\n');
  }
  return [`# ${safeName}`, '', markdown].join('\n').trimStart();
}

function extractProjectNameFromMarkdown(markdown: string): string {
  const firstLine = markdown.split('\n')[0]?.trim() || '';
  if (firstLine.startsWith('# ')) {
    const name = firstLine.slice(2).trim();
    return name || DEFAULT_PROJECT_NAME;
  }
  return DEFAULT_PROJECT_NAME;
}

function getCloudId(item: LocalSnapshot): string | null {
  if (item.cloudShareId) return item.cloudShareId;
  if (item.sourceType === 'share-cloud' && item.sourceKey?.startsWith('cloud:')) {
    return item.sourceKey.slice('cloud:'.length);
  }
  return null;
}

function EditInBuilderIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 4.75a3.25 3.25 0 1 1 6.5 0 3.25 3.25 0 0 1-6.5 0ZM2.5 19.25a3.25 3.25 0 1 1 6.5 0 3.25 3.25 0 0 1-6.5 0Zm0-14.5a3.25 3.25 0 1 1 6.5 0 3.25 3.25 0 0 1-6.5 0ZM5.75 6.5a1.75 1.75 0 1 0-.001-3.501A1.75 1.75 0 0 0 5.75 6.5Zm0 14.5a1.75 1.75 0 1 0-.001-3.501A1.75 1.75 0 0 0 5.75 21Zm12.5-14.5a1.75 1.75 0 1 0-.001-3.501A1.75 1.75 0 0 0 18.25 6.5Z"></path>
      <path d="M5.75 16.75A.75.75 0 0 1 5 16V8a.75.75 0 0 1 1.5 0v8a.75.75 0 0 1-.75.75Z"></path>
      <path d="M17.5 8.75v-1H19v1a3.75 3.75 0 0 1-3.75 3.75h-7a1.75 1.75 0 0 0-1.75 1.75H5A3.25 3.25 0 0 1 8.25 11h7a2.25 2.25 0 0 0 2.25-2.25Z"></path>
    </svg>
  );
}

export default function Library() {
  const navigate = useNavigate();
  const { loadFromStoredShare, setProjectName } = useOSTStore();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LocalSnapshot[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');
  const [pendingLoadItem, setPendingLoadItem] = useState<LocalSnapshot | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<LocalSnapshot | null>(null);
  const [activeSourceKey, setActiveSourceKey] = useState<string | null>(null);
  const [cloudUser, setCloudUser] = useState<User | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const localItems = listLocalSnapshots();
      setActiveSourceKey(getActiveLocalSnapshotSourceKey());

      if (!supabaseConfigured) {
        setItems(localItems);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      setCloudUser(session?.user ?? null);

      if (!session) {
        setItems(localItems);
        return;
      }

      // Fetch user's cloud shares
      let cloudItems: Awaited<ReturnType<typeof listStoredShares>>['items'] = [];
      try {
        const result = await listStoredShares(1, 50);
        cloudItems = result.items;
      } catch {
        setItems(localItems);
        return;
      }

      // Find cloud items not yet in local library
      const localCloudIds = new Set(
        localItems.map((item) => getCloudId(item)).filter((id): id is string => !!id),
      );
      const cloudOnlyItems = cloudItems.filter((c) => !localCloudIds.has(c.id));

      // Fetch full payloads for cloud-only items and create local snapshots
      await Promise.all(
        cloudOnlyItems.map(async (cloudItem) => {
          try {
            const payload = await getStoredShare(cloudItem.id);
            upsertShareSnapshot(`cloud:${cloudItem.id}`, 'share-cloud', {
              name: payload.name ?? cloudItem.name ?? 'Untitled',
              markdown: payload.markdown,
              settings: payload.settings ?? undefined,
              collapsedIds: payload.collapsedIds ?? [],
            });
            const snap = findLocalSnapshotBySource(`cloud:${cloudItem.id}`);
            if (snap) updateLocalSnapshot(snap.id, { cloudShareId: cloudItem.id });
          } catch {
            // Skip items we can't fetch
          }
        }),
      );

      // Re-read local items (now includes newly created cloud snapshots)
      setItems(listLocalSnapshots());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCopy = async (text: string, description: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description });
  };

  const copyLocalShareLink = async (item: LocalSnapshot) => {
    const fragment = encodeMarkdownToUrlFragment(
      item.markdown,
      item.name,
      item.settings,
      item.collapsedIds || [],
    );
    const link = `${window.location.origin}/#${fragment}`;
    await handleCopy(link, 'Share link copied.');
  };

  const openLocalSnapshot = async (item: LocalSnapshot) => {
    const sourceKey = item.sourceKey || `item:${item.id}`;
    if (!item.sourceKey) {
      updateLocalSnapshot(item.id, { sourceKey, sourceType: item.sourceType || 'manual' });
    }
    setActiveLocalSnapshotSourceKey(sourceKey);
    setActiveSourceKey(sourceKey);

    let payload: {
      markdown: string;
      name?: string;
      settings?: typeof item.settings;
      collapsedIds?: string[];
    } = {
      markdown: item.markdown,
      name: item.name,
      settings: item.settings,
      collapsedIds: item.collapsedIds || [],
    };

    const cloudId = getCloudId(item);
    if (cloudId && cloudUser) {
      try {
        const cloud = await getStoredShare(cloudId);
        payload = {
          markdown: cloud.markdown,
          name: cloud.name ?? item.name,
          settings: cloud.settings ?? item.settings,
          collapsedIds: cloud.collapsedIds ?? item.collapsedIds ?? [],
        };
        updateLocalSnapshot(item.id, {
          markdown: payload.markdown,
          name: payload.name ?? item.name,
          settings: payload.settings,
          collapsedIds: payload.collapsedIds ?? [],
          syncedAt: Date.now(),
        });
      } catch {
        // Fall back to local copy if cloud fetch fails
      }
    }

    loadFromStoredShare(payload);
    navigate('/');
  };

  const removeItem = async (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;

    if (item.sourceKey) {
      const active = getActiveLocalSnapshotSourceKey();
      if (active === item.sourceKey) clearActiveLocalSnapshotSourceKey();
    }

    deleteLocalSnapshot(id);

    const cloudId = getCloudId(item);
    if (cloudId && cloudUser) {
      try {
        await deleteStoredShare(cloudId);
      } catch {
        // Local deleted; cloud delete best-effort
      }
    }

    void load();
    toast({ title: 'Deleted', description: 'OST deleted.' });
  };

  const beginRenameLocal = (item: LocalSnapshot) => {
    setEditingId(item.id);
    setNameDraft(item.name || '');
  };

  const saveLocalRename = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;

    const nextName = nameDraft.trim() || DEFAULT_PROJECT_NAME;
    const nextMarkdown = applyProjectNameToMarkdown(item.markdown, nextName);
    updateLocalSnapshot(id, { name: nextName, markdown: nextMarkdown });

    if (item.sourceKey && item.sourceKey === activeSourceKey) {
      setProjectName(nextName);
    }

    setEditingId(null);
    setNameDraft('');
    void load();
    toast({ title: 'Saved', description: 'OST renamed.' });
  };

  const beginEditContent = (item: LocalSnapshot) => {
    setEditingContentId(item.id);
    setContentDraft(item.markdown);
  };

  const saveContent = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;

    const nextMarkdown = contentDraft;
    const nextName = extractProjectNameFromMarkdown(nextMarkdown);
    updateLocalSnapshot(id, { markdown: nextMarkdown, name: nextName });

    if (item.sourceKey && item.sourceKey === activeSourceKey) {
      loadFromStoredShare({
        markdown: nextMarkdown,
        name: nextName,
        settings: item.settings,
        collapsedIds: item.collapsedIds || [],
      });
    }

    setEditingContentId(null);
    setContentDraft('');
    void load();
    toast({ title: 'Saved', description: 'Content updated.' });
  };

  const downloadAsMarkdown = (item: LocalSnapshot) => {
    const safeName = (item.name || 'ost')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = `${safeName || 'ost'}.md`;
    const blob = new Blob([item.markdown], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
    toast({ title: 'Downloaded', description: `${filename} downloaded.` });
  };

  const duplicateItem = (item: LocalSnapshot) => {
    const duplicatedName = `${(item.name || DEFAULT_PROJECT_NAME).trim()} (copy)`;
    const duplicatedMarkdown = applyProjectNameToMarkdown(item.markdown, duplicatedName);
    saveLocalSnapshot({
      name: duplicatedName,
      markdown: duplicatedMarkdown,
      settings: item.settings,
      collapsedIds: item.collapsedIds || [],
    });
    void load();
    toast({ title: 'Duplicated', description: 'A copy was added to your library.' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto text-sm text-muted-foreground">Loading Library...</div>
      </div>
    );
  }

  const displayName =
    cloudUser?.user_metadata?.full_name as string | undefined ||
    cloudUser?.email ||
    'you';

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <LibraryIcon className="w-6 h-6" />
              Your OST Library
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {cloudUser
                ? `Signed in as ${displayName} · edits auto-save to cloud`
                : 'Auto-saved locally. Sign in to sync to cloud.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {cloudUser && (
              <div className="flex items-center gap-1 text-xs text-emerald-600">
                <Cloud className="w-3 h-3" />
                Cloud
              </div>
            )}
            <Button variant="outline" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to builder
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
            No OSTs yet. Start editing and your work will be auto-saved here.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const isActiveItem = !!item.sourceKey && item.sourceKey === activeSourceKey;
              const cloudId = getCloudId(item);
              return (
                <div
                  key={item.id}
                  className="rounded-md border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{item.name}</div>
                      <Badge variant="outline" className={sourceBadgeClass(isActiveItem)}>
                        {localSourceLabel(item.sourceType, isActiveItem)}
                      </Badge>
                      {cloudId && (
                        <Badge variant="outline" className="bg-sky-500/10 text-sky-700 border-sky-400/40">
                          <Cloud className="w-3 h-3 mr-1" />
                          synced
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => beginRenameLocal(item)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Rename
                      </Button>
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        variant="destructive"
                        title="Delete"
                        onClick={() => setPendingDeleteItem(item)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Updated: {new Date(item.updatedAt).toLocaleString()}
                  </div>

                  {editingId === item.id ? (
                    <div className="flex gap-2">
                      <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
                      <Button size="sm" onClick={() => saveLocalRename(item.id)}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : editingContentId === item.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={contentDraft}
                        onChange={(e) => setContentDraft(e.target.value)}
                        className="font-mono min-h-48"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveContent(item.id)}>
                          Save content
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingContentId(null);
                            setContentDraft('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (isActiveItem) {
                            void openLocalSnapshot(item);
                            return;
                          }
                          setPendingLoadItem(item);
                        }}
                      >
                        <EditInBuilderIcon className="w-4 h-4 mr-2" />
                        {isActiveItem ? 'Edit in builder' : 'Load in builder'}
                      </Button>
                      {isActiveItem ? (
                        <Button size="sm" variant="outline" onClick={() => beginEditContent(item)}>
                          <Edit3 className="w-4 h-4 mr-2" />
                          Edit Markdown
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleCopy(item.markdown, 'Markdown copied.')}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy markdown
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => downloadAsMarkdown(item)}>
                        <FileDown className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => duplicateItem(item)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void copyLocalShareLink(item)}
                      >
                        <Share2 className="w-4 h-4 mr-2" />
                        Share link
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog
        open={!!pendingLoadItem}
        onOpenChange={(open) => !open && setPendingLoadItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Load in builder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current builder view with "
              {pendingLoadItem?.name || 'this item'}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingLoadItem) void openLocalSnapshot(pendingLoadItem);
                setPendingLoadItem(null);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingDeleteItem}
        onOpenChange={(open) => !open && setPendingDeleteItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete OST?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteItem && getCloudId(pendingDeleteItem) && cloudUser
                ? `"${pendingDeleteItem.name || 'This OST'}" will be permanently deleted from your library and the cloud.`
                : `"${pendingDeleteItem?.name || 'This OST'}" will be removed from your local library.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteItem) void removeItem(pendingDeleteItem.id);
                setPendingDeleteItem(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
