# Use your trees with an AI assistant

Connect [tree.prodoperationscoach.com](https://tree.prodoperationscoach.com) to Claude Code, Claude Desktop, Cursor, or any other [MCP-compatible](https://modelcontextprotocol.io/) AI tool. Your agent can list your trees, read their structure, and (since `tree-mcp@0.2.x`) create, edit, and delete trees from chat.

Read-only setup takes about 3 minutes. Write access works the same way — no separate steps.

---

## 1. Get a personal access token

1. Sign in at [tree.prodoperationscoach.com](https://tree.prodoperationscoach.com).
2. Open your profile menu → **API tokens**.
3. Click **Generate new token**, give it a name (e.g. "Claude Code on my laptop"), and copy the value. It starts with `ost_pat_…` and is shown only once.

Keep it somewhere safe (1Password, a notes file you trust). If you lose it, generate a new one and revoke the old.

---

## 2. Wire it into your AI client

Pick your client. The token goes in the `OST_PAT` env var.

### Claude Code

Open `~/.claude.json` and add this entry to the top-level `mcpServers` block (alongside any existing ones):

```jsonc
"tree": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "tree-mcp@latest"],
  "env": { "OST_PAT": "ost_pat_paste_yours_here" }
}
```

Restart Claude Code. Run `/mcp` — you should see six tools: `list_trees`, `get_tree`, `get_tree_json`, `create_tree`, `update_tree`, `delete_tree`.

### Claude Desktop

Open the config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the same entry as above. Restart Claude Desktop (fully quit, then re-open). You'll see a hammer icon in the chat input when MCP tools are available — click it to see the tree tools.

### Cursor

Open Cursor settings → MCP → **Add new MCP server**. Use:

- **Name**: `tree`
- **Command**: `npx`
- **Args**: `-y tree-mcp@latest`
- **Environment**: `OST_PAT=ost_pat_paste_yours_here`

Save and reload the window.

### Other MCP clients

`tree-mcp` is a standard stdio MCP server. Any client that follows the [MCP spec](https://modelcontextprotocol.io/specification/) works. The shape is always:

- **Command**: `npx -y tree-mcp@latest`
- **Env**: `OST_PAT=<your token>`
- **Optional env**: `OST_API_BASE=<custom URL>` (defaults to `https://mozost.netlify.app`)

---

## 3. Try it

Open a chat in your client and ask:

- *"List my trees."* → calls `list_trees`.
- *"Show me the markdown for tree `<id>`."* → `get_tree`.
- *"How many opportunities are in tree `<id>`?"* → `get_tree_json` + reasoning.
- *"Create a new tree called 'Activation experiments' with one outcome about increasing trial signups."* → `create_tree`.
- *"In tree `<id>`, add an opportunity card called 'Onboarding friction' under the activation outcome."* → `update_tree`.
- *"What's been updated in tree `<id>` this week?"* → `get_tree_json` + reasoning over per-card timestamps.

---

## What the tools do

| Tool | What it does |
|---|---|
| `list_trees` | Returns all trees you own or have access to. |
| `get_tree` | Fetches one tree's raw markdown plus metadata. |
| `get_tree_json` | Parses a tree into typed cards (outcome / opportunity / solution / experiment) with parent/child links and per-card timestamps. Use for structural queries. |
| `create_tree` | Creates a new tree from markdown. Returns the new id and shareable URL. |
| `update_tree` | Replaces a tree's markdown, name, or visibility. Editor role required. |
| `delete_tree` | Permanently deletes a tree. Owner role required. Pass `confirm: true`. |

---

## Permissions and safety

- Your PAT scopes to **your account**. The MCP can only see trees you own or have been shared with.
- Write tools enforce the same roles as the web app: editor for updates, owner for deletes and visibility changes.
- PATs are stored in plaintext in the client config. Rotate at the web app if leaked. Each PAT is independently revocable.

---

## Troubleshooting

**Client shows only some of the tools, or none.**
Your `npx` cache may have an old `tree-mcp` version. Clear it:

```
rm -rf ~/.npm/_npx
```

Then restart the client. Pinning the args to `tree-mcp@latest` (as shown above) avoids this for future bumps.

**`tree-mcp: authentication failed` on every call.**
The PAT was revoked or expired. Generate a new one and update the `OST_PAT` value in the config.

**Tools appear but every call returns 403.**
You're authenticating against the right account but don't have permission on that tree. Check the share dialog in the web app.

**`npx` complains about `--ignore-scripts`.**
If you have `ignore-scripts=true` in your global `~/.npmrc`, `npx` still works for invoking the published `tree-mcp` (it doesn't run install-time lifecycle scripts). If your client still fails, try `OST_PAT=… npx -y tree-mcp@latest` from a terminal to confirm the server starts.

---

## Coming soon (in-product setup)

The web app will eventually have a "Talk to me with your AI" section that generates a ready-to-paste config snippet per client. Until then, this doc is the source of truth. Track progress at [issue #43](https://github.com/jennydove/ost-builder/issues/43).
