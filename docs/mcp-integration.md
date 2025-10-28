# MCP Integration Guide

**Model Context Protocol (MCP) Server Management in Vibe Worktrees**

Vibe Worktrees provides automatic MCP server discovery, configuration, and cross-worktree communication for AI agents (Claude Code, Codex, Gemini).

---

## Overview

### What is MCP?

Model Context Protocol (MCP) is a standardized way for AI agents to access external tools and data. MCP servers provide capabilities like:
- Reading/writing files
- Querying databases
- Git operations
- GitHub API access
- Custom integrations

### How Vibe Integrates MCP

Vibe automatically:
1. **Discovers** MCP servers in your project (npm packages, local servers, global installs)
2. **Configures** each worktree with `.claude/settings.json` containing MCP server connections
3. **Provides** a bridge server for cross-worktree communication (agents can access other worktrees)

---

## Quick Start

### 1. Install MCP Servers

**Option A: Project-local (recommended)**
```bash
npm install --save-dev @modelcontextprotocol/server-filesystem @modelcontextprotocol/server-git
```

**Option B: Global**
```bash
npm install -g @modelcontextprotocol/server-filesystem @modelcontextprotocol/server-git
```

**Option C: Local custom servers**
Create `mcp-servers/my-server/index.js` in your project root.

### 2. Create a Worktree

When you create a worktree, Vibe automatically:
- Detects all installed MCP servers
- Generates `.claude/settings.json` in the worktree
- Configures environment variables (e.g., database URLs)
- Adds the `vibe-bridge` server for cross-worktree access

### 3. Use MCP Tools in Claude

Open Claude Code in the worktree terminal. MCP tools are automatically available:

```bash
# Claude can now:
# - Read/write files via filesystem server
# - Query git history via git server
# - Access other worktrees via vibe-bridge
```

---

## MCP Server Discovery

Vibe searches for MCP servers in this priority order:

1. **Local project servers** (`./mcp-servers/`)
   - Highest priority
   - Custom servers specific to your project
   - Example: `./mcp-servers/custom-api/index.js`

2. **npm project dependencies** (`package.json`)
   - Packages starting with `@modelcontextprotocol/server-*`
   - Installed in `node_modules/`

3. **Global npm packages**
   - Lowest priority
   - Shared across all projects
   - Installed with `npm install -g`

### Deduplication

If a server exists in multiple locations, the highest priority source wins. Example:
- `filesystem` server in `mcp-servers/filesystem/` (local) → **used**
- `filesystem` server in `package.json` → ignored
- `filesystem` server globally installed → ignored

---

## Official MCP Servers

### Recommended Servers

| Server | Package | Description |
|--------|---------|-------------|
| **Filesystem** | `@modelcontextprotocol/server-filesystem` | Read/write files in allowed directories |
| **Git** | `@modelcontextprotocol/server-git` | Query repository history, diffs, commits |

### Optional Servers

| Server | Package | Description | Use Case |
|--------|---------|-------------|----------|
| **GitHub** | `@modelcontextprotocol/server-github` | Access GitHub API | Issue tracking, PRs |
| **PostgreSQL** | `@modelcontextprotocol/server-postgres` | Query PostgreSQL databases | Data inspection |
| **SQLite** | `@modelcontextprotocol/server-sqlite` | Query SQLite databases | Local data analysis |

### Installation Examples

```bash
# Filesystem + Git (recommended)
npm install --save-dev @modelcontextprotocol/server-filesystem @modelcontextprotocol/server-git

# Add GitHub access
npm install --save-dev @modelcontextprotocol/server-github

# Add database querying
npm install --save-dev @modelcontextprotocol/server-postgres
```

---

## Configuration

### Automatic Configuration

