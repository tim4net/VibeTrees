# MCP Architecture (Centralized)

**Design Decision**: Shared MCP servers for resource efficiency
**Target**: Local single-user development environment
**Status**: Planning

---

## Architecture Overview

### Centralized MCP Servers

```
┌─────────────────────────────────────────────────────┐
│              Vibe Worktrees Manager                  │
│  ┌───────────────────────────────────────────────┐  │
│  │         Centralized MCP Pool                  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │  │
│  │  │filesystem│  │  github  │  │ postgres │   │  │
│  │  │  (one)   │  │  (one)   │  │  (one)   │   │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘   │  │
│  └───────┼─────────────┼─────────────┼──────────┘  │
│          │             │             │             │
│  ┌───────▼─────────────▼─────────────▼──────────┐  │
│  │       Request Router + Validator             │  │
│  │  - Add worktree context                      │  │
│  │  - Validate paths                            │  │
│  │  - Rate limiting                             │  │
│  │  - Audit logging                             │  │
│  └─────┬──────────┬──────────┬──────────────────┘  │
└────────┼──────────┼──────────┼─────────────────────┘
         │          │          │
    ┌────▼───┐ ┌────▼───┐ ┌────▼───┐
    │Worktree│ │Worktree│ │Worktree│
    │   1    │ │   2    │ │   3    │
    │        │ │        │ │        │
    │Claude  │ │Codex   │ │Gemini  │
    └────────┘ └────────┘ └────────┘
```

**Key Points**:
- ✅ One MCP server instance per type (filesystem, github, postgres, etc.)
- ✅ All worktrees share the same MCP servers
- ✅ Router adds worktree context to each request
- ✅ Validation layer prevents cross-worktree access
- ✅ Minimal resource overhead

---

## Why Centralized?

### Resource Efficiency

**3 Worktrees × 3 MCP Servers Each = Problem**

Per-Worktree Approach (rejected):
```
Memory: 9 containers × 256MB = 2.3GB
CPU: 9 containers × 0.25 cores = 2.25 cores
Startup: 9 processes to spawn
```

Centralized Approach (chosen):
```
Memory: 3 processes × 100MB = 300MB
CPU: 3 processes × 0.1 cores = 0.3 cores
Startup: 3 processes to spawn
```

**Savings**: 87% less memory, 87% less CPU, 3× faster startup

### Acceptable Risk for Local Dev

**Not a shared server**:
- Single user on local machine
- If MCP server is compromised, attacker likely has access to machine already
- Defense-in-depth via validation layer is sufficient
- User understands and accepts the risks

**Still secure**:
- Path validation (no directory traversal)
- Rate limiting (prevent abuse)
- Audit logging (track all operations)
- Method allowlists (restrict capabilities)
- Secret redaction (never log tokens)

---

## Implementation

### MCP Server Manager

