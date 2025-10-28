# Configuration Guide

**Complete reference for configuring Vibe Worktrees**

---

## Configuration File Location

Vibe stores user configuration in `~/.vibetrees/config.json`. This file is created automatically by the first-run wizard when you start Vibe for the first time.

**Location by platform**:
- Linux: `/home/username/.vibetrees/config.json`
- macOS: `/Users/username/.vibetrees/config.json`
- Windows: `C:\Users\username\.vibetrees\config.json`

---

## First-Run Wizard

The wizard runs automatically when no configuration file exists. It detects:

1. **Container runtime** - Docker or Podman (auto-detected)
2. **Default AI agent** - Claude, Codex, Gemini, or Shell
3. **Port range** - Available port range for service allocation
4. **Main branch** - Main/master branch name (auto-detected from git)

You can skip the wizard and use defaults by creating an empty config file.

---

## Configuration Schema

### Complete Example

```json
{
  "runtime": "docker",
  "defaultAgent": "claude",
  "portRange": {
    "min": 3000,
    "max": 9999
  },
  "worktreeDir": ".worktrees",
  "mainBranch": "main",
  "syncStrategy": "merge",
  "enableSmartReload": true,
  "autoResolveConflicts": true,
  "pollInterval": 300000,
  "networkListen": false,
  "webPort": 3335,
  "agentDefaults": {
    "claude": {
      "cacheDir": ".claude-cache"
    }
  },
  "mcpServers": {
    "enableBridge": true,
    "autoDiscover": true
  },
  "serviceDefaults": {
    "autoStart": true,
    "healthCheckTimeout": 60000
  }
}
```

---

## Core Settings

### `runtime` (string)

Container runtime to use.

**Options**: `"docker"` | `"podman"`
**Default**: Auto-detected (Docker preferred)
**Example**:
```json
{
  "runtime": "podman"
}
```

**Detection logic**:
1. Check if `docker` command exists
2. Check if `podman` command exists
3. Fail if neither exists

### `defaultAgent` (string)

Default AI agent for new worktrees.

**Options**: `"claude"` | `"codex"` | `"gemini"` | `"shell"`
**Default**: `"claude"`
**Example**:
```json
{
  "defaultAgent": "codex"
}
```

**Notes**:
- Agent must be installed/available
- Can be overridden when creating worktree
- `"shell"` always available as fallback

### `portRange` (object)

Port range for service allocation.

**Structure**:
```json
{
  "portRange": {
    "min": 3000,
    "max": 9999
  }
}
```

**Default**: `{ "min": 3000, "max": 9999 }`

**Notes**:
- Vibe allocates incrementing ports starting from `min`
- Ports are persisted in `~/.vibetrees/ports.json`
- Avoid ranges used by system services (1-1024)
- Common port conflicts: 3000 (Node dev), 5432 (PostgreSQL), 8080 (HTTP alt)

### `worktreeDir` (string)

Directory name for worktrees (relative to project root).

**Default**: `".worktrees"`
**Example**:
```json
{
  "worktreeDir": "branches"
}
```

**Result**: Worktrees created in `./branches/feature-name/`

**Notes**:
- Must be relative path
- Created automatically if doesn't exist
- Should be in `.gitignore`

### `mainBranch` (string)

Name of main/trunk branch for syncing.

**Default**: Auto-detected (`main` or `master`)
**Example**:
```json
{
  "mainBranch": "develop"
}
```

**Detection logic**:
1. Check for `main` branch
2. Check for `master` branch
3. Fail if neither exists

---

## Git Sync Settings

### `syncStrategy` (string)

Default merge strategy for git sync.

**Options**: `"merge"` | `"rebase"`
**Default**: `"merge"`
**Example**:
```json
{
  "syncStrategy": "rebase"
}
```

**Notes**:
- `"merge"` creates merge commits
- `"rebase"` rebases feature branch onto main
- Can be overridden per-sync via API

### `enableSmartReload` (boolean)

Enable automatic change detection and reload after sync.

**Default**: `true`
**Example**:
```json
{
  "enableSmartReload": false
}
```

**When enabled**:
- Detects changed files (dependencies, migrations, services)
- Automatically reinstalls dependencies
- Runs database migrations
- Restarts affected services
- Notifies AI agent

**When disabled**:
- Manual dependency installation required
- Manual migration execution required
- Manual service restart required

### `autoResolveConflicts` (boolean)

Auto-resolve simple git conflicts.

**Default**: `true`
**Example**:
```json
{
  "autoResolveConflicts": false
}
```

**Auto-resolved conflicts**:
- Whitespace-only differences
- Dependency version bumps (prefer newer)
- Non-overlapping config changes

**Complex conflicts**: Always require manual resolution or AI assistance.

---

## Network Settings

### `networkListen` (boolean)

Listen on all interfaces (allow remote connections).

**Default**: `false` (localhost only)
**Example**:
```json
{
  "networkListen": true
}
```

**Security**:
- `false`: Binds to `127.0.0.1` (localhost only, secure)
- `true`: Binds to `0.0.0.0` (all interfaces, less secure)