Vibe automatically generates `.claude/settings.json` in each worktree:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://localhost:5432/vibe"
      }
    },
    "vibe-bridge": {
      "command": "node",
      "args": ["/path/to/scripts/mcp-bridge-server.mjs"],
      "env": {
        "VIBE_PROJECT_ROOT": "/path/to/project",
        "VIBE_WORKTREE_PATH": "/path/to/worktree"
      }
    }
  }
}
```

### Manual Overrides

You can manually edit `.claude/settings.json` in a worktree to:
- Add custom servers
- Configure environment variables
- Disable specific servers
- Override commands or arguments

**Example: Add custom server**
```json
{
  "mcpServers": {
    "custom-api": {
      "command": "node",
      "args": ["./mcp-servers/api-server/index.js"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

---

## Vibe Bridge Server

The `vibe-bridge` server enables cross-worktree collaboration for AI agents.

### Available Tools

#### 1. `list_worktrees`

List all active worktrees in the project.

**Input**: None

**Output**:
```json
[
  {
    "name": "main",
    "path": "/project/root",
    "branch": "main",
    "isCurrent": false
  },
  {
    "name": "feature-auth",
    "path": "/project/.worktrees/feature-auth",
    "branch": "feature/auth",
    "isCurrent": true
  }
]
```

#### 2. `read_file_from_worktree`

Read a file from another worktree.

**Input**:
```json
{
  "worktree": "feature-auth",
  "path": "src/auth.js"
}
```

**Output**:
```json
{
  "worktree": "feature-auth",
  "path": "src/auth.js",
  "size": 1024,
  "content": "// File contents..."
}
```

**Security**:
- Path traversal blocked (`..` not allowed)
- 1MB file size limit
- Files must be within worktree boundaries

#### 3. `get_worktree_git_status`

Get git status for a worktree.

**Input**:
```json
{
  "worktree": "feature-auth"
}
```

**Output**:
```json
{
  "worktree": "feature-auth",
  "branch": "feature/auth",
  "lastCommit": "a1b2c3d Add JWT authentication",
  "status": "M src/auth.js\n?? src/auth.test.js",
  "clean": false
}
```

#### 4. `search_across_worktrees`

Search for a pattern across all worktrees.

**Input**:
```json
{
  "pattern": "function authenticate",
  "filePattern": "*.js"
}
```

**Output**:
```json
{
  "pattern": "function authenticate",
  "filePattern": "*.js",
  "totalResults": 3,
  "results": [
    {
      "worktree": "main",
      "file": "src/auth.js",
      "line": 42,
      "content": "function authenticate(user) {"
    },
    {
      "worktree": "feature-auth",
      "file": "src/auth.js",
      "line": 45,
      "content": "function authenticate(user, token) {"
    }
  ]
}
```

**Performance**: Uses `git grep` for fast searching (only tracked files).

### Use Cases for Vibe Bridge

1. **Compare implementations** - See how a feature is implemented in different branches
2. **Sync knowledge** - Agent in worktree A learns from code in worktree B
3. **Cross-branch refactoring** - Identify patterns across multiple feature branches
4. **Conflict prevention** - Check if similar changes exist elsewhere

### Security Considerations

- **Read-only**: Bridge cannot modify other worktrees
- **Path validation**: Prevents path traversal attacks
- **Size limits**: 1MB max file read, 100 max search results
- **Sandbox**: Each worktree's agent is isolated (can only read, not execute)

---

## Custom MCP Servers

You can create custom MCP servers for project-specific needs.

### Creating a Custom Server

**1. Create directory structure**
```
mcp-servers/
  my-server/
    package.json
    index.js
```

**2. Implement MCP protocol**
```javascript
// mcp-servers/my-server/index.js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'my-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'my_tool',
      description: 'Does something useful',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        }
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'my_tool') {
    return {
      content: [{ type: 'text', text: 'Result' }]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

**3. Test the server**
```bash
# Vibe will auto-discover and configure it
npm run web
# Create a worktree → check .claude/settings.json
```

### Custom Server Best Practices

1. **Naming**: Use descriptive names (`api-tester`, not `tool1`)
2. **Documentation**: Include `README.md` with usage examples
3. **Error handling**: Return clear error messages
4. **Environment variables**: Use `.env` for secrets (don't hardcode)
5. **Testing**: Test with Claude before deploying

---

## Programmatic API

### McpManager Class

```javascript
import { McpManager } from './scripts/mcp-manager.mjs';

const mcpManager = new McpManager('/project/root', runtime);

// Discover all MCP servers
const servers = mcpManager.discoverServers();
// Returns: [{ id, name, package, source, command, args }]

// Generate settings for a worktree
const result = mcpManager.generateClaudeSettings('/worktree/path', servers, {
  serverEnv: {
    postgres: {
      DATABASE_URL: 'postgresql://localhost:5432/db'
    }
  },
  enableBridge: true
});
// Writes: /worktree/path/.claude/settings.json

// Get official servers list
const official = mcpManager.getOfficialServers();

// Check if server is installed
const isInstalled = mcpManager.isServerInstalled('filesystem');

// Update all worktrees
const results = mcpManager.updateAllWorktrees([
  '/worktree1',
  '/worktree2'
]);
```

### Installation API

```javascript
// Install a server
await mcpManager.installServer('@modelcontextprotocol/server-git', {
  global: true  // Install to global cache
});

// Result:
// {
//   success: true,
//   package: '@modelcontextprotocol/server-git',
//   location: 'global'
// }
```

---

## Troubleshooting

### MCP Servers Not Detected

**Problem**: `discoverServers()` returns empty array

**Solutions**:
1. Check `package.json` has MCP packages as dependencies
2. Run `npm install` to ensure packages are in `node_modules`
3. For global installs, run `npm list -g` to verify
4. For local servers, check `mcp-servers/` directory exists

### Claude Can't Access MCP Tools

**Problem**: Agent says "No tools available"

**Solutions**:
1. Check `.claude/settings.json` exists in worktree
2. Verify `mcpServers` object is not empty
3. Try manually running MCP server command:
   ```bash
   npx -y @modelcontextprotocol/server-filesystem
   ```
4. Check Claude Code version supports MCP (v1.5.0+)

### Bridge Server Not Working

**Problem**: `vibe-bridge` tools fail or aren't listed

**Solutions**:
1. Check `VIBE_PROJECT_ROOT` environment variable is set
2. Verify `mcp-bridge-server.mjs` file exists
3. Check worktrees exist in `.worktrees/` directory
4. Test bridge manually:
   ```bash
   VIBE_PROJECT_ROOT=/project node scripts/mcp-bridge-server.mjs
   ```

### Permission Errors

**Problem**: "EACCES: permission denied" when reading files

**Solutions**:
1. Check file permissions on `.claude/` directory
2. Ensure worktree directory is readable
3. For bridge: files must be within worktree boundaries
4. Don't read from system directories (blocked for security)

---

## Advanced Topics

### Environment Variable Injection

Vibe automatically injects environment variables for database servers:

```javascript
mcpManager.generateClaudeSettings(worktreePath, servers, {
  serverEnv: {
    postgres: {
      DATABASE_URL: `postgresql://localhost:${ports.postgres}/vibe`,
      POSTGRES_USER: 'dev',
      POSTGRES_PASSWORD: process.env.DB_PASSWORD
    }
  }
});
```

### Disabling Bridge Server

To disable cross-worktree communication:

```javascript
mcpManager.generateClaudeSettings(worktreePath, servers, {
  enableBridge: false
});
```

### Server Priority Override

To prefer global servers over local:

```javascript
// Custom server ordering
const servers = mcpManager.discoverServers();
const sorted = servers.sort((a, b) => {
  const priority = { 'npm-global': 3, 'npm-project': 2, 'local': 1 };
  return priority[b.source] - priority[a.source];
});
```

---

## Future Enhancements

Planned features for future versions:

- [ ] **MCP Marketplace UI** - Browse and install servers from web interface
- [ ] **Server Health Monitoring** - Real-time status of MCP servers
- [ ] **Agent Collaboration** - Multi-agent workflows via bridge
- [ ] **Custom Tool Builder** - GUI for creating simple MCP tools
- [ ] **Performance Analytics** - Track MCP tool usage and latency

---

## References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [MCP SDK Documentation](https://modelcontextprotocol.io/docs)
- [Claude Code MCP Integration](https://claude.ai/code/mcp)

---

**Last Updated**: 2025-10-28
**Version**: 1.0
**Maintainer**: Vibe Worktrees Team