```javascript
import { spawn } from 'child_process';
import { JsonRpcClient } from './json-rpc.mjs';

export class MCPServerManager {
  constructor(config) {
    this.config = config;
    this.servers = new Map();  // serverName -> server instance
    this.validator = new MCPRequestValidator();
    this.rateLimiter = new RateLimiter();
    this.auditLog = new AuditLogger();
  }

  /**
   * Start centralized MCP server
   */
  async startServer(serverName) {
    if (this.servers.has(serverName)) {
      return this.servers.get(serverName);
    }

    const serverConfig = this.config.mcp.servers[serverName];
    if (!serverConfig || !serverConfig.enabled) {
      throw new Error(`MCP server ${serverName} not configured or disabled`);
    }

    console.log(`Starting centralized MCP server: ${serverName}`);

    // Start via npx (auto-installs if needed)
    const proc = spawn('npx', ['-y', serverConfig.package], {
      cwd: this.getMCPWorkingDir(),
      env: this.buildEnv(serverConfig),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle process errors
    proc.on('error', (err) => {
      console.error(`MCP server ${serverName} failed:`, err);
      this.servers.delete(serverName);
    });

    proc.on('exit', (code) => {
      console.log(`MCP server ${serverName} exited with code ${code}`);
      this.servers.delete(serverName);
    });

    // Setup JSON-RPC communication over stdio
    const rpcClient = new JsonRpcClient(proc.stdin, proc.stdout);

    const server = {
      name: serverName,
      process: proc,
      rpcClient,
      config: serverConfig,
      startedAt: Date.now()
    };

    this.servers.set(serverName, server);

    // Wait for initialization
    await this.waitForReady(server);

    console.log(`✓ MCP server ${serverName} ready`);

    return server;
  }

  /**
   * Route request to MCP server with worktree context
   */
  async handleRequest(worktreeName, serverName, request) {
    // Get or start server
    const server = await this.startServer(serverName);

    // Add worktree context
    const contextualRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: request.method,
      params: {
        ...request.params,
        // Add context for path resolution
        _vibeContext: {
          worktree: worktreeName,
          workingDirectory: this.getWorktreePath(worktreeName),
          timestamp: Date.now()
        }
      }
    };

    // Validate request
    await this.validator.validate(contextualRequest, server.config, worktreeName);

    // Rate limit
    await this.rateLimiter.checkLimit(worktreeName, serverName, request.method);

    // Forward to MCP server
    const response = await server.rpcClient.request(contextualRequest);

    // Audit log (with secret redaction)
    this.auditLog.record({
      worktree: worktreeName,
      server: serverName,
      method: request.method,
      params: this.redactSecrets(request.params),
      success: !response.error,
      timestamp: Date.now()
    });

    return response;
  }

  /**
   * Stop all MCP servers (cleanup)
   */
  async stopAll() {
    for (const [name, server] of this.servers.entries()) {
      console.log(`Stopping MCP server: ${name}`);
      server.process.kill('SIGTERM');
    }

    this.servers.clear();
  }

  /**
   * Build environment for MCP server
   */
  buildEnv(serverConfig) {
    const env = { ...process.env };

    // Add configured env vars
    if (serverConfig.env) {
      for (const [key, value] of Object.entries(serverConfig.env)) {
        // Support ${VAR} substitution
        env[key] = this.substituteEnvVars(value);
      }
    }

    return env;
  }

  substituteEnvVars(value) {
    return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }

  getWorktreePath(worktreeName) {
    return path.join(process.cwd(), '.worktrees', worktreeName);
  }

  getMCPWorkingDir() {
    return path.join(homedir(), '.vibe-worktrees', 'mcp');
  }
}
```

### Request Validator

```javascript
export class MCPRequestValidator {
  /**
   * Validate request before forwarding to MCP server
   */
  async validate(request, serverConfig, worktreeName) {
    const worktreePath = this.getWorktreePath(worktreeName);

    // 1. Validate file paths in request
    if (request.params?.path) {
      this.validateFilePath(request.params.path, worktreePath, serverConfig);
    }

    // 2. Validate method is allowed
    if (serverConfig.allowedMethods) {
      if (!serverConfig.allowedMethods.includes(request.method)) {
        throw new SecurityError(
          `Method ${request.method} not allowed for ${serverConfig.name}`
        );
      }
    }

    // 3. Validate method is not denied
    if (serverConfig.deniedMethods) {
      if (serverConfig.deniedMethods.includes(request.method)) {
        throw new SecurityError(
          `Method ${request.method} is explicitly denied for ${serverConfig.name}`
        );
      }
    }

    return { valid: true };
  }

  validateFilePath(filePath, worktreePath, serverConfig) {
    // Resolve relative to worktree
    const resolved = path.resolve(worktreePath, filePath);

    // Must be within worktree
    if (!resolved.startsWith(worktreePath)) {
      throw new SecurityError(
        `Path ${filePath} is outside worktree directory`
      );
    }

    // Check denied paths
    if (serverConfig.deniedPaths) {
      for (const denied of serverConfig.deniedPaths) {
        const deniedPath = path.join(worktreePath, denied);
        if (resolved.startsWith(deniedPath)) {
          throw new SecurityError(
            `Access to ${filePath} is denied by configuration`
          );
        }
      }
    }

    // Check allowed paths (if specified)
    if (serverConfig.allowedPaths && serverConfig.allowedPaths.length > 0) {
      let isAllowed = false;

      for (const allowed of serverConfig.allowedPaths) {
        const allowedPath = path.join(worktreePath, allowed);
        if (resolved.startsWith(allowedPath)) {
          isAllowed = true;
          break;
        }
      }

      if (!isAllowed) {
        throw new SecurityError(
          `Path ${filePath} is not in allowed paths`
        );
      }
    }

    return { valid: true, resolved };
  }

  getWorktreePath(worktreeName) {
    return path.join(process.cwd(), '.worktrees', worktreeName);
  }
}
```

