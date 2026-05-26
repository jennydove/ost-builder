import { useEffect, useState, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useOSTStore } from '@/store/ostStore';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';
import {
  listTreeComments,
  postTreeComment,
  updateTreeComment,
  deleteTreeComment,
  type TreeComment,
} from '@/lib/treeApi';
import { toast } from '@/components/ui/use-toast';
import { SignInButtons } from '@/components/auth/SignInButtons';

type Props = {
  cardId: string;
};

function formatRelative(ms: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function CommentsSection({ cardId }: Props) {
  const shareId = useOSTStore((state) => state.activeTreeId);
  const isOwner = useOSTStore((state) => state.activeIsOwner);
  const incrementCount = useOSTStore((state) => state.incrementCommentCount);
  const decrementCount = useOSTStore((state) => state.decrementCommentCount);

  const [comments, setComments] = useState<TreeComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const cardIdRef = useRef(cardId);
  cardIdRef.current = cardId;

  useEffect(() => {
    if (!supabaseConfigured) return;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!shareId || !cardId) {
      setComments([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const fetchComments = async () => {
      try {
        const res = await listTreeComments(shareId, cardId);
        if (cancelled || cardIdRef.current !== cardId) return;
        setComments(res.comments);
      } catch {
        // best-effort; keep existing list on transient errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchComments();

    // Poll for new comments while the panel is open and the tab is visible.
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchComments();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [shareId, cardId]);

  if (!shareId) return null;

  const handlePost = async () => {
    const body = draft.trim();
    if (!body || submitting || !shareId) return;
    setSubmitting(true);
    try {
      const { comment } = await postTreeComment(shareId, cardId, body);
      setComments((prev) => [...prev, comment]);
      setDraft('');
      incrementCount(cardId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      toast({ title: 'Could not post comment', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!shareId) return;
    const removed = comments.find((c) => c.id === commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    decrementCount(cardId);
    try {
      await deleteTreeComment(shareId, commentId);
    } catch {
      if (removed) {
        setComments((prev) => [...prev, removed].sort((a, b) => a.createdAt - b.createdAt));
        incrementCount(cardId);
      }
      toast({ title: 'Could not delete comment', variant: 'destructive' });
    }
  };

  const handleEdit = async (commentId: string) => {
    const body = editDraft.trim();
    if (!body || !shareId) return;
    const original = comments.find((c) => c.id === commentId);
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, body } : c)));
    setEditingId(null);
    try {
      await updateTreeComment(shareId, commentId, body);
    } catch {
      if (original) setComments((prev) => prev.map((c) => (c.id === commentId ? original : c)));
      toast({ title: 'Could not update comment', variant: 'destructive' });
    }
  };

  const signInRedirect = window.location.origin + window.location.pathname;

  return (
    <div className="space-y-3 pt-4 border-t border-border">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Comments</h4>
        {comments.length > 0 && (
          <span className="text-xs text-muted-foreground">{comments.length}</span>
        )}
      </div>

      {loading && comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {comments.map((c) => {
            const canDelete = user?.id === c.userId || isOwner;
            const canEdit = user?.id === c.userId;
            const isEditingThis = editingId === c.id;
            return (
              <div key={c.id} className="flex gap-2 group">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                  {initials(c.authorName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium truncate">
                        {c.authorName || 'Unknown'}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatRelative(c.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {canEdit && !isEditingThis && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100"
                          onClick={() => { setEditingId(c.id); setEditDraft(c.body); }}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                      {canDelete && !isEditingThis && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100"
                          onClick={() => void handleDelete(c.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {isEditingThis ? (
                    <div className="mt-1 space-y-1">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        className="text-xs resize-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            void handleEdit(c.id);
                          }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                      />
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                        <Button size="sm" className="h-6 text-xs" onClick={() => void handleEdit(c.id)} disabled={!editDraft.trim()}>
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {user ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a comment…"
            rows={3}
            className="text-xs resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handlePost();
              }
            }}
          />
          <Button
            size="sm"
            className="w-full"
            onClick={() => void handlePost()}
            disabled={submitting || !draft.trim()}
          >
            {submitting ? 'Posting…' : 'Post comment'}
          </Button>
        </div>
      ) : (
        <div className="rounded-md bg-muted/50 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Sign in to comment.</p>
          <SignInButtons redirectTo={signInRedirect} size="sm" />
        </div>
      )}
    </div>
  );
}
