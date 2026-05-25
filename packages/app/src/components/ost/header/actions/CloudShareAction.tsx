import { useEffect, useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOSTStore } from '@/store/ostStore';
import { createTree, updateTree } from '@/lib/treeApi';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  findLocalSnapshotBySource,
  getActiveLocalSnapshotSourceKey,
  updateLocalSnapshot,
} from '@/lib/localSnapshots';

function resolveCloudId(sourceKey: string | null, linkedCloudId?: string): string | null {
  if (linkedCloudId) return linkedCloudId;
  if (sourceKey?.startsWith('cloud:')) return sourceKey.slice('cloud:'.length);
  return null;
}

export function CloudShareAction() {
  const { getSharePayload } = useOSTStore();
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<'link-public' | 'restricted'>('link-public');

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data: { session } }) => {
      setLoggedIn(!!session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleCloudShare = async () => {
    const payload = getSharePayload();
    setSubmitting(true);
    try {
      const activeSourceKey = getActiveLocalSnapshotSourceKey();
      const snapshot = activeSourceKey ? findLocalSnapshotBySource(activeSourceKey) : null;
      const cloudId = resolveCloudId(activeSourceKey, snapshot?.cloudTreeId);

      if (cloudId) {
        await updateTree(cloudId, {
          markdown: payload.markdown,
          name: payload.name,
          visibility,
          settings: payload.settings,
          collapsedIds: payload.collapsedIds,
        });
        await navigator.clipboard.writeText(`${window.location.origin}/s/${cloudId}`);
        if (snapshot) {
          updateLocalSnapshot(snapshot.id, { cloudTreeId: cloudId, syncedAt: Date.now() });
        }
      } else {
        const result = await createTree({
          markdown: payload.markdown,
          name: payload.name,
          visibility,
          settings: payload.settings,
          collapsedIds: payload.collapsedIds,
        });
        await navigator.clipboard.writeText(`${window.location.origin}${result.link}`);
        if (snapshot) {
          updateLocalSnapshot(snapshot.id, { cloudTreeId: result.id, syncedAt: Date.now() });
        }
      }

      toast({ title: 'Copied', description: 'Cloud share link created and copied.' });
      setOpen(false);
    } catch (error) {
      toast({
        title: 'Cloud share failed',
        description: error instanceof Error ? error.message : 'Could not create cloud share link.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!supabaseConfigured || loading) return null;

  if (!loggedIn) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => void supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })}
      >
        <CloudUpload className="w-4 h-4" />
        <span className="hidden sm:inline">Cloud share</span>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <CloudUpload className="w-4 h-4" />
          <span className="hidden sm:inline">Cloud share</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share to cloud</DialogTitle>
          <DialogDescription>Choose who can open this link.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Who can open link</label>
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value as 'link-public' | 'restricted')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="link-public">Anyone with the link</SelectItem>
                <SelectItem value="restricted">Only invited people</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleCloudShare()} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
