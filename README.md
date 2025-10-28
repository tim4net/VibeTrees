# Vibe Worktrees

**Parallel development made simple: Multiple git worktrees with AI agents and isolated containers**

[![Tests](https://github.com/your-org/vibe-worktrees/actions/workflows/test.yml/badge.svg)](https://github.com/your-org/vibe-worktrees/actions/workflows/test.yml)
[![Lint](https://github.com/your-org/vibe-worktrees/actions/workflows/lint.yml/badge.svg)](https://github.com/your-org/vibe-worktrees/actions/workflows/lint.yml)
[![Security](https://github.com/your-org/vibe-worktrees/actions/workflows/security.yml/badge.svg)](https://github.com/your-org/vibe-worktrees/actions/workflows/security.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](package.json)

---

## What is Vibe Worktrees?

Vibe Worktrees is a developer tool that enables truly parallel feature development by managing multiple git worktrees, each with its own AI assistant, browser-based terminal, and isolated service containers. No more context switching, port conflicts, or manual environment setup.

### Key Features

- **Multi-Worktree Management** - Work on multiple features simultaneously without switching contexts
- **AI Agent Support** - Claude Code, Codex, Gemini, or custom agents per worktree
- **Container Isolation** - Docker/Podman support with automatic port allocation
- **Git Sync & Smart Reload** - Automatic change detection, dependency installation, and service restarts
- **AI-Assisted Conflict Resolution** - Simple conflicts resolved automatically, complex ones guided by AI
- **MCP Server Integration** - Auto-discovered Model Context Protocol servers enhance AI capabilities
- **Browser-Based Interface** - Full-featured web UI with real-time terminal access

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Git** 2.35+
- **Docker** or **Podman**
- **Optional**: Claude Code CLI, Codex CLI, or Gemini CLI

### Installation

#### Option 1: Global Install (Recommended)

```bash
# Install globally via npm
npm install -g vibetrees

# Run from any project directory
cd ~/my-project
vibe

# Or with network access
vibe --listen
```

#### Option 2: Clone and Link (Development)

```bash
# Clone the repository
git clone https://github.com/your-org/vibe-worktrees
cd vibe-worktrees

# Install dependencies
npm install

# Link globally
npm link

# Now run from anywhere
cd ~/my-project
vibe
```

The first time you run Vibe, a configuration wizard will guide you through setup. Your configuration is saved to `~/.vibetrees/config.json`.

### Create Your First Worktree

1. Open http://localhost:3335 in your browser
2. Click "Create Worktree"
3. Enter a branch name (e.g., `feature/auth`)
4. Select an AI agent (Claude, Codex, Gemini, or Shell)
5. Click "Create" and wait for services to start

Your new worktree is ready! The AI agent is running in the terminal, services are isolated with unique ports, and you can start coding immediately.

---

## The Problem Vibe Solves

### Before Vibe

**Scenario**: You're working on Feature A when an urgent bug in production needs fixing.

**Traditional workflow**:
1. Stash or commit WIP changes
2. Switch to main branch
3. Create bugfix branch
4. Stop services, change ports, restart
5. Fix bug, test, deploy
6. Switch back to feature branch
7. Restart services again
8. Reload mental context of what you were doing
9. Repeat for every context switch

**Problems**:
- Mental context switching is expensive
- Port conflicts between branches
- Manual service management
- AI assistant loses context on branch switches
- High friction for parallel work

### With Vibe

**Same scenario with Vibe**:
1. Click "Create Worktree" for `bugfix/critical-issue`
2. AI agent already running, services started automatically
3. Fix bug in new worktree while Feature A worktree stays active
4. Switch between browser tabs to work on either
5. Both environments fully isolated, no conflicts

**Benefits**:
- Zero mental friction for context switches
- No port conflicts (automatic allocation)
- No manual service management (smart reload handles it)
- AI agents maintain separate conversations per feature
- True parallel development

---

## Core Features

### 1. Multi-Worktree Orchestration

Git worktrees let you work on multiple branches simultaneously. Vibe manages them with:
- One-click worktree creation
- Automatic directory structure (`.worktrees/feature-name/`)
- Safe deletion (prevents accidental main branch removal)
- Port registry ensures no conflicts

### 2. AI Agent Support

Each worktree can run a different AI assistant:

| Agent | Status | Features |
|-------|--------|----------|
| **Claude Code** | Fully supported | MCP support, code generation, refactoring, testing |
| **Codex** | Hypothetical CLI | Code generation, completion (when available) |
| **Gemini** | Hypothetical CLI | Code generation, analysis (when available) |
| **Shell** | Always available | Full terminal access, no AI |

Agents are isolated per worktree and maintain separate conversation contexts.

### 3. Docker/Podman Container Isolation

Each worktree gets its own isolated containers with unique ports:

**Example port allocation**:

| Service | Worktree 1 | Worktree 2 | Worktree 3 |
|---------|------------|------------|------------|
| API | 3000 | 3001 | 3002 |
| PostgreSQL | 5432 | 5433 | 5434 |
| Console | 5173 | 5174 | 5175 |

Port assignments persist across restarts in `~/.vibetrees/ports.json`.

### 4. Git Sync & Smart Reload

**Automatic change detection** after syncing with main:
- Detects changed files (docker-compose, dependencies, migrations, code)
- Automatically reinstalls dependencies (npm, pip, bundle, cargo, etc.)
- Runs database migrations (Prisma, Sequelize, Django, Rails, etc.)
- Restarts only affected services (not all)
- Notifies AI agent of important changes

**Example workflow**:
```bash
# Main branch adds new dependency and migration
git checkout main
echo "new-package" >> package.json
npm install
prisma migrate dev

# Your feature branch syncs automatically
# Vibe detects changes and:
# 1. Runs npm install (new dependency detected)
# 2. Runs prisma migrate deploy (migration detected)
# 3. Restarts API service (code changed)
# 4. Notifies Claude agent in terminal
```

### 5. AI-Assisted Conflict Resolution

When git sync results in conflicts:

**Auto-resolution** for simple cases:
- Whitespace-only conflicts
- Dependency version bumps (prefers newer)
- Non-overlapping config changes

**AI assistance** for complex conflicts:
- Sends formatted conflict info to agent's terminal
- Provides resolution suggestions
- Generates comprehensive prompts for review

**Example**:
```
CONFLICT DETECTED: src/auth.js

Category: code
Lines: 42-56

<<<<<<< HEAD
function authenticate(user) {
  return jwt.sign({ id: user.id }, SECRET);
}
=======
function authenticate(user, options = {}) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET, options);
}
>>>>>>> main

Suggestion: Manual review required
- Both sides modified function signature
- Main branch added role and options
- Your branch may need similar changes

Type 'git diff' to see full context.
```

### 6. MCP Server Integration

Model Context Protocol (MCP) servers enhance AI capabilities:

**Auto-discovered** from:
1. Local project servers (`./mcp-servers/`)
2. npm project dependencies (`package.json`)
3. Global npm packages

**Official servers** (auto-configured):
- `@modelcontextprotocol/server-filesystem` - File read/write
- `@modelcontextprotocol/server-git` - Git history and diffs
- `@modelcontextprotocol/server-postgres` - Database queries
- `@modelcontextprotocol/server-github` - GitHub API access

**Vibe Bridge** server enables cross-worktree communication:
- List all worktrees
- Read files from other worktrees
- Get git status across worktrees
- Search patterns across branches

See [MCP Integration Guide](docs/mcp-integration.md) for details.

---

## Architecture

### High-Level Design

```
┌──────────────────────────────────────────────────────┐
│              Web Interface (Browser UI)               │
│         Express + WebSocket + xterm.js                │
└───────────────────┬──────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────┐
│           Worktree Manager (Orchestration)            │
│   - Git worktrees                                     │
│   - Port registry                                     │
│   - Container runtime (Docker/Podman)                 │
│   - PTY manager (terminals)                           │
│   - Git sync + smart reload                           │
│   - AI conflict resolver                              │
└──┬────────────────┬────────────────┬─────────────────┘
   │                │                │
   ▼                ▼                ▼
┌──────────┐  ┌──────────┐    ┌──────────┐
│Worktree 1│  │Worktree 2│    │Worktree 3│
│          │  │          │    │          │
│ feature/ │  │ bugfix/  │    │ experiment/│
│ auth     │  │ login    │    │ perf      │
│          │  │          │    │          │
│ Claude   │  │ Codex    │    │ Gemini   │
│ api:3000 │  │ api:3001 │    │ api:3002 │
│ db:5432  │  │ db:5433  │    │ db:5434  │
└──────────┘  └──────────┘    └──────────┘
```

### Component Overview

| Component | Purpose | Lines of Code |
|-----------|---------|---------------|
| **worktree-manager.mjs** | Core orchestration | 674 |
| **port-registry.mjs** | Port allocation | 82 |
| **git-sync-manager.mjs** | Git sync + change detection | 578 |
| **smart-reload-manager.mjs** | Auto-reload services | 424 |
| **ai-conflict-resolver.mjs** | Conflict resolution | 538 |
| **mcp-manager.mjs** | MCP server discovery | 350 |
| **worktree-web/server.mjs** | Web server + API | 1,445 |
| **agents/** | AI agent abstraction | 800 |

See [Architecture Guide](docs/architecture.md) for detailed design.

---

## Configuration

### Default Configuration

The first-run wizard creates `~/.vibetrees/config.json`:

```json
{
  "runtime": "docker",
  "defaultAgent": "claude",
  "portRange": { "min": 3000, "max": 9999 },
  "worktreeDir": ".worktrees",
  "mainBranch": "main",
  "syncStrategy": "merge",
  "enableSmartReload": true,
  "autoResolveConflicts": true
}
```

### Common Settings

**Change default AI agent**:
```json
{
  "defaultAgent": "codex"
}
```

**Use Podman instead of Docker**:
```json
{
  "runtime": "podman"
}
```

**Disable smart reload**:
```json
{
  "enableSmartReload": false
}
```

**Network access** (allow remote connections):
```bash
npm run web -- --listen
```

See [Configuration Guide](docs/configuration.md) for all options.

---

## API Documentation

### REST API

**Worktrees**:
- `GET /api/worktrees` - List all worktrees
- `POST /api/worktrees` - Create worktree
- `DELETE /api/worktrees/:name` - Delete worktree
- `GET /api/worktrees/:name/services` - Get service status

**Git Sync**:
- `GET /api/worktrees/:name/check-updates` - Check for updates
- `POST /api/worktrees/:name/sync` - Sync with main
- `POST /api/worktrees/:name/rollback` - Rollback sync
- `GET /api/worktrees/:name/analyze-changes` - Analyze changes

**Conflicts**:
- `GET /api/worktrees/:name/conflicts` - List conflicts
- `GET /api/worktrees/:name/conflicts/analyze` - Analyze with suggestions
- `POST /api/worktrees/:name/conflicts/resolve` - Auto-resolve
- `POST /api/worktrees/:name/conflicts/ai-assist` - Request AI help

**Agents**:
- `GET /api/agents` - List available agents
- `GET /api/agents/:name` - Get agent metadata
- `GET /api/agents/availability` - Check installation status

See [API Reference](docs/api.md) for complete documentation.

### WebSocket Events

**Client → Server**:
```javascript
{ event: 'list-worktrees' }
{ event: 'create-worktree', data: { branch, fromBranch, agent } }
{ event: 'delete-worktree', data: { name } }
{ event: 'connect-terminal', data: { name, command } }
{ event: 'sync-worktree', data: { name, strategy, smartReload } }
```

**Server → Client**:
```javascript
{ event: 'worktrees', data: [...] }
{ event: 'worktree-created', data: { name, path, ports } }
{ event: 'sync-progress', data: { step, message } }
{ event: 'error', data: { message } }
```

---

## Testing

Vibe follows **Test-Driven Development (TDD)** with comprehensive test coverage:

```bash
# Run all tests
npm test

# Watch mode (re-runs on changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

**Test statistics**:
- 486 total tests (5 skipped)
- 80%+ code coverage
- All core modules tested

**Key test suites**:
- `worktree-manager.test.mjs` (59 tests)
- `git-sync-manager.test.mjs` (80 tests)
- `smart-reload-manager.test.mjs` (46 tests)
- `ai-conflict-resolver.test.mjs` (47 tests)
- `mcp-manager.test.mjs` (45 tests)
- `port-registry.test.mjs` (23 tests)

---

## Troubleshooting

### Port Conflicts

**Problem**: Services fail to start due to port conflicts

**Solution**:
```bash
# Check port registry
cat ~/.vibetrees/ports.json

# Reset port allocations
rm ~/.vibetrees/ports.json
npm run web
```

### Docker/Podman Issues

**Problem**: Containers fail to start

**Solution**:
```bash
# Check service status
docker compose ps -a

# Clean up orphaned containers
docker compose down -v

# Restart services
# (Use web UI or API)
```

### MCP Servers Not Detected

**Problem**: AI agent says "No MCP tools available"

**Solution**:
```bash
# Check installed packages
npm list | grep @modelcontextprotocol

# Install recommended servers
npm install --save-dev @modelcontextprotocol/server-filesystem @modelcontextprotocol/server-git

# Verify config generated
cat .worktrees/your-branch/.claude/settings.json
```

### AI Agent Won't Start

**Problem**: Terminal shows error when launching agent

**Solution**:
```bash
# Check if agent CLI is installed
npx -y @anthropic-ai/claude-code --version

# Verify PATH includes node_modules/.bin
echo $PATH

# Try launching manually
cd .worktrees/your-branch
npx -y @anthropic-ai/claude-code
```

### Sync Conflicts

**Problem**: Git sync fails with conflicts

**Solution**:
1. Check conflict list: `GET /api/worktrees/:name/conflicts`
2. Analyze conflicts: `GET /api/worktrees/:name/conflicts/analyze`
3. Auto-resolve simple ones: `POST /api/worktrees/:name/conflicts/resolve`
4. Request AI help: `POST /api/worktrees/:name/conflicts/ai-assist`
5. Manual resolution: Edit files in worktree, then `git add` and continue

---

## FAQ

**Q: Can I use Vibe without Docker?**

A: No, Vibe requires Docker or Podman for container isolation. However, you can use the worktree and AI agent features without services by not starting containers.

**Q: Does Vibe work with monorepos?**

A: Yes! Vibe supports any project with a `docker-compose.yml` file. For complex monorepos, you may need to customize service detection in your config.

**Q: Can I use my own AI agent?**

A: Yes! See [Adding Custom Agents](docs/adding-agents.md) for a guide on implementing custom agent integrations.

**Q: What happens if I delete a worktree?**

A: Vibe safely:
1. Stops all running containers
2. Releases allocated ports
3. Deletes the worktree directory
4. Removes git worktree reference
5. Cleans up agent config files

You cannot delete the main worktree for safety.

**Q: Can multiple people use Vibe on the same project?**

A: Yes, but each developer should run their own Vibe instance. Port allocations are per-machine. Future versions will support team collaboration features.

**Q: How much disk space do worktrees use?**

A: Each worktree is a full checkout of your repository. For a 100MB repo with 3 worktrees, expect ~300MB total. Git efficiently shares objects, so it's less than 3x the size.

**Q: Can I use Vibe with GitHub Codespaces or GitPod?**

A: Yes! Run with `npm run web -- --listen` to allow external connections. Access via the forwarded port.

---

## Development & Contributing

### Development Setup

```bash
# Clone repo
git clone https://github.com/your-org/vibe-worktrees
cd vibe-worktrees

# Install dependencies
npm install

# Run tests
npm test

# Start in development mode
npm run web
```

### Code Style

Vibe follows clean coding standards:
- **TDD**: Write tests first
- **DRY**: No code duplication
- **SOLID**: Single responsibility principle
- **80%+ test coverage** required

### Project Structure

```
scripts/
├── worktree-manager.mjs       # Core orchestration
├── port-registry.mjs          # Port allocation
├── git-sync-manager.mjs       # Git sync + detection
├── smart-reload-manager.mjs   # Auto-reload
├── ai-conflict-resolver.mjs   # Conflict resolution
├── mcp-manager.mjs            # MCP server management
├── config-manager.mjs         # Configuration
├── agents/                    # AI agent integrations
│   ├── agent-interface.mjs
│   ├── claude-agent.mjs
│   ├── codex-agent.mjs
│   ├── gemini-agent.mjs
│   └── shell-agent.mjs
└── worktree-web/              # Web interface
    ├── server.mjs
    └── public/
        ├── index.html
        ├── css/
        └── js/
```

### Contributing

We welcome contributions! To contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Write tests for new functionality
4. Ensure tests pass: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

**Contribution guidelines**:
- All new code must have tests
- Maintain 80%+ coverage
- Follow existing code style
- Update documentation
- Add yourself to CONTRIBUTORS.md

---

## Roadmap

### Completed (v1.0)

- ✅ Phase 1: Web-only interface (removed tmux CLI)
- ✅ Phase 2: Codebase-agnostic container runtime
- ✅ Phase 3: MCP server integration
- ✅ Phase 4: Multi-agent support
- ✅ Phase 5: Git sync + smart reload + AI conflict resolution
- ✅ Phase 6: Testing & Documentation (486 tests, comprehensive docs)
- ✅ Phase 7: Polish & Release (performance, security, CI/CD)

### Planned (v2.0)

**Phase 8: Advanced Features** (2-3 months)
- Terminal persistence (browser refresh survives)
- Team collaboration (shared worktrees)
- Cloud integration (deploy from worktree)
- VS Code extension
- Mobile responsive UI

**Phase 8: Enterprise** (3-4 months)
- SSO authentication
- Audit logging
- RBAC permissions
- Metrics & monitoring
- Multi-repo support

---

## License

MIT License - See [LICENSE](LICENSE) for details

---

## Acknowledgments

- Built with [Claude Code](https://github.com/anthropics/claude-code) by Anthropic
- Inspired by git worktrees and tmux multiplexing
- Architecture reviewed by GPT-5
- Planning assisted by Claude (Anthropic)
- MCP protocol by Anthropic

---

## Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/your-org/vibe-worktrees/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/vibe-worktrees/discussions)
- **Email**: support@vibetrees.dev (coming soon)

---

**Status**: ✅ v1.0 Complete - Ready for Production

**Last Updated**: 2025-10-28

**Version**: 1.0.0
