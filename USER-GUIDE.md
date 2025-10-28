# VibeTrees User Guide

Complete manual for using VibeTrees to manage multiple git worktrees with AI assistants and isolated services.

---

## Table of Contents

1. [Installation](#installation)
2. [Getting Started](#getting-started)
3. [Creating Worktrees](#creating-worktrees)
4. [Managing Worktrees](#managing-worktrees)
5. [AI Agents](#ai-agents)
6. [Terminal Features](#terminal-features)
7. [Service Management](#service-management)
8. [Branch Operations](#branch-operations)
9. [Network Mode](#network-mode)
10. [Diagnostics & Troubleshooting](#diagnostics--troubleshooting)
11. [Advanced Features](#advanced-features)
12. [Configuration](#configuration)

---

## Installation

### Method 1: Try with npx (No Install)

Perfect for testing or one-time use:

```bash
cd ~/your-project
npx github:tim4net/VibeTrees
```

This downloads and runs VibeTrees temporarily. After you close it, the cache may be kept for faster subsequent runs.

### Method 2: Global Install (Recommended)

For regular use:

```bash
npm install -g github:tim4net/VibeTrees
```

Now you can run `vibe` from any directory.

### Method 3: Clone for Development

For contributing or customizing:

```bash
git clone https://github.com/tim4net/VibeTrees.git
cd VibeTrees
npm install
npm link
```

This links the global `vibe` command to your local clone.

---

## Getting Started

### Launch VibeTrees

```bash
cd ~/your-project  # Navigate to your git repository
vibe               # Start VibeTrees
```

Output:
```
🚀 Worktree Manager is running!

   🔒 Local Mode: Localhost only

      🏠 http://localhost:3335
```

Open **http://localhost:3335** in your browser.

### First-Time Setup

When you first launch VibeTrees in a repository:

1. **Port Detection**: VibeTrees finds an available port (default: 3335)
2. **Container Runtime**: Detects Docker or Podman
3. **MCP Servers**: Discovers any MCP servers in your environment
4. **AI Agents**: Lists available CLI agents (claude, codex, gemini)
5. **Existing Worktrees**: Scans for worktrees already created

---

## Creating Worktrees

### Create from New Branch

1. Click **"Create Worktree"** button
2. In the **"New Branch"** tab:
   - Enter branch name: `feature/user-authentication`
   - Select base branch: `main` (or any existing branch)
   - Choose AI agent: Claude Code, Codex, Gemini, or Shell
3. Click **"Create"**

VibeTrees will:
- Create git worktree in `.worktrees/feature-user-authentication/`
- Checkout new branch `feature/user-authentication`
- Assign unique ports for services
- Start AI agent in terminal
- Generate MCP configuration (if MCP servers detected)

### Create from Existing Branch

1. Click **"Create Worktree"** button
2. Switch to **"Existing Branch"** tab
3. Search for branch (local or remote)
4. Select branch from list
5. Choose AI agent
6. Click **"Create"**

### Import Existing Worktrees

Already created worktrees with `git worktree add`?

1. Click **"Import"** button in header
2. VibeTrees scans your repository for:
   - Git worktrees not yet registered
   - Running Docker containers linked to worktrees
   - Port assignments from container environment
3. Select worktrees to import (or select all)
4. Click **"Import Selected"**

VibeTrees automatically:
- Detects which ports are in use
- Registers worktrees in the UI
- Links existing containers
- Creates terminal sessions

---

## Managing Worktrees

### Switch Between Worktrees

Click any worktree in the left sidebar. The view updates to show:
- Terminals for that worktree
- Git status and branch info
- Running services
- Diagnostics status

### Close a Worktree

Right-click worktree in sidebar → **"Close Worktree"**

Options:
- **Keep branch**: Removes worktree but keeps git branch
- **Delete branch**: Also deletes the git branch (with safety checks)

Safety features:
- Cannot delete `main` or primary worktree
- Warns if branch has unmerged commits
- Stops Docker containers before deletion
- Releases allocated ports

### Rename or Move Worktrees

VibeTrees expects worktrees in `.worktrees/` directory. To rename:

1. Close the worktree in VibeTrees
2. Rename manually: `mv .worktrees/old-name .worktrees/new-name`
3. Update git: `git worktree repair`
4. Import the renamed worktree in VibeTrees

---

## AI Agents

### Available Agents

#### Claude Code
Best for:
- Complex refactoring
- Architecture discussions
- Test-driven development
- Code reviews

Requires: `claude` CLI installed

#### Codex
Best for:
- Fast code generation
- Boilerplate creation
- Quick implementations

Requires: Codex CLI or OpenAI API access

#### Gemini
Best for:
- Multimodal tasks (if you provide images)
- Google ecosystem integration

Requires: Gemini CLI

#### Shell (No AI)
Just a plain terminal. Useful if:
- You don't want AI assistance
- Testing without AI overhead
- You have your own agent setup

### Agent Configuration

Agents receive environment variables per worktree:
- `WORKTREE_PATH`: Path to worktree directory
- `WORKTREE_NAME`: Branch name
- `POSTGRES_PORT`, `API_PORT`, etc.: Assigned ports

### Custom Agents

See [docs/adding-agents.md](docs/adding-agents.md) for creating custom agents.

---

## Terminal Features

### Terminal Persistence

**Your terminal sessions survive:**
- Browser refresh
- Browser crash
- Network disconnection
- System reboot (with caveat: process must still be running)

How it works:
- State saved every 5 seconds to `~/.vibetrees/sessions/{id}/pty-state.json`
- Buffer includes last 5000 lines
- Dimensions, cursor position, and scrollback preserved

### Terminal Controls

**Create new terminal**:
- Click "+" next to terminal tabs
- Select shell or agent
- Multiple terminals per worktree supported

**Close terminal**:
- Click "×" on terminal tab
- Session is removed from storage

**Resize terminal**:
- Terminals auto-resize with browser window
- Or drag terminal pane divider

### Copy/Paste

- **Copy**: Select text → Right-click → Copy (or Cmd/Ctrl+C)
- **Paste**: Right-click in terminal → Paste (or Cmd/Ctrl+V)

### Auto-Reconnection

If connection drops:
- Automatic reconnection with exponential backoff
- 1s → 2s → 4s → 8s → 16s → 30s (max)
- Up to 10 attempts
- Shows reconnection overlay with status

---

## Service Management

### Docker Compose Integration

If your worktree has `docker-compose.yml`:

VibeTrees automatically:
1. Injects unique port environment variables
2. Shows service status in UI
3. Provides start/stop controls

### Environment Variables

Each worktree gets unique ports:

```yaml
# Example docker-compose.yml
services:
  api:
    ports:
      - "${API_PORT}:3000"  # VibeTrees sets API_PORT=3001, 3003, 3005...

  db:
    ports:
      - "${POSTGRES_PORT}:5432"  # Unique per worktree
```

Standard environment variables:
- `POSTGRES_PORT`
- `API_PORT`
- `CONSOLE_PORT`
- `TEMPORAL_PORT`
- `TEMPORAL_UI_PORT`
- `MINIO_PORT`
- `MINIO_CONSOLE_PORT`

### Start/Stop Services

Right-click worktree → **"Start Services"** or **"Stop Services"**

Or use terminal:
```bash
docker compose up -d    # Start in background
docker compose down     # Stop and remove
docker compose logs -f  # View logs
```

### Port Registry

Ports are tracked in `~/.claude-worktrees/ports.json`:

```json
{
  "feature-auth": {
    "api": 3001,
    "db": 5433,
    "console": 3002
  },
  "bugfix-login": {
    "api": 3003,
    "db": 5434,
    "console": 3004
  }
}
```

To reset ports:
```bash
rm ~/.claude-worktrees/ports.json
# Restart VibeTrees
```

---

## Branch Operations

### Browse Branches

Click **"Create Worktree"** → **"Existing Branch"** tab

Features:
- Search by branch name
- Filter local vs remote
- See last commit message
- See commit date and author

### Sync with Remote

Right-click worktree → **"Sync with Remote"**

VibeTrees will:
1. Fetch from origin
2. Analyze changes (dependencies, migrations, config)
3. Prompt for confirmation
4. Pull changes
5. Auto-reload services if needed
6. Notify AI agent of changes

### Delete Branch Safely

Right-click worktree → **"Close Worktree"** → Check **"Delete branch"**

Safety checks:
1. **Merge detection**: Warns if branch not merged to main
2. **Remote check**: Warns if branch exists on remote
3. **Main protection**: Cannot delete main/master branch
4. **Worktree location**: Only deletes branches in `.worktrees/`

---

## Network Mode

### Enable Network Access

```bash
vibe --listen
```

Output:
```
🚀 Worktree Manager is running!

   📡 Network Mode: ALL interfaces

   🔍 Checking firewall configuration...

   Connect from any device on your network:

      🌐 http://192.168.1.100:3335  (en0 - WiFi)
      🌐 http://172.16.0.1:3335     (en1 - Ethernet)
```

### macOS Firewall

**First time using --listen:**

VibeTrees will check if macOS Firewall is blocking node and:
- **Unmanaged Mac**: Prompt for sudo to auto-configure
- **Managed Mac**: Show step-by-step manual instructions

**Manual configuration** (if needed):
1. Open System Preferences → Security & Privacy
2. Click Firewall tab
3. Click lock icon and authenticate
4. Click "Firewall Options..."
5. Click "+" to add application
6. Navigate to node binary (shown in VibeTrees output)
7. Select "Allow incoming connections"
8. Click OK

### Security Considerations

**Network mode exposes:**
- Web UI (no authentication)
- Terminal access to your worktrees
- Git operations
- Docker management

**Safe scenarios:**
- Home network behind NAT
- Corporate network you trust
- VPN connection
- Development with trusted teammates

**Unsafe scenarios:**
- Public WiFi (coffee shops, airports)
- Untrusted networks
- Networks with AP isolation

**Best practices:**
1. Use `--listen` only when needed
2. Use local mode by default
3. Consider SSH tunneling for remote access
4. Know who's on your network

See [docs/network-access.md](docs/network-access.md) for full security guide.

---

## Diagnostics & Troubleshooting

### System Diagnostics

Click **"Diagnostics"** button in header

**10 health checks:**
1. Git repository valid
2. Docker/Podman running
3. Worktrees directory structure
4. Port conflicts
5. Orphaned containers
6. Stale worktrees
7. MCP server health
8. AI agent availability
9. Disk space
10. File permissions

**Auto-Fix** button attempts to fix common issues:
- Recreate missing directories
- Prune orphaned containers
- Clean up stale port allocations
- Repair git worktree links

### Per-Worktree Diagnostics

Right-click worktree → **"Run Diagnostics"**

Checks specific to that worktree:
- Git branch status
- Container health
- Port assignments
- Service dependencies
- File system issues

### Common Issues

#### Port Already in Use

**Symptom**: Error starting VibeTrees: `EADDRINUSE`

**Solution**:
```bash
vibe --port 3336  # Use different port
```

#### Docker Not Running

**Symptom**: "Container runtime not detected"

**Solution**:
```bash
docker ps  # Check Docker is running
# Start Docker Desktop or run: sudo systemctl start docker
```

#### Can't Run `vibe` Command

**Symptom**: `command not found: vibe`

**Solution**:
```bash
# Re-link global command
cd ~/path/to/VibeTrees
npm link

# Or add to PATH
echo 'export PATH="$PATH:~/VibeTrees/bin"' >> ~/.bashrc
source ~/.bashrc
```

#### Terminal Not Reconnecting

**Symptom**: Terminal shows "Disconnected" and won't reconnect

**Solutions**:
1. Check server is still running
2. Refresh browser (Cmd/Ctrl+R)
3. Check terminal session exists: `ls ~/.vibetrees/sessions/`
4. Restart VibeTrees server

#### Firewall Blocking Connections

**Symptom**: Can't access from other devices when using `--listen`

**Solution**: See [Network Mode](#network-mode) section above or [docs/network-access.md](docs/network-access.md)

---

## Advanced Features

### Database Import/Export

Export database from one worktree, import to another:

```bash
# In worktree terminal
vibe-db export --output backup.sql

# Switch to different worktree
vibe-db import --input backup.sql
```

Supports PostgreSQL with schema validation. See [docs/database-workflow.md](docs/database-workflow.md).

### Git Conflict Resolution

When syncing encounters conflicts:

1. VibeTrees detects merge conflicts
2. Shows AI-powered resolution suggestions
3. You can:
   - Accept AI suggestion
   - Manually resolve in terminal
   - Abort merge

AI resolution works for simple conflicts (formatting, imports, etc). Complex logic conflicts require manual review.

### Performance Profiling

Track worktree creation time:

```bash
vibe --profile
```

Shows breakdown of:
- Git operations
- Docker container startup
- NPM install
- Service initialization

See [docs/performance-optimization.md](docs/performance-optimization.md) for optimization tips.

### MCP Server Integration

VibeTrees auto-discovers MCP servers and generates `.claude/settings.json` for each worktree.

**Built-in MCP servers:**
- `vibe-bridge`: Cross-worktree communication
  - `list_worktrees`: See all active worktrees
  - `read_file_from_worktree`: Read files from other worktrees
  - `get_worktree_git_status`: Check git status across worktrees
  - `search_across_worktrees`: Global codebase search

See [docs/mcp-integration.md](docs/mcp-integration.md) for details.

---

## Configuration

### Command-Line Options

```bash
vibe [options]

Options:
  --port <number>    Port to run on (default: 3335)
  --listen           Allow network access (default: localhost only)
  --profile          Enable performance profiling
  --version          Show version
  --help             Show help
```

### Environment Variables

- `VIBE_PORT`: Default port (overridden by `--port`)
- `VIBE_HOST`: Default host (overridden by `--listen`)
- `VIBE_DATA_DIR`: Data directory (default: `~/.vibetrees`)

### Configuration Files

#### Port Registry
Location: `~/.claude-worktrees/ports.json`

Stores port allocations per worktree.

#### Session State
Location: `~/.vibetrees/sessions/{session-id}/pty-state.json`

Terminal session persistence data.

#### MCP Settings
Location: `{worktree}/.claude/settings.json`

Generated MCP server configuration per worktree.

---

## Tips & Best Practices

### Workflow Tips

1. **Main as primary**: Keep `main` branch as primary worktree
2. **Feature isolation**: One feature per worktree
3. **Short-lived worktrees**: Close when feature is merged
4. **Descriptive names**: Use `feature/`, `bugfix/`, `hotfix/` prefixes

### Performance Tips

1. **Close unused worktrees**: Frees ports and resources
2. **Stop unused services**: Docker containers consume memory
3. **Clean up branches**: Delete merged branches regularly
4. **Use diagnostics**: Run health checks periodically

### Collaboration Tips

1. **Network mode for reviews**: Use `--listen` when pair programming
2. **Share specific worktree**: Direct teammate to specific URL + worktree
3. **Document setup**: Add `.vibetrees-setup.md` to your repo
4. **Consistent ports**: Document which ports are used for what

---

## Getting Help

- **Documentation**: Check [GitHub repo](https://github.com/tim4net/VibeTrees)
- **Issues**: [Report bugs](https://github.com/tim4net/VibeTrees/issues)
- **Discussions**: Ask questions in GitHub Discussions
- **Diagnostics**: Run built-in diagnostics first

---

**Made with ❤️ by developers who hate context switching**