**Use cases for `true`**:
- GitHub Codespaces / GitPod
- Remote development
- Team demos
- Container environments

**Command-line override**:
```bash
npm run web -- --listen  # Enable network listening for this session
```

### `webPort` (number)

Port for web interface.

**Default**: `3335`
**Example**:
```json
{
  "webPort": 8080
}
```

**Notes**:
- Must be available (not in use)
- Avoid conflicts with service ports
- Default `3335` avoids common conflicts

---

## Polling & Updates

### `pollInterval` (number)

Interval (milliseconds) for checking git updates.

**Default**: `300000` (5 minutes)
**Example**:
```json
{
  "pollInterval": 60000
}
```

**Notes**:
- Set to `0` or `null` to disable polling
- Lower values increase network/CPU usage
- Recommended: 60000-600000 (1-10 minutes)

---

## Agent Settings

### `agentDefaults` (object)

Per-agent configuration defaults.

**Structure**:
```json
{
  "agentDefaults": {
    "claude": {
      "cacheDir": ".claude-cache",
      "args": ["--verbose"]
    },
    "codex": {
      "model": "gpt-4",
      "temperature": 0.7
    }
  }
}
```

**Common settings**:
- `cacheDir`: Agent cache directory (relative to worktree)
- `args`: Additional CLI arguments
- `env`: Environment variables

**Example (Claude with custom cache)**:
```json
{
  "agentDefaults": {
    "claude": {
      "cacheDir": ".cache/claude",
      "args": ["--log-level", "debug"]
    }
  }
}
```

---

## MCP Server Settings

### `mcpServers` (object)

MCP server configuration.

**Structure**:
```json
{
  "mcpServers": {
    "enableBridge": true,
    "autoDiscover": true,
    "customServers": [
      {
        "name": "custom-api",
        "command": "node",
        "args": ["./mcp-servers/api/index.js"]
      }
    ]
  }
}
```

**Settings**:
- `enableBridge` (boolean): Enable vibe-bridge server for cross-worktree access
- `autoDiscover` (boolean): Auto-discover MCP servers from npm/local
- `customServers` (array): Manually configured servers

**Custom server schema**:
```json
{
  "name": "server-name",
  "command": "node",
  "args": ["./path/to/server.js"],
  "env": {
    "API_KEY": "value"
  }
}
```

**Example (disable bridge, add custom server)**:
```json
{
  "mcpServers": {
    "enableBridge": false,
    "autoDiscover": true,
    "customServers": [
      {
        "name": "jira-api",
        "command": "npx",
        "args": ["-y", "mcp-jira@latest"],
        "env": {
          "JIRA_URL": "https://company.atlassian.net",
          "JIRA_TOKEN": "${JIRA_TOKEN}"
        }
      }
    ]
  }
}
```

**Notes**:
- Use `${VAR}` for environment variable substitution
- Servers must implement MCP protocol
- See [MCP Integration Guide](mcp-integration.md) for details

---

## Service Settings

### `serviceDefaults` (object)

Default service behavior.

**Structure**:
```json
{
  "serviceDefaults": {
    "autoStart": true,
    "healthCheckTimeout": 60000,
    "restartPolicy": "unless-stopped"
  }
}
```

**Settings**:
- `autoStart` (boolean): Auto-start services when creating worktree
- `healthCheckTimeout` (number): Max wait time for service health (ms)
- `restartPolicy` (string): Docker restart policy