### Rate Limiter

```javascript
export class RateLimiter {
  constructor() {
    this.limits = new Map(); // key -> {count, resetAt}
  }

  async checkLimit(worktreeName, serverName, method) {
    const key = `${worktreeName}:${serverName}:${method}`;
    const now = Date.now();

    // Get or create limit tracker
    if (!this.limits.has(key)) {
      this.limits.set(key, {
        count: 0,
        resetAt: now + 60000  // 1 minute
      });
    }

    const limit = this.limits.get(key);

    // Reset if expired
    if (now > limit.resetAt) {
      limit.count = 0;
      limit.resetAt = now + 60000;
    }

    // Increment counter
    limit.count++;

    // Check limit (default: 100 requests per minute)
    const maxRequests = this.getLimit(serverName);
    if (limit.count > maxRequests) {
      throw new RateLimitError(
        `Rate limit exceeded: ${limit.count}/${maxRequests} requests per minute`
      );
    }

    return {
      allowed: true,
      remaining: maxRequests - limit.count,
      resetAt: limit.resetAt
    };
  }

  getLimit(serverName) {
    // Can be configured per server
    const defaults = {
      filesystem: 100,
      github: 50,
      postgres: 30
    };

    return defaults[serverName] || 50;
  }
}
```

---

## Configuration

### .vibe/config.json

```json
{
  "mcp": {
    "enabled": true,
    "autoStart": true,
    "servers": {
      "filesystem": {
        "package": "@modelcontextprotocol/server-filesystem",
        "enabled": true,
        "allowedPaths": [
          "src/",
          "tests/",
          "docs/",
          "scripts/"
        ],
        "deniedPaths": [
          ".env",
          ".env.local",
          "secrets/",
          ".git/config",
          "node_modules/"
        ],
        "allowedMethods": [
          "read_file",
          "write_file",
          "list_directory",
          "search_files"
        ],
        "rateLimit": {
          "requestsPerMinute": 100
        }
      },
      "github": {
        "package": "@modelcontextprotocol/server-github",
        "enabled": true,
        "allowedMethods": [
          "create_issue",
          "create_pr",
          "list_issues",
          "get_pr",
          "comment_on_pr"
        ],
        "rateLimit": {
          "requestsPerMinute": 50
        },
        "env": {
          "GITHUB_TOKEN": "${GITHUB_TOKEN}"
        }
      },
      "postgres": {
        "package": "@modelcontextprotocol/server-postgres",
        "enabled": false,
        "allowedMethods": [
          "query"
        ],
        "deniedMethods": [
          "execute_ddl",
          "execute_dml"
        ],
        "rateLimit": {
          "requestsPerMinute": 30
        },
        "env": {
          "DATABASE_URL": "postgresql://readonly@localhost:${POSTGRES_PORT}/${WORKTREE_NAME}"
        }
      }
    }
  }
}
```

---

## Agent Integration

### Claude Code Configuration

Each worktree gets a `.claude/settings.json` that routes to centralized MCPs:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": [
        "/path/to/vibe-worktrees/scripts/mcp-proxy.mjs",
        "filesystem",
        "feature-auth"
      ]
    },
    "github": {
      "command": "node",
      "args": [
        "/path/to/vibe-worktrees/scripts/mcp-proxy.mjs",
        "github",
        "feature-auth"
      ]
    }
  }
}
```

**`mcp-proxy.mjs`**: Routes requests to centralized MCP server

```javascript
// Simple proxy that forwards requests to Vibe's centralized MCP manager
import WebSocket from 'ws';

const [, , serverName, worktreeName] = process.argv;

const ws = new WebSocket('ws://localhost:3333/mcp');

ws.on('open', () => {
  // Read JSON-RPC from stdin
  process.stdin.on('data', (data) => {
    const request = JSON.parse(data.toString());

    // Forward to Vibe with worktree context
    ws.send(JSON.stringify({
      type: 'mcp-request',
      worktree: worktreeName,
      server: serverName,
      request
    }));
  });
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());

  // Write response to stdout
  process.stdout.write(JSON.stringify(response) + '\n');
});
```

---

## Lifecycle

### Startup

```
User starts Vibe Worktrees
    ↓
Load MCP configuration
    ↓
Auto-start enabled MCP servers (if autoStart: true)
    ↓
