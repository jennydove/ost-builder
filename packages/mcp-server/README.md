# tree-mcp

MCP (Model Context Protocol) server for [tree.prodoperationscoach.com](https://tree.prodoperationscoach.com). Exposes your tree library — Opportunity Solution Trees in the [Teresa Torres](https://www.producttalk.org/opportunity-solution-tree/) style — as natural-language tools any MCP client (Claude Code, Claude Desktop, etc.) can call.

v1 is **read-only**: list trees, fetch markdown, fetch parsed tree structure.

## Install / configure

No install needed — `npx` runs it on demand.

```jsonc
// ~/.claude.json
{
  "mcpServers": {
    "tree": {
      "command": "npx",
      "args": ["-y", "tree-mcp"],
      "env": { "OST_PAT": "ost_pat_..." }
    }
  }
}
```

Get a token at https://tree.prodoperationscoach.com under **Account → API tokens**.

If you've already run `ost-builder auth login`, you can omit the `env` block — the MCP server will pick up your CLI session from `~/.config/ost-builder/cli-session.json`.

Restart Claude Code; the three tools should appear under `/mcp`.

## Tools

| Tool | Use it for |
|---|---|
| `list_trees` | Discover tree IDs in your library. |
| `get_tree` | Fetch raw markdown for a tree by ID. |
| `get_tree_json` | Fetch a tree as a parsed structure (cards typed as outcome / opportunity / solution / experiment, with parent/child links). Use for structural reasoning. |

## Environment

| Variable | Purpose |
|---|---|
| `OST_PAT` | Personal access token (starts with `ost_pat_`). |
| `OST_API_BASE` | Override the API base URL. Defaults to `https://mozost.netlify.app`. |

## Security

PATs in `~/.claude.json` are stored in plaintext. Rotate at the web app if leaked.

## Releasing

Always run `npm run release` from this directory — never `npm publish` directly.

A global `ignore-scripts=true` in `~/.npmrc` (a common supply-chain hardening) makes
npm skip the `prepack` lifecycle hook, which silently ships a stale `dist/`. The
`release` script does an explicit `npm run build && npm publish` so the bundle is
guaranteed fresh regardless of npm config.

## Manual smoke checklist

After publishing or `npm link`:

1. Restart Claude Code; confirm six tools appear in `/mcp` — `list_trees`, `get_tree`, `get_tree_json`, `create_tree`, `update_tree`, `delete_tree`.
2. Ask: *"List my trees."* → should call `list_trees`.
3. Ask: *"Show me the markdown for tree `<id>`."* → `get_tree`.
4. Ask: *"How many opportunities are in tree `<id>`?"* → `get_tree_json` + reasoning.
5. Ask: *"Create a tree with one outcome about activation."* → `create_tree`.
6. Ask: *"Add an opportunity under that outcome."* → `update_tree`.
5. Auth failure: unset `OST_PAT`, remove the session file — server should exit with a clear stderr message.