**Example (don't auto-start services)**:
```json
{
  "serviceDefaults": {
    "autoStart": false
  }
}
```

---

## Environment Variables

### Override Config via Environment

All config options can be overridden with environment variables:

| Config Key | Environment Variable | Example |
|------------|---------------------|---------|
| `runtime` | `VIBE_RUNTIME` | `VIBE_RUNTIME=podman` |
| `defaultAgent` | `VIBE_DEFAULT_AGENT` | `VIBE_DEFAULT_AGENT=codex` |
| `mainBranch` | `VIBE_MAIN_BRANCH` | `VIBE_MAIN_BRANCH=develop` |
| `webPort` | `VIBE_WEB_PORT` | `VIBE_WEB_PORT=8080` |
| `enableSmartReload` | `VIBE_SMART_RELOAD` | `VIBE_SMART_RELOAD=false` |

**Usage**:
```bash
# Override runtime for one session
VIBE_RUNTIME=podman npm run web

# Override multiple settings
VIBE_DEFAULT_AGENT=shell VIBE_WEB_PORT=8080 npm run web
```

**Precedence** (highest to lowest):
1. Environment variables
2. `~/.vibetrees/config.json`
3. Built-in defaults

---

## Platform-Specific Configuration

### macOS

**Default runtime**: Docker Desktop

**Notes**:
- Docker Desktop includes Compose
- Podman requires manual installation
- Port range `3000-9999` generally safe

**Recommended config**:
```json
{
  "runtime": "docker",
  "portRange": { "min": 3000, "max": 9999 }
}
```

### Linux

**Default runtime**: Docker or Podman (both common)

**Notes**:
- Podman preferred for rootless containers
- Port range below 1024 requires root
- SELinux may affect volume mounts

**Recommended config (rootless)**:
```json
{
  "runtime": "podman",
  "portRange": { "min": 3000, "max": 9999 }
}
```

### Windows

**Default runtime**: Docker Desktop

**Notes**:
- WSL2 backend required
- Path separators handled automatically
- Firewall may block network listening

**Recommended config**:
```json
{
  "runtime": "docker",
  "portRange": { "min": 3000, "max": 9999 },
  "networkListen": false
}
```

---

## Examples

### Minimal Configuration

Bare minimum for Vibe to work:

```json
{
  "runtime": "docker"
}
```

All other settings use defaults.

### Team Development

Configuration for team collaboration:

```json
{
  "runtime": "docker",
  "defaultAgent": "shell",
  "syncStrategy": "rebase",
  "enableSmartReload": true,
  "pollInterval": 60000,
  "networkListen": true,
  "webPort": 3335
}
```

**Rationale**:
- `defaultAgent: "shell"`: No AI costs
- `syncStrategy: "rebase"`: Clean commit history
- `pollInterval: 60000`: Check for updates every minute
- `networkListen: true`: Allow remote access

### Solo Developer (AI-Heavy)

Configuration for solo development with AI:

```json
{
  "runtime": "docker",
  "defaultAgent": "claude",
  "syncStrategy": "merge",
  "enableSmartReload": true,
  "autoResolveConflicts": true,
  "mcpServers": {
    "enableBridge": true,
    "autoDiscover": true
  },
  "agentDefaults": {
    "claude": {
      "cacheDir": ".claude-cache"
    }
  }
}
```

**Rationale**:
- `defaultAgent: "claude"`: Best AI experience
- `syncStrategy: "merge"`: Preserve context
- `autoResolveConflicts: true`: Less friction
- `enableBridge: true`: Cross-worktree AI features

### CI/CD Environment

Configuration for automated testing:

```json
{
  "runtime": "docker",
  "defaultAgent": "shell",
  "enableSmartReload": false,
  "pollInterval": 0,
  "networkListen": false,
  "serviceDefaults": {
    "autoStart": false
  }
}
```

**Rationale**:
- `defaultAgent: "shell"`: No AI needed
- `enableSmartReload: false`: Manual control
- `pollInterval: 0`: No background polling
- `autoStart: false`: Start services explicitly

---

## Troubleshooting Configuration

### Config Not Loading

**Problem**: Changes to config file not applied

**Solutions**:
1. Verify file location: `~/.vibetrees/config.json`
2. Check JSON syntax: `cat ~/.vibetrees/config.json | jq`
3. Restart web server: Stop and `npm run web`
4. Check for environment variable overrides

### Invalid Configuration

**Problem**: Vibe fails to start with config error

**Solutions**:
1. Validate JSON syntax
2. Check required fields (at minimum: `runtime`)
3. Verify enums (`runtime`, `defaultAgent`, `syncStrategy`)
4. Reset to defaults: `rm ~/.vibetrees/config.json`

### Port Conflicts

**Problem**: Services fail to start due to port conflicts

**Solutions**:
1. Change port range:
   ```json
   { "portRange": { "min": 4000, "max": 9999 } }
   ```
2. Reset port registry: `rm ~/.vibetrees/ports.json`
3. Check for running services: `lsof -i :3000`

---

## Configuration Best Practices

### 1. Use Environment Variables for Secrets

Don't hardcode API keys in config:

**Bad**:
```json
{
  "agentDefaults": {
    "codex": {
      "env": {
        "OPENAI_API_KEY": "sk-abc123..."
      }
    }
  }
}
```

**Good**:
```json
{
  "agentDefaults": {
    "codex": {
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

Then: `export OPENAI_API_KEY=sk-abc123...`

### 2. Commit Project-Specific Config

Create `.vibe/config.json` in your project root for team settings:

```json
{
  "runtime": "docker",
  "mainBranch": "main",
  "syncStrategy": "rebase",
  "serviceDefaults": {
    "autoStart": true
  }
}
```

User config (`~/.vibetrees/config.json`) overrides project config.

### 3. Document Custom Configuration

If your team uses non-default config, document it in `README.md`:

```markdown
## Vibe Configuration

This project requires:
- Port range 4000-9999 (3000-3999 used by dev server)
- Rebase strategy (clean commit history)
- MCP servers: filesystem, git, postgres
```

---

## Schema Validation

Vibe validates configuration on startup. Invalid config causes startup failure with detailed error messages.

**Example error**:
```
Configuration error: Invalid runtime "podman2"
Expected one of: "docker", "podman"
```

**Common validation errors**:
- Invalid enum values
- Port range `min` > `max`
- Invalid JSON syntax
- Missing required fields

---

## References

- [Git Sync Guide](git-sync.md) - Sync strategies and smart reload
- [MCP Integration](mcp-integration.md) - MCP server configuration
- [Adding Agents](adding-agents.md) - Custom agent configuration
- [API Reference](api.md) - Runtime configuration via API

---

**Last Updated**: 2025-10-28
**Version**: 1.0
