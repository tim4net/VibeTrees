# VibeTrees

**Manage multiple git worktrees with AI agents and isolated containers**

> ⚠️ **Status**: Planning Phase - Not yet ready for use

---

## What is this?

VibeTrees is a developer tool that enables **parallel feature development** with:
- 🌳 Multiple git worktrees (work on multiple features simultaneously)
- 🤖 AI coding assistants per worktree (Claude, Codex, Gemini)
- 🐳 Isolated Docker/Podman containers (unique ports, no conflicts)
- 🔌 MCP server integration (enhanced AI capabilities)
- 🔄 Automatic sync with main branch

## The Problem

As a solo developer or small team, you want to:
- Work on multiple features in parallel
- Use AI assistants for each feature
- Run services (databases, APIs) without port conflicts
- Sync with main branch easily
- Switch between features without mental context switching

**Traditional approach**: Manual worktree management, port conflicts, no AI integration

**VibeTrees**: One-click worktree creation with AI agent, isolated services, automatic sync

---

## Current Status

**Phase 1 Complete** ✅ (3-4 days)

Completed:
- ✅ Removed tmux CLI interface (web-only now)
- ✅ Added --listen parameter for network configuration
- ✅ Created first-run configuration wizard
- ✅ Updated documentation

**Next**: Phase 2 - Make Codebase-Agnostic (29-31 days)

---

## Planning Documents

📋 **Start here**: [PLANNING-SUMMARY.md](PLANNING-SUMMARY.md) - Overview and next steps

### Core Plans
- [REFACTORING-PLAN.md](REFACTORING-PLAN.md) - 8-phase implementation roadmap (6-9 weeks)
- [CRITICAL-FEATURES.md](CRITICAL-FEATURES.md) - Must-have features identified by experts
- [SECURITY-DESIGN.md](SECURITY-DESIGN.md) - Security architecture and threat model
- [MCP-ARCHITECTURE.md](MCP-ARCHITECTURE.md) - Centralized MCP server design

### Feature Specs
- [FEATURE-SYNC-RELOAD.md](FEATURE-SYNC-RELOAD.md) - Sync & reload button specification
- [FEATURE-BRANCH-SELECTOR.md](FEATURE-BRANCH-SELECTOR.md) - Branch browser/selector UI
- [FEATURE-BRANCH-CLEANUP.md](FEATURE-BRANCH-CLEANUP.md) - Branch cleanup on deletion
- [TERMINAL-PERSISTENCE.md](TERMINAL-PERSISTENCE.md) - Terminal state persistence design

### Current Architecture
- [CLAUDE.md](CLAUDE.md) - Documentation for AI agents working on this codebase

---

## Architecture Preview

### High-Level Design

```
┌──────────────────────────────────────────────────────┐
│                   Web Interface                       │
│         (Browser-based, real-time updates)            │
└───────────────────┬──────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────┐
│              Container Runtime                        │
│         (Docker or Podman abstraction)                │
└──┬────────────────┬────────────────┬─────────────────┘
   │                │                │
   ▼                ▼                ▼
┌──────────┐  ┌──────────┐    ┌──────────┐
│Worktree 1│  │Worktree 2│    │Worktree 3│
│          │  │          │    │          │
│ feature/ │  │ bugfix/  │    │ experiment/│
│ auth     │  │ login    │    │ perf      │
│          │  │          │    │          │
│ Claude ✓ │  │ Codex  ✓ │    │ Gemini ✓ │
│ api:3000 │  │ api:3001 │    │ api:3002 │
│ db:5432  │  │ db:5433  │    │ db:5434  │
└──────────┘  └──────────┘    └──────────┘
```

### Key Features

**🔒 Codebase-Agnostic**
- Works with any `docker-compose.yml` project
- No hardcoded service names or assumptions
- Dynamic service discovery

**🐳 Container Runtime Support**
- Docker or Podman (auto-detected)
- Rootless containers by default
- Unique ports per worktree (no conflicts)

**🤖 Multiple AI Agents**
- Claude Code, Codex, Gemini, or custom
- Browser-based terminals (node-pty + xterm.js)
- Per-worktree agent isolation

