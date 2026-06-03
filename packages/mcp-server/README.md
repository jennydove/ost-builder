# ost-builder-mcp

MCP (Model Context Protocol) server for [OST Builder](https://mozost.netlify.app). Exposes your Opportunity Solution Tree library as natural-language tools that any MCP client (Claude Code, Claude Desktop, etc.) can call.

v1 is **read-only**: list trees, fetch markdown, fetch parsed tree structure.

## Install / configure

No install needed — `npx` runs it on demand.

```jsonc
// ~/.claude.json
{
  "mcpServers": {
    "ost-builder": {
      "command": "npx",
      "args": ["-y", "ost-builder-mcp"],
      "env": { "OST_PAT": "ost_pat_..." }
    }
  }
}
```

Get a token at https://mozost.netlify.app under **Account → API tokens**.

If you've already run `ost-builder auth login`, you can omit the `env` block — the MCP server will pick up your CLI session from `~/.config/ost-builder/cli-session.json`.

Restart Claude Code; the three tools should appear under `/mcp`.

## Tools

| Tool | Use it for |
|---|---|
| `list_trees` | Discover tree IDs in your library. |
| `get_tree` | Fetch raw markdown for a tree by ID. |
| `get_tree_json` | Fetch a tree as a parsed `OSTTree` (cards typed as outcome / opportunity / solution / experiment, with parent/child links). Use for structural reasoning. |

## Environment

| Variable | Purpose |
|---|---|
| `OST_PAT` | Personal access token (starts with `ost_pat_`). |
| `OST_API_BASE` | Override the API base URL. Defaults to `https://mozost.netlify.app`. |

## Security

PATs in `~/.claude.json` are stored in plaintext. Rotate at the web app if leaked.

## Manual smoke checklist

After publishing or `npm link`:

1. Restart Claude Code; confirm three tools appear in `/mcp`.
2. Ask: *"List my OST trees."* → should call `list_trees`.
3. Ask: *"Show me the markdown for tree `<id>`."* → `get_tree`.
4. Ask: *"How many opportunities are in tree `<id>`?"* → `get_tree_json` + reasoning.
5. Auth failure: unset `OST_PAT`, remove the session file — server should exit with a clear stderr message.
