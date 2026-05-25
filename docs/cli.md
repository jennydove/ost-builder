# OST Builder CLI

Parse, share, and manage Opportunity Solution Trees from the command line.

## Install

```bash
npm install -g ost-builder
```

## Authentication

Generate a Personal Access Token (PAT) in the web app under **Account > API tokens**, then:

```bash
ost-builder auth login ost_pat_abc123...
ost-builder auth status
ost-builder auth logout
```

Tokens are stored in `~/.config/ost-builder/cli-session.json`.

## Commands

### Local file operations

```bash
# Parse and open in browser
ost-builder my-tree.md

# Generate a shareable link (client-side, no cloud)
ost-builder my-tree.md --share

# Output as JSON
ost-builder my-tree.md --format json --pretty

# Override tree name
ost-builder my-tree.md --name "Q3 Discovery"
```

### Cloud library (requires auth)

```bash
# List your trees
ost-builder library list

# Upload a markdown file
ost-builder library upload my-tree.md --name "Q3 Discovery"

# Download a tree by ID
ost-builder library download <id> --output downloaded.md
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `OST_API_BASE` | Override API base URL (default: `https://mozost.netlify.app`) |
| `XDG_CONFIG_HOME` | Override config directory (default: `~/.config`) |

## Agent usage

The CLI is designed for AI agent workflows. Example with Claude:

```
Read the OST in strategy.md and suggest three new opportunities under the
first outcome. Write the updated tree back to strategy.md.
```

The agent can:
1. `ost-builder strategy.md --format json --pretty` to read the tree
2. Modify the JSON or markdown
3. `ost-builder library upload strategy.md` to push to cloud
