import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Plus, Trash2, ArrowLeft, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';
import { SignInButtons } from '@/components/auth/SignInButtons';
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

// Pre-fill the snippet with the freshly-created token if we have one.
// Otherwise show a placeholder so the user still sees the shape.
const PAT_PLACEHOLDER = 'ost_pat_paste_yours_here';

function claudeCodeSnippet(pat: string): string {
  return `"tree": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "tree-mcp@latest"],
  "env": { "OST_PAT": "${pat}" }
}`;
}

function claudeDesktopSnippet(pat: string): string {
  // Same shape as Claude Code; different config file path.
  return claudeCodeSnippet(pat);
}

function cursorSnippet(pat: string): string {
  return `Name: tree
Command: npx
Args: -y tree-mcp@latest
Env: OST_PAT=${pat}`;
}

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<CliToken[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
        body: JSON.stringify({ label: newLabel || 'AI client' }),
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

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
  };

  const tokenForSnippet = useMemo(() => newToken ?? PAT_PLACEHOLDER, [newToken]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-xs space-y-4 text-center">
          <p className="text-muted-foreground">Sign in to set up AI access.</p>
          {supabaseConfigured && (
            <SignInButtons redirectTo={`${window.location.origin}/settings`} />
          )}
          <Button variant="ghost" onClick={() => navigate('/')}>Back to app</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Talk to me with your AI
          </h1>
        </div>

        <p className="text-sm text-muted-foreground">
          Connect your tree library to Claude Code, Claude Desktop, Cursor, or any other{' '}
          <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer" className="underline">MCP-compatible</a>{' '}
          AI tool. Your agent can list, read, and edit trees from chat.
        </p>

        {/* Step 1: Generate a token */}
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-medium">1. Generate a token</h2>
            <p className="text-sm text-muted-foreground mt-1">
              One per device or AI client. You can revoke any token independently.
            </p>
          </div>

          {newToken ? (
            <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4 space-y-2">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Token created. Copy it now — it won't be shown again.
              </p>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">{newToken}</code>
                <Button size="sm" variant="outline" onClick={() => void handleCopy('newToken', newToken)}>
                  {copiedKey === 'newToken' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The snippet below is already pre-filled with this token.
              </p>
              <Button size="sm" variant="ghost" onClick={() => setNewToken(null)}>Dismiss</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="token-label" className="text-xs">Label</Label>
                <Input
                  id="token-label"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="e.g. Claude Code on my laptop"
                  className="h-8 text-sm"
                  onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
                />
              </div>
              <Button size="sm" className="mt-5 gap-1" onClick={() => void handleCreate()} disabled={creating}>
                <Plus className="w-3 h-3" />
                Generate
              </Button>
            </div>
          )}
        </section>

        {/* Step 2: Wire it up */}
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-medium">2. Wire it into your AI client</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pick your client and copy the snippet. {newToken ? 'Your new token is pre-filled below.' : 'Generate a token above to pre-fill it.'}
            </p>
          </div>

          <Tabs defaultValue="claude-code" className="w-full">
            <TabsList>
              <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
              <TabsTrigger value="claude-desktop">Claude Desktop</TabsTrigger>
              <TabsTrigger value="cursor">Cursor</TabsTrigger>
              <TabsTrigger value="other">Other</TabsTrigger>
            </TabsList>

            <TabsContent value="claude-code" className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Open <code className="bg-muted px-1 py-0.5 rounded">~/.claude.json</code> and add this entry to the top-level <code className="bg-muted px-1 py-0.5 rounded">mcpServers</code> block:
              </p>
              <SnippetBlock
                snippet={claudeCodeSnippet(tokenForSnippet)}
                copyKey="claude-code"
                copiedKey={copiedKey}
                onCopy={handleCopy}
              />
              <p className="text-xs text-muted-foreground">
                Then restart Claude Code. Run <code className="bg-muted px-1 py-0.5 rounded">/mcp</code> — you should see six tools.
              </p>
            </TabsContent>

            <TabsContent value="claude-desktop" className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Open the config file:
              </p>
              <ul className="text-xs text-muted-foreground list-disc ml-5 space-y-1">
                <li><strong>macOS:</strong> <code className="bg-muted px-1 py-0.5 rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
                <li><strong>Windows:</strong> <code className="bg-muted px-1 py-0.5 rounded">%APPDATA%\Claude\claude_desktop_config.json</code></li>
              </ul>
              <p className="text-xs text-muted-foreground">
                Add this entry inside <code className="bg-muted px-1 py-0.5 rounded">mcpServers</code>:
              </p>
              <SnippetBlock
                snippet={claudeDesktopSnippet(tokenForSnippet)}
                copyKey="claude-desktop"
                copiedKey={copiedKey}
                onCopy={handleCopy}
              />
              <p className="text-xs text-muted-foreground">
                Fully quit and re-open Claude Desktop. Look for the hammer icon in the chat input — the tree tools live there.
              </p>
            </TabsContent>

            <TabsContent value="cursor" className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Open Cursor settings → MCP → <strong>Add new MCP server</strong>. Use:
              </p>
              <SnippetBlock
                snippet={cursorSnippet(tokenForSnippet)}
                copyKey="cursor"
                copiedKey={copiedKey}
                onCopy={handleCopy}
              />
              <p className="text-xs text-muted-foreground">
                Save and reload the window.
              </p>
            </TabsContent>

            <TabsContent value="other" className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Any MCP-compatible client works. The shape is always:
              </p>
              <ul className="text-xs text-muted-foreground list-disc ml-5 space-y-1">
                <li><strong>Command:</strong> <code className="bg-muted px-1 py-0.5 rounded">npx -y tree-mcp@latest</code></li>
                <li><strong>Env:</strong> <code className="bg-muted px-1 py-0.5 rounded">OST_PAT={tokenForSnippet}</code></li>
                <li>Optional: <code className="bg-muted px-1 py-0.5 rounded">OST_API_BASE</code> to override the default API URL.</li>
              </ul>
            </TabsContent>
          </Tabs>
        </section>

        {/* Step 3: Try it */}
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-medium">3. Try it</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Open a chat in your client and ask:
            </p>
          </div>
          <ul className="text-sm space-y-1 list-disc ml-5 text-muted-foreground">
            <li><em>"List my trees."</em></li>
            <li><em>"Summarize tree &lt;id&gt;."</em></li>
            <li><em>"In tree &lt;id&gt;, add an opportunity called 'Onboarding friction' under the activation outcome."</em></li>
            <li><em>"What's been updated in tree &lt;id&gt; this week?"</em></li>
          </ul>
        </section>

        {/* Existing tokens */}
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-medium">Your tokens</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Each token has full access to your account. Revoke any you no longer need.
            </p>
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

function SnippetBlock({
  snippet,
  copyKey,
  copiedKey,
  onCopy,
}: {
  snippet: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  return (
    <div className="relative">
      <pre className="text-xs bg-muted p-3 rounded font-mono overflow-x-auto whitespace-pre">
        {snippet}
      </pre>
      <Button
        size="sm"
        variant="outline"
        className="absolute top-2 right-2 h-7"
        onClick={() => onCopy(copyKey, snippet)}
      >
        {copiedKey === copyKey ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
        {copiedKey === copyKey ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
