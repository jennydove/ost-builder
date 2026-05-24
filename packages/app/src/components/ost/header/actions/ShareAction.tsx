import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOSTStore } from '@/store/ostStore';
import { createStoredShare, updateStoredShare } from '@/lib/storedShareApi';
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

type Visibility = 'public' | 'mozilla' | 'private';

function resolveCloudId(sourceKey: string | null, linkedCloudId?: string): string | null {
  if (linkedCloudId) return linkedCloudId;
  if (sourceKey?.startsWith('cloud:')) return sourceKey.slice('cloud:'.length);
  return null;
}

export function ShareAction() {
  const { getSharePayload } = useOSTStore();
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('mozilla');

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

  const handleShare = async () => {
    const payload = getSharePayload();
    setSubmitting(true);
    try {
      const activeSourceKey = getActiveLocalSnapshotSourceKey();
      const snapshot = activeSourceKey ? findLocalSnapshotBySource(activeSourceKey) : null;
      const cloudId = resolveCloudId(activeSourceKey, snapshot?.cloudShareId);

      if (cloudId) {
        await updateStoredShare(cloudId, {
          markdown: payload.markdown,
          name: payload.name,
          visibility,
          settings: payload.settings,
          collapsedIds: payload.collapsedIds,
        });
        await navigator.clipboard.writeText(`${window.location.origin}/s/${cloudId}`);
        if (snapshot) {
          updateLocalSnapshot(snapshot.id, { cloudShareId: cloudId, syncedAt: Date.now() });
        }
      } else {
        const result = await createStoredShare({
          markdown: payload.markdown,
          name: payload.name,
          visibility,
          settings: payload.settings,
          collapsedIds: payload.collapsedIds,
        });
        await navigator.clipboard.writeText(`${window.location.origin}${result.link}`);
        if (snapshot) {
          updateLocalSnapshot(snapshot.id, { cloudShareId: result.id, syncedAt: Date.now() });
        }
      }

      toast({ title: 'Link copied', description: 'Share link copied to clipboard.' });
      setOpen(false);
    } catch (error) {
      toast({
        title: 'Share failed',
        description: error instanceof Error ? error.message : 'Could not create share link.',
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
        onClick={() =>
          void supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
          })
        }
      >
        <Share2 className="w-4 h-4" />
        <span className="hidden sm:inline">Share</span>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>Create a link to this OST.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Who can open it</label>
          <Select
            value={visibility}
            onValueChange={(value) => setVisibility(value as Visibility)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Anyone with the link</SelectItem>
              <SelectItem value="mozilla">Mozilla only</SelectItem>
              <SelectItem value="private">Only me</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleShare()} disabled={submitting}>
            {submitting ? 'Copying...' : 'Copy link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
