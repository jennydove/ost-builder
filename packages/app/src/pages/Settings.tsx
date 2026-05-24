import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Plus, Trash2, ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';
import { toast } from '@/components/ui/use-toast';
import type { User } from '@supabase/supabase-js';

type CliToken = {
  id: string;
  label: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

async function fetchWithAuth<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json as T;
}

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<CliToken[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return; }
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    void fetchWithAuth<{ tokens: CliToken[] }>('/api/cli/tokens')
      .then(res => setTokens(res.tokens))
      .catch(() => {});
  }, [user]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetchWithAuth<{ token: string; label: string }>('/api/cli/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel || 'CLI token' }),
      });
      setNewToken(res.token);
      setNewLabel('');
      const updated = await fetchWithAuth<{ tokens: CliToken[] }>('/api/cli/tokens');
      setTokens(updated.tokens);
    } catch (err) {
      toast({ title: 'Failed to create token', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setTokens(prev => prev.filter(t => t.id !== id));
    try {
      await fetchWithAuth<void>(`/api/cli/tokens/${id}`, { method: 'DELETE' });
    } catch {
      toast({ title: 'Failed to revoke token', variant: 'destructive' });
      const updated = await fetchWithAuth<{ tokens: CliToken[] }>('/api/cli/tokens');
      setTokens(updated.tokens);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return null;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Sign in to manage tokens.</p>
          <Button onClick={() => navigate('/')}>Back to app</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Personal Access Tokens</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Use tokens to authenticate the OST Builder CLI. Tokens have full access to your account.
            </p>
          </div>

          {newToken && (
            <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4 space-y-2">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Token created. Copy it now — it won't be shown again.
              </p>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">{newToken}</code>
                <Button size="sm" variant="outline" onClick={() => void handleCopy(newToken)}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Run: <code className="bg-muted px-1 rounded">ost-builder auth login {newToken.slice(0, 16)}...</code>
              </p>
              <Button size="sm" variant="ghost" onClick={() => setNewToken(null)}>Dismiss</Button>
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="token-label" className="text-xs">Label</Label>
              <Input
                id="token-label"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. laptop, CI pipeline"
                className="h-8 text-sm"
                onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
              />
            </div>
            <Button size="sm" className="mt-5 gap-1" onClick={() => void handleCreate()} disabled={creating}>
              <Plus className="w-3 h-3" />
              Generate
            </Button>
          </div>

          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No tokens yet.</p>
          ) : (
            <div className="border rounded-md divide-y">
              {tokens.map(t => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{t.label || 'Unnamed token'}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(t.createdAt).toLocaleDateString()}
                      {t.lastUsedAt && ` · Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void handleDelete(t.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