**💾 Terminal Persistence**
- Browser refresh preserves terminal state
- AI conversations survive server restarts
- Pause/resume worktrees without losing context
- Command history and scrollback preserved

**🔌 MCP Integration**
- Auto-discover and install MCP servers
- Cross-worktree MCP bridge
- Container-isolated execution

**🔄 Smart Sync & Reload**
- One-click sync with main branch
- Detects changes (docker-compose, dependencies, code)
- Restarts only affected services
- AI-assisted conflict resolution

**🛡️ Security First**
- Agent sandboxing (directory allowlist)
- Command validation and rate limiting
- Audit logging for all operations
- Secrets in OS keychain

---

## Tech Stack

**Backend**:
- Node.js (ES modules)
- Express + WebSocket
- node-pty (terminal emulation)

**Frontend**:
- Vanilla JS (no framework)
- xterm.js (browser terminals)
- WebSocket for real-time updates

**Container Orchestration**:
- Docker Compose or Podman Compose
- Git worktrees

**Testing**:
- Vitest (TDD approach)
- 80%+ coverage target

---

## Development Principles

This project follows **clean coding standards** as core values:

- **TDD**: Write tests first, watch them fail, implement
- **DRY**: Extract shared logic, no duplication
- **SOLID**: Single responsibility, proper separation of concerns
- **Security**: Multiple validation layers, fail closed

---

## Prerequisites (When Ready)

**Required**:
- Node.js 18+
- Git
- Docker or Podman

**Optional**:
- Claude Code CLI (`npx @anthropic-ai/claude-code`)
- Codex CLI (`npx @openai/codex`)
- Gemini CLI (`npx gemini-cli`)

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/vibe-worktrees
cd vibe-worktrees

# Install dependencies
npm install

# Start the web interface (localhost only)
npm run web

# Or allow network access
npm run web -- --listen
```

The first-run wizard will automatically configure VibeTrees with sensible defaults.
Configuration is saved to `~/.vibetrees/config.json` and can be edited manually.

---

## Roadmap

### ✅ Phase 1: Cleanup & Setup (Complete)
- ✅ Removed tmux CLI interface
- ✅ Added --listen parameter for network configuration
- ✅ Created first-run wizard
- ✅ Updated documentation

### Phase 2: Codebase-Agnostic
- Container runtime abstraction
- Dynamic service discovery
- Configuration system
- Volume namespacing

### Phase 3: MCP Integration
- Auto-discovery
- Installation & linking
- Cross-worktree bridge

### Phase 4: Multi-Agent
- Agent interface abstraction
- Built-in agents (Claude, Codex, Gemini)
- Agent selection UI

### Phase 5: Automatic Updates
- Sync with main branch
- Smart reload
- Conflict resolution

### Phase 6: Testing & Docs
- 80%+ test coverage
- User documentation
- API reference

### Phase 7: Polish & Release
- Performance optimization
- Security audit
- CI/CD setup
- Beta release

### Phase 8: Advanced Features
- Team collaboration
- Cloud integration
- VS Code extension

**Timeline**: 4-6 weeks (Phases 1-7)

---

## Contributing

**Current Status**: Not accepting contributions yet (planning phase)

Once implementation begins, we'll welcome:
- Bug reports
- Feature requests
- Documentation improvements
- Code contributions (with tests)

---

## Questions?

This project is in planning phase. For questions or feedback:
- Open an issue (once repo is public)
- See [PLANNING-SUMMARY.md](PLANNING-SUMMARY.md) for detailed plans
- Check [REFACTORING-PLAN.md](REFACTORING-PLAN.md) for implementation roadmap

---

## License

TBD (Will be MIT or Apache 2.0)

---

## Acknowledgments

- Built on [Claude Code](https://github.com/anthropics/claude-code) by Anthropic
- Inspired by git worktrees and tmux multiplexing
- Architecture reviewed by GPT-5
- Planning assisted by Claude (Anthropic)

---

**Status**: 📋 Planning Complete → 🚧 Implementation Starting Soon

**Last Updated**: 2025-10-27