MCP servers ready for requests
```

### Request Flow

```
Agent (Claude) in worktree "feature-auth"
    ↓
Calls filesystem.read_file("src/api.ts")
    ↓
MCP Proxy
    ↓
WebSocket → Vibe Manager
    ↓
Add context: worktree="feature-auth", workingDirectory=".../.worktrees/feature-auth"
    ↓
Validate: path is within worktree, method allowed, rate limit OK
    ↓
Forward to centralized filesystem MCP server
    ↓
Filesystem MCP resolves path relative to worktree
    ↓
Read file, return content
    ↓
Response → Agent
```

### Cleanup

```
User deletes worktree
    ↓
No MCP server cleanup needed (shared across worktrees)
    ↓
User closes Vibe Worktrees
    ↓
Stop all MCP servers gracefully (SIGTERM)
```

---

## Benefits

### Resource Efficiency
- ✅ 87% less memory than per-worktree approach
- ✅ 87% less CPU overhead
- ✅ Faster startup (3 processes vs 9+ processes)
- ✅ Simpler management (3 vs 9+ containers)

### Simplicity
- ✅ One configuration per MCP type
- ✅ No complex routing or namespace management
- ✅ Easier to debug (fewer moving parts)
- ✅ No Docker/Podman overhead

### Still Secure
- ✅ Path validation prevents cross-worktree access
- ✅ Rate limiting prevents abuse
- ✅ Method allowlists restrict capabilities
- ✅ Audit logging tracks all operations
- ✅ Secret redaction in logs

---

## Trade-offs

### What We Give Up
- ❌ Container-level isolation (acceptable for local dev)
- ❌ Per-worktree MCP configurations (rarely needed)
- ❌ Network isolation per MCP (not needed for local)

### What We Keep
- ✅ Security via validation layer
- ✅ Audit logging
- ✅ Rate limiting
- ✅ Error isolation (one bad request doesn't crash everything)

---

## Testing

### Tests to Add

```javascript
describe('Centralized MCP Manager', () => {
  it('starts MCP server once', async () => {
    const manager = new MCPServerManager(config);

    // Request from worktree 1
    await manager.handleRequest('wt1', 'filesystem', {
      method: 'read_file',
      params: { path: 'src/api.ts' }
    });

    // Request from worktree 2
    await manager.handleRequest('wt2', 'filesystem', {
      method: 'read_file',
      params: { path: 'src/api.ts' }
    });

    // Should only have one filesystem MCP server
    expect(manager.servers.size).toBe(1);
  });

  it('adds worktree context to requests', async () => {
    const spy = vi.spyOn(rpcClient, 'request');

    await manager.handleRequest('feature-auth', 'filesystem', {
      method: 'read_file',
      params: { path: 'src/api.ts' }
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          _vibeContext: {
            worktree: 'feature-auth',
            workingDirectory: expect.stringContaining('feature-auth')
          }
        })
      })
    );
  });

  it('validates paths are within worktree', async () => {
    await expect(
      manager.handleRequest('wt1', 'filesystem', {
        method: 'read_file',
        params: { path: '../../etc/passwd' }
      })
    ).rejects.toThrow('outside worktree');
  });

  it('enforces rate limits per worktree', async () => {
    // Hit rate limit for wt1
    for (let i = 0; i < 101; i++) {
      await manager.handleRequest('wt1', 'filesystem', {
        method: 'read_file',
        params: { path: 'test.txt' }
      });
    }

    // Should throw rate limit error
    await expect(
      manager.handleRequest('wt1', 'filesystem', {
        method: 'read_file',
        params: { path: 'test.txt' }
      })
    ).rejects.toThrow('Rate limit exceeded');

    // But wt2 should still work
    await expect(
      manager.handleRequest('wt2', 'filesystem', {
        method: 'read_file',
        params: { path: 'test.txt' }
      })
    ).resolves.toBeDefined();
  });
});
```

---

## Summary

**Centralized MCP Architecture**:
- One MCP server instance per type (filesystem, github, etc.)
- All worktrees share the same MCP servers
- Validation layer adds worktree context and enforces security
- 87% resource savings vs per-worktree approach
- Acceptable security trade-off for local single-user environment

**Implementation**: Phase 3 of refactoring plan

**Status**: ✅ Approved for implementation

---

**Document Version**: 1.0
**Last Updated**: 2025-10-26
**Approved By**: User (resource efficiency prioritized)
