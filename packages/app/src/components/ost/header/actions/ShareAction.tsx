import { useCallback, useEffect, useState } from 'react';
import { Link2, Share2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOSTStore } from '@/store/ostStore';
import {
  createTree,
  updateTree,
  getTree,
  listTreeMembers,
  addTreeMember,
  updateTreeMemberRole,
  removeTreeMember,
  type TreeMember,
  type TreeVisibility,
} from '@/lib/treeApi';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';
import { toast } from '@/components/ui/use-toast';
import { SignInButtons } from '@/components/auth/SignInButtons';
import {
  Dialog,
  DialogContent,
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.split(' ').filter(Boolean);
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : (parts[0]?.[0] ?? '?').toUpperCase();
  }
  return (email[0] ?? '?').toUpperCase();
}

export function ShareAction() {
  const { getSharePayload } = useOSTStore();
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [cloudId, setCloudId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<TreeVisibility>('restricted');
  const [members, setMembers] = useState<TreeMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'viewer' | 'editor'>('viewer');
  const [inviting, setInviting] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const refreshCloudId = useCallback(() => {
    const activeSourceKey = getActiveLocalSnapshotSourceKey();
    const snapshot = activeSourceKey ? findLocalSnapshotBySource(activeSourceKey) : null;
    return resolveCloudId(activeSourceKey, snapshot?.cloudTreeId);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = refreshCloudId();
    setCloudId(id);

    if (id) {
      setMembersLoading(true);
      Promise.all([getTree(id), listTreeMembers(id)])
        .then(([tree, { members: m }]) => {
          setVisibility(tree.visibility);
          setMembers(m);
        })
        .catch(() => {})
        .finally(() => setMembersLoading(false));
    }
  }, [open, refreshCloudId]);

  const handleCreate = async () => {
    const payload = getSharePayload();
    setCreating(true);
    try {
      const result = await createTree({
        markdown: payload.markdown,
        name: payload.name,
        visibility,
        settings: payload.settings,
        collapsedIds: payload.collapsedIds,
      });
      setCloudId(result.id);

      const activeSourceKey = getActiveLocalSnapshotSourceKey();
      const snapshot = activeSourceKey ? findLocalSnapshotBySource(activeSourceKey) : null;
      if (snapshot) {
        updateLocalSnapshot(snapshot.id, { cloudTreeId: result.id, syncedAt: Date.now() });
      }

      const { members: m } = await listTreeMembers(result.id);
      setMembers(m);
      toast({ title: 'Shared', description: 'Your tree is now shared.' });
    } catch (error) {
      toast({
        title: 'Share failed',
        description: error instanceof Error ? error.message : 'Could not create share.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleInvite = async () => {
    if (!cloudId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const { member } = await addTreeMember(cloudId, inviteEmail.trim(), inviteRole);
      setMembers((prev) => [...prev, member]);
      setInviteEmail('');
      toast({ title: 'Invited', description: `${member.email} added as ${member.role}.` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not invite.';
      toast({ title: 'Invite failed', description: msg, variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: 'viewer' | 'editor') => {
    if (!cloudId) return;
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
    );
    try {
      await updateTreeMemberRole(cloudId, memberId, newRole);
    } catch {
      const { members: m } = await listTreeMembers(cloudId);
      setMembers(m);
      toast({ title: 'Failed to update role', variant: 'destructive' });
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!cloudId) return;
    const prev = members;
    setMembers((m) => m.filter((x) => x.id !== memberId));
    try {
      await removeTreeMember(cloudId, memberId);
    } catch {
      setMembers(prev);
      toast({ title: 'Failed to remove member', variant: 'destructive' });
    }
  };

  const handleVisibilityChange = async (v: TreeVisibility) => {
    setVisibility(v);
    if (!cloudId) return;
    try {
      await updateTree(cloudId, { visibility: v });
    } catch {
      toast({ title: 'Failed to update visibility', variant: 'destructive' });
    }
  };

  const handleCopyLink = async () => {
    if (!cloudId) return;
    const payload = getSharePayload();
    try {
      await updateTree(cloudId, {
        markdown: payload.markdown,
        name: payload.name,
        visibility,
        settings: payload.settings,
        collapsedIds: payload.collapsedIds,
      });
    } catch {
      // non-fatal — link still works
    }
    await navigator.clipboard.writeText(`${window.location.origin}/s/${cloudId}`);
    toast({ title: 'Link copied', description: 'Share link copied to clipboard.' });
  };

  if (!supabaseConfigured || loading) return null;

  if (!loggedIn) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Sign in to share</DialogTitle>
          </DialogHeader>
          <SignInButtons />
        </DialogContent>
      </Dialog>
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
        </DialogHeader>

        {!cloudId ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                General access
              </label>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as TreeVisibility)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restricted">Only invited people</SelectItem>
                  <SelectItem value="domain-restricted">Organization members</SelectItem>
                  <SelectItem value="link-public">Anyone with the link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void handleCreate()} disabled={creating} className="w-full">
              {creating ? 'Sharing...' : 'Share'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Invite section */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Add people
              </label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleInvite();
                  }}
                  className="flex-1"
                />
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as 'viewer' | 'editor')}
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  onClick={() => void handleInvite()}
                  disabled={inviting || !inviteEmail.trim()}
                >
                  <UserPlus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Member list */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                People with access
              </label>
              {membersLoading ? (
                <p className="text-sm text-muted-foreground py-2">Loading...</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto overflow-x-hidden">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50 min-w-0"
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-xs">
                          {initials(m.name, m.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">
                          {m.name ?? m.email}
                          {m.pending && (
                            <span className="ml-1 text-xs text-muted-foreground">(invited)</span>
                          )}
                        </p>
                        {m.name && (
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                        )}
                      </div>
                      {m.role === 'owner' ? (
                        <span className="text-xs text-muted-foreground px-2 shrink-0">Owner</span>
                      ) : (
                        <>
                          <Select
                            value={m.role}
                            onValueChange={(v) =>
                              void handleRoleChange(m.id, v as 'viewer' | 'editor')
                            }
                          >
                            <SelectTrigger className="w-[90px] h-7 text-xs shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => void handleRemove(m.id)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* General access */}
            <div className="space-y-1 pt-2 border-t">
              <label className="text-xs font-medium text-muted-foreground">
                General access
              </label>
              <Select
                value={visibility}
                onValueChange={(v) => void handleVisibilityChange(v as TreeVisibility)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restricted">Only invited people</SelectItem>
                  <SelectItem value="domain-restricted">Organization members</SelectItem>
                  <SelectItem value="link-public">Anyone with the link</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Footer */}
            <div className="flex justify-between pt-2">
              <Button variant="outline" size="sm" onClick={() => void handleCopyLink()}>
                <Link2 className="w-4 h-4 mr-1" />
                Copy link
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
