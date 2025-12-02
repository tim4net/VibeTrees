# MCP Integration

VibeTrees auto-discovers MCP servers and configures them for each worktree.

## What happens on worktree creation

1. Scans for MCP servers (local → npm deps → global)
2. Generates `.claude/settings.json` with server configs
3. Injects environment variables (database URLs, ports)
4. Adds `vibe-bridge` for cross-worktree access

## Installing MCP servers

```bash
# Project-local (recommended)
npm install --save-dev @modelcontextprotocol/server-filesystem

# Or global
npm install -g @modelcontextprotocol/server-git

# Or custom local server
mkdir -p mcp-servers/my-server && touch mcp-servers/my-server/index.js
```

## Discovery order

1. `./mcp-servers/` - local custom servers
2. `package.json` dependencies - `@modelcontextprotocol/server-*`
3. Global npm packages

## Vibe Bridge

Cross-worktree communication server. Lets agents in one worktree access files and git status from other worktrees.

Tools provided:
- `list_worktrees`
- `read_file_from_worktree`
- `get_worktree_git_status`
- `search_across_worktrees`

## Environment injection

MCP configs get worktree-specific env vars:
- `POSTGRES_PORT`, `API_PORT`, etc. from port registry
- `DATABASE_URL` pointing to worktree's database
- `WORKTREE_PATH` for file operations
