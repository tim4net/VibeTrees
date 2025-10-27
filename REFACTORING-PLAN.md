# Vibe Worktrees: Refactoring Plan

**Goal**: Transform project-riftwing's worktree manager into a standalone, codebase-agnostic tool for parallel development with AI agents and MCP server integration.

**Created**: 2025-10-26
**Status**: Planning Phase

---

## Executive Summary

This multi-phase plan will:
1. Remove all project-riftwing dependencies and assumptions
2. Make the app work with any Docker Compose or Podman Compose project
3. Support both Docker and Podman container runtimes
4. Add MCP server orchestration across worktrees
5. Enable pluggable AI agent support (Claude, Codex, Gemini, etc.)
6. Remove abandoned tmux CLI interface
7. Fix data import/sync functions to be codebase-agnostic
8. Add automatic updates from upstream main/master branch
9. Publish to new private GitHub repository

---

## Phase 1: Cleanup & Repository Setup

**Objective**: Remove project-riftwing artifacts and establish clean foundation

### Tasks

#### 1.1 Remove tmux CLI Interface
- [ ] Delete `scripts/worktree-manager.mjs` (CLI version)
- [ ] Delete `scripts/worktree-manager.test.mjs` (CLI tests)
- [ ] Delete `scripts/worktree-manager.test.README.md`
- [ ] Update `package.json` to remove CLI scripts:
  - Remove: `start`, `attach`, `manage`, `kill`
  - Keep: `web`, `test`, `test:watch`, `test:coverage`
- [ ] Update `CLAUDE.md` to remove all tmux/CLI references
- [ ] Update `CLAUDE.md` to focus on web-only interface

**Success Criteria**: No tmux dependencies, only web interface remains

#### 1.2 Audit for project-riftwing References
- [ ] Search all files for hardcoded references:
  - `api-1`, `api-2`, `worker-1`, `worker-2` (service names)
  - `postgresql/data` (database path assumptions)
  - `console` (specific UI service)
  - `apps/*`, `packages/*`, `services/*` (monorepo structure)
  - `temporal`, `minio` (specific service stack)
- [ ] Search for Docker-specific commands:
  - `sudo docker compose` (needs abstraction)
  - `docker compose` (needs abstraction)
  - `docker ps`, `docker logs`, etc. (needs abstraction)
- [ ] Document all found references with file:line locations
- [ ] Create migration checklist for each reference

**Success Criteria**: Complete inventory of all codebase-specific and Docker-specific assumptions

#### 1.3 Create New GitHub Repository
- [ ] Initialize new repo: `vibe-worktrees` (private)
- [ ] Add `.gitignore`:
  ```
  node_modules/
  .worktrees/
  *.log
  .DS_Store
  .env
  .env.local
  ```
- [ ] Create `README.md` with:
  - Project description
  - Quick start guide
  - Features overview
  - Installation instructions
- [ ] Add `LICENSE` file (MIT or Apache 2.0)
- [ ] Set up branch protection for `main`
- [ ] Enable GitHub Actions
- [ ] Add issue templates for bugs and feature requests

**Success Criteria**: Clean repo ready for development, no project-riftwing history

---

## Phase 2: Make App Codebase-Agnostic

**Objective**: Support any Docker Compose project without hardcoded assumptions

### Tasks

#### 2.1 Container Runtime Abstraction
- [ ] Create `scripts/container-runtime.mjs`:
  - Detect available runtime: Docker or Podman
  - Provide unified interface for both
  - Handle command differences (docker vs podman)
  - Support `docker-compose` vs `podman-compose`
- [ ] Auto-detect runtime preference:
  - Check for `docker` command first
  - Fallback to `podman` if Docker not available
  - Allow manual override in config
- [ ] Update all container commands:
  - Replace `sudo docker compose` with runtime abstraction
  - Replace `docker` with runtime abstraction
  - Handle Podman's rootless mode (no sudo needed)

**API Design**:
```javascript
class ContainerRuntime {
  constructor() {
    this.runtime = this.detectRuntime(); // 'docker' or 'podman'
    this.needsSudo = this.checkSudoRequirement();
  }

  detectRuntime() // Returns: 'docker' or 'podman'
  getComposeCommand() // Returns: 'docker compose' or 'podman-compose'
  exec(command, options) // Executes with correct runtime
  needsElevation() // Returns: boolean (true for Docker, false for rootless Podman)
}
```

**Success Criteria**: Works seamlessly with Docker or Podman without user intervention

#### 2.2 Dynamic Service Discovery
- [ ] Create `scripts/compose-inspector.mjs`:
  - Parse `docker-compose.yml` or `podman-compose.yml` to detect services
  - Extract exposed ports from compose file
  - Identify service dependencies
  - Detect volumes and bind mounts
  - Support Compose file versions 2, 3.x
- [ ] Update `PortRegistry` to work with arbitrary service names
- [ ] Remove hardcoded service list (postgres, api, console, temporal, etc.)
- [ ] Add tests for multi-service detection with both runtimes

**API Design**:
```javascript
class ComposeInspector {
  constructor(composeFilePath, runtime) {}

  getServices() // Returns: [{ name, ports: [], volumes: [] }]
  getServicePorts(serviceName) // Returns: [3000, 5432, ...]
  hasService(serviceName) // Returns: boolean
  getVolumes() // Returns: [{ name, path }]
  getNetworks() // Returns: [{ name, driver }]
}
```

**Success Criteria**: Works with any compose file on Docker or Podman without code changes

#### 2.3 Configuration System
- [ ] Create `.vibe/config.json` schema:
  ```json
  {
    "version": "1.0",
    "project": {
      "name": "my-app",
      "description": "Optional description"
    },
    "container": {
      "runtime": "auto",  // "auto", "docker", or "podman"
      "composeFile": "docker-compose.yml",
      "servicesToLog": ["api", "worker"],  // Auto-detect if empty
      "dataVolumes": ["postgres-data"],    // Auto-detect if empty
      "sudo": "auto"  // "auto", "always", or "never" (for Docker vs rootless Podman)
    },
    "agents": {
      "default": "claude",
      "available": ["claude", "codex", "gemini"]
    },
    "mcp": {
      "autoInstall": true,
      "servers": []  // Discovered automatically
    },
    "sync": {
      "enabled": true,
      "baseBranch": "main",  // Auto-detect from git
      "autoUpdate": false
    }
  }
  ```
- [ ] Create `scripts/config-manager.mjs` to read/write config
- [ ] Add config initialization wizard on first run:
  - Detect Docker or Podman automatically
  - Show detected runtime and version
  - Offer to test container runtime
  - Auto-configure sudo requirements
- [ ] Support config override via environment variables:
  - `VIBE_RUNTIME=docker` or `VIBE_RUNTIME=podman`
  - `VIBE_COMPOSE_FILE=custom-compose.yml`
  - `VIBE_SUDO=always|never`
- [ ] Add config validation with helpful error messages:
  - Check if selected runtime is installed
  - Verify compose command works
  - Test sudo requirements
  - Validate compose file syntax

**Success Criteria**: Zero hardcoded assumptions, all configurable, works with Docker or Podman

#### 2.4 Flexible Data Import System
- [ ] Replace `copyDatabase()` with generic `copyDataVolumes()`
- [ ] Detect Docker volumes vs bind mounts automatically
- [ ] Support multiple data volume types:
  - Postgres databases
  - MongoDB collections
  - Redis dumps
  - File uploads (S3-style)
  - Any bind-mounted data directory
- [ ] Add UI option to skip data copy for fresh starts
- [ ] Create `scripts/data-sync.mjs`:
  ```javascript
  class DataSync {
    async copyVolumes(fromWorktree, toWorktree, options)
    async listVolumes(worktree)
    async resetVolume(worktree, volumeName)  // Fresh start
  }
  ```
- [ ] Add progress tracking for large data copies

**Success Criteria**: Works with any Docker volume/bind mount configuration

#### 2.5 Remove Service-Specific Logic
- [ ] Replace hardcoded log command:
  - From: `docker compose logs -f api-1 api-2 worker-1 worker-2 console`
  - To: `${runtime.getComposeCommand()} logs -f $(detect_services)`
- [ ] Remove hardcoded service status checks
- [ ] Make service health checks generic (work with both Docker and Podman)
- [ ] Update web UI to display arbitrary services
- [ ] Handle runtime-specific differences:
  - Docker: `docker compose ps --format json`
  - Podman: `podman-compose ps --format json` (may have different format)

**Success Criteria**: No mentions of specific service names or runtime assumptions in code

#### 2.7 Branch Selector UI

**Reference**: See [FEATURE-BRANCH-SELECTOR.md](FEATURE-BRANCH-SELECTOR.md) for detailed design

**Problem**: Users must manually type branch names when creating worktrees, leading to typos and confusion about which branches are available or already in use.

**Solution**: Add branch browser/selector to worktree creation dialog.

- [ ] **Backend: Branch Manager (1-2 days)**
  - Create `scripts/branch-manager.mjs`
  - Implement `listAvailableBranches()`:
    - List all local branches
    - List all remote branches
    - Get last commit metadata (message, author, date)
    - Mark base branch (main/master) as unavailable
    - Mark branches in worktrees as unavailable
    - Filter remote branches tracked by local branches
  - Add `/api/branches` endpoint
  - Handle edge cases (detached HEAD, orphan branches)

- [ ] **Frontend: Branch Selector UI (2-3 days)**
  - Add tab switcher to create modal:
    - Tab 1: "New Branch" (existing behavior)
    - Tab 2: "Existing Branch" (new selector)
  - Build branch list component:
    - Local branches section (collapsible)
    - Remote branches section (collapsible)
    - Show branch status icons:
      - ✓ Base branch (not selectable)
      - • Available branch (selectable)
      - ⊗ In worktree (not selectable)
  - Display branch metadata:
    - Last commit message
    - Author and date (relative: "2 days ago")
    - Worktree name (if in use)
  - Add search/filter box:
    - Real-time filtering as user types
    - Search by branch name or commit message
  - Branch selection:
    - Click to select
    - Auto-fill worktree name from branch
    - Show selected branch with clear button

- [ ] **Integration (1 day)**
  - Wire branch selection to worktree creation
  - Handle remote branches:
    - Create local tracking branch automatically
    - Use clean name (strip `origin/` prefix)
  - Update worktree creation API to accept branch parameter
  - Add loading states while fetching branches
  - Add empty states ("No branches found")

- [ ] **Polish (1 day)**
  - Add keyboard navigation (arrow keys, enter)
  - Add tooltips for unavailable branches
  - Responsive design
  - Accessibility (ARIA labels)
  - Branch list caching (refresh every 30s)
  - Add "Refresh" button

**UI Preview**:
```
┌────────────────────────────────────────────────┐
│ Create Worktree                                │
├────────────────────────────────────────────────┤
│ [New Branch] [Existing Branch] ← Tab selector  │
├────────────────────────────────────────────────┤
│ 🔍 Search branches...                          │
├────────────────────────────────────────────────┤
│ 📁 Local Branches (5)                          │
│   ✓ main (base branch)                         │
│   • feature/auth - "Add JWT auth" by tim      │
│   ⊗ feature/ui (in worktree: feature-ui)      │
├────────────────────────────────────────────────┤
│ 🌐 Remote Branches (12)                        │
│   • origin/feature/payments - "Stripe API"    │
│   • origin/feature/notifications              │
└────────────────────────────────────────────────┘
```

**Success Criteria**:
- ✅ Users can browse all available branches
- ✅ Cannot select branches already in worktrees
- ✅ Search filters in <100ms
- ✅ Branch list loads in <500ms
- ✅ Works for both local and remote branches
- ✅ Branch metadata visible (commit, author, date)

**Estimated Effort**: 5-7 days

---

#### 2.8 Branch Cleanup on Deletion

**Reference**: See [FEATURE-BRANCH-CLEANUP.md](FEATURE-BRANCH-CLEANUP.md) for detailed design

**Problem**: When users delete a worktree, the branch remains cluttering local and remote repositories. Manual cleanup requires 4 separate steps.

**Solution**: Add checkbox to worktree deletion dialog: **"Also delete branch"** with smart defaults.

- [ ] **Backend: Branch Cleanup Manager (1-2 days)**
  - Create `scripts/branch-cleanup-manager.mjs`
  - Implement `getBranchStatus(branchName)`:
    - Check if branch is merged into base branch
    - Check if branch exists on remote (GitHub)
    - Check if this is base branch (main/master)
    - Count unmerged commits
    - Return safety status
  - Implement `deleteBranch(branchName, options)`:
    - Delete local branch: `git branch -d` (or `-D` if forced)
    - Delete remote branch via `gh` CLI (preferred)
    - Fallback to `git push origin --delete` if gh unavailable
    - Return detailed results (success/failure per operation)
  - Add `/api/worktrees/:name/branch-status` endpoint
  - Update `/api/worktrees/:name` DELETE endpoint to accept branch deletion options

- [ ] **Frontend: Enhanced Delete Dialog (1-2 days)**
  - Fetch branch status when delete clicked
  - Show branch merge status:
    - ✅ "Branch is merged" (green box)
    - ⚠️ "Branch is NOT merged" (yellow box)
    - ℹ️ "Base branch will be preserved" (blue box)
  - Add checkbox: "Also delete branch"
    - Pre-checked if branch is merged
    - Unchecked by default if unmerged
    - Disabled if base branch
  - Sub-options (when checked):
    - [✓] Delete local branch
    - [✓] Delete on GitHub (if remote exists)
  - Show warnings for unmerged branches:
    - Display unmerged commit count
    - Add danger badge: "dangerous!"
    - Require extra confirmation

- [ ] **Safety Features (built-in)**
  - Base branch protection:
    - Never allow deletion of main/master
    - Disable checkbox, show info message
  - Unmerged commit warnings:
    - Show commit count: "5 unmerged commits"
    - Require double confirmation dialog
    - Use force flag: `git branch -D`
  - Graceful degradation:
    - If gh CLI unavailable, use git commands
    - If remote delete fails, still delete local
    - Show partial success messages

- [ ] **Testing (1 day)**
  - Unit tests for `BranchCleanupManager`:
    - Detect merged vs unmerged branches
    - Detect remote branch existence
    - Delete local branch successfully
    - Delete remote branch via gh and git
  - Integration tests:
    - Delete worktree + merged branch
    - Prevent deletion of unmerged branch without force
    - Prevent base branch deletion
    - Handle GitHub API failures gracefully

**UI Preview**:
```
┌─────────────────────────────────────────────┐
│ Delete Worktree: feature-auth               │
├─────────────────────────────────────────────┤
│ ⚠️  This will permanently delete:           │
│   • Worktree directory                      │
│   • Running containers                      │
│   • Uncommitted changes                     │
│                                             │
│ ✅ Branch is merged into main               │
│                                             │
│ [✓] Also delete branch                     │
│     ├─ [✓] Delete local branch             │
│     └─ [✓] Delete on GitHub                │
│                                             │
│ [ Cancel ]  [ Delete Worktree ]            │
└─────────────────────────────────────────────┘
```

**Success Criteria**:
- ✅ One-click deletion of worktree + branch
- ✅ Base branches cannot be deleted
- ✅ Unmerged branches require confirmation
- ✅ Works with gh CLI and git commands
- ✅ Shows clear merge status indicators
- ✅ Graceful failure handling

**Estimated Effort**: 3-4 days

---

#### 2.9 Basic Sync (Git Updates)

**Reference**: See [FEATURE-SYNC-RELOAD.md](FEATURE-SYNC-RELOAD.md) for full specification (Phase 5 will add smart reload)

**Problem**: Worktrees become stale as main branch advances. Users need manual git commands to stay up to date.

**Solution**: Add "Update from main" button on each worktree card with basic sync functionality.

**Phase 2.9 Scope** (Essential):
- Basic git fetch + merge
- Conflict detection and display
- Manual service restart option
- Rollback capability

**Phase 5 Scope** (Advanced - deferred):
- Smart change detection (docker-compose, package.json, migrations)
- Automatic service restart (only affected services)
- AI-assisted conflict resolution
- Intelligent rollback

- [ ] **Backend: Basic Git Sync (2 days)**
  - Create `scripts/git-sync-manager.mjs` (basic version)
  - Implement `fetchUpstream(worktree)`:
    - Run `git fetch origin`
    - Get base branch (main/master)
    - Return available updates count
  - Implement `syncWithMain(worktree, strategy)`:
    - Strategy: 'merge' (default) or 'rebase'
    - Run git merge/rebase
    - Capture output and conflicts
    - Return status: success/conflicts/error
  - Implement `hasUncommittedChanges(worktree)`:
    - Check `git status --porcelain`
    - Warn user before sync
  - Implement `rollback(worktree)`:
    - Store commit hash before sync
    - Allow `git reset --hard` to previous state
  - Add `/api/worktrees/:name/check-updates` endpoint:
    - Return: `{ hasUpdates: true, commitCount: 5, commits: [...] }`
  - Add `/api/worktrees/:name/sync` endpoint:
    - Accept: `{ strategy: 'merge' | 'rebase' }`
    - Return: `{ success: true/false, conflicts: [...], output: '...' }`

- [ ] **Frontend: Update Button & Dialog (1-2 days)**
  - Add "Update" button to worktree card:
    - Badge showing commit count: "5 updates"
    - Icon changes when updates available
    - Click opens sync dialog
  - Create sync dialog:
    ```
    ┌─────────────────────────────────────────┐
    │ Update: feature-auth                    │
    ├─────────────────────────────────────────┤
    │ 5 new commits from main:                │
    │   • Fix authentication bug              │
    │   • Update dependencies                 │
    │   • Add logging                         │
    │   • ...                                 │
    │                                         │
    │ Strategy: [Merge ▼] [Rebase]           │
    │                                         │
    │ ⚠️  You have uncommitted changes       │
    │ [Stash changes first]                   │
    │                                         │
    │ [ ] Restart services after sync        │
    │                                         │
    │ [ Cancel ]  [ Update Now ]             │
    └─────────────────────────────────────────┘
    ```
  - Handle sync progress:
    - Show spinner during sync
    - Display git output in real-time
    - Handle success/conflict/error states
  - Conflict resolution UI:
    ```
    ┌─────────────────────────────────────────┐
    │ ⚠️  Merge Conflicts                     │
    ├─────────────────────────────────────────┤
    │ 3 files have conflicts:                 │
    │   • src/auth.js                         │
    │   • package.json                        │
    │   • docker-compose.yml                  │
    │                                         │
    │ Options:                                │
    │ • Open terminal to resolve manually     │
    │ • Rollback to previous state           │
    │                                         │
    │ [ Rollback ]  [ Open Terminal ]        │
    └─────────────────────────────────────────┘
    ```
  - Success notification:
    - Show: "Updated successfully. X commits merged."
    - Option to restart services (if checked)
    - Link to view changes

- [ ] **Background Update Check (1 day)**
  - Poll for updates every 5 minutes:
    - Run `/api/worktrees/:name/check-updates`
    - Update badge count on worktree card
    - Show toast notification: "feature-auth: 5 new updates available" (auto-dismiss after 5s)
  - Configurable in `.vibe/config.json`:
    ```json
    {
      "sync": {
        "checkInterval": 300000,  // 5 minutes
        "autoNotify": true,
        "defaultStrategy": "merge"
      }
    }
    ```
  - Disable polling when app in background (performance)
  - Toast notification style:
    - Non-blocking, appears at top-right
    - Auto-dismisses after 5 seconds
    - Click to open sync dialog
    - Can be dismissed manually

- [ ] **Safety Features (built-in)**
  - Pre-sync checks:
    - Warn if uncommitted changes
    - Offer to stash changes first
    - Prevent sync if in middle of merge
  - Rollback support:
    - Store `ORIG_HEAD` before sync
    - One-click rollback on failure
    - Show what will be undone
  - Configurable behavior:
    - Default strategy (merge vs rebase)
    - Auto-stash uncommitted changes
    - Restart services after sync

- [ ] **Testing (1 day)**
  - Unit tests for `GitSyncManager`:
    - Detect available updates
    - Merge successfully
    - Detect conflicts
    - Rollback to previous state
  - Integration tests:
    - Sync worktree with new commits
    - Handle merge conflicts gracefully
    - Rollback after failed sync
    - Restart services after sync

**UI Preview**:
```
┌────────────────────────────────────┐
│ feature-auth              [5 📥]  │  ← Badge shows updates
│ Claude • Running • 2h ago         │
│                                   │
│ [ Logs ] [ Terminal ] [ Update ] │  ← New button
└────────────────────────────────────┘
```

**Success Criteria**:
- ✅ Users can update worktrees with one click
- ✅ Shows available updates count
- ✅ Prevents data loss (uncommitted changes warning)
- ✅ Handles merge conflicts gracefully
- ✅ Rollback works reliably
- ✅ Background polling doesn't impact performance

**What's Deferred to Phase 5**:
- Smart change detection (docker-compose, package.json)
- Automatic service restart (only affected services)
- AI-assisted conflict resolution
- Detailed change analysis

**Estimated Effort**: 4-5 days

---

#### 2.6 Terminal Persistence

**Reference**: See [TERMINAL-PERSISTENCE.md](TERMINAL-PERSISTENCE.md) for detailed design

**Problem**: Terminal state is currently ephemeral - browser refresh, server restart, or worktree pause loses all terminal history, scrollback, and AI agent conversation context.

**Solution**: Implement hybrid approach combining process supervision with state serialization.

- [ ] **Phase 2.6.1**: Process Supervision (Week 1)
  - Create `scripts/worktree-web/pty-pool.mjs`:
    - Keep PTY processes alive across WebSocket disconnections
    - Buffer output for reconnecting clients
    - Support multiple clients per PTY
    - Implement idle cleanup (kill after 1 hour of inactivity)
  - Update WebSocket handler to attach/detach from PTY pool
  - Add PTY statistics endpoint: `/api/pty-stats`
  - Test browser refresh scenarios

- [ ] **Phase 2.6.2**: State Serialization (Week 2)
  - Create `scripts/worktree-web/persistent-pty-manager.mjs`:
    - Save terminal state to `.vibe/sessions/{worktree}/{type}.json`
    - Persist: scrollback (500 lines), command history (100 commands), cwd, env vars
    - Load state on PTY creation
    - Restore command history via `HISTFILE`
  - Implement graceful shutdown handler (save all states)
  - Add session state schema validation
  - Test server restart scenarios

- [ ] **Phase 2.6.3**: Hybrid Integration (Week 3)
  - Create `scripts/worktree-web/hybrid-pty-manager.mjs`:
    - Combine PtyPool + PersistentPtyManager
    - Auto-save state every 60 seconds
    - Restore sessions on server startup
    - Support pause/resume worktrees (kill PTY, save state)
  - Add security: sanitize secrets from saved scrollback
  - Set proper file permissions (0o600) on state files
  - Implement cleanup on worktree deletion

- [ ] **Phase 2.6.4**: UI Integration (Week 3)
  - Show connection state indicators:
    - ● Connected (live PTY)
    - ↻ Reconnecting (restoring from saved state)
    - ⏸ Paused (state saved, resume to restore)
  - Display session info: uptime, last activity, client count
  - Add "Restore session" button for paused worktrees
  - Handle client-side state restoration gracefully

- [ ] **Phase 2.6.5**: Testing (Week 4)
  - Unit tests for PtyPool:
    - PTY reuse on reconnection
    - Buffer management
    - Idle cleanup
    - Multiple client support
  - Unit tests for PersistentPtyManager:
    - State save/load
    - History restoration
    - Secret sanitization
  - Integration tests:
    - Browser refresh preserves session
    - Server restart restores scrollback
    - Pause/resume workflow
    - Worktree deletion cleanup
  - Test with AI agents (Claude, Codex):
    - Long conversation preservation
    - MCP tool state continuity

**Architecture**:
```javascript
class HybridPtyManager {
  constructor() {
    this.pool = new PtyPool();              // Live PTYs
    this.persistence = new PersistentPtyManager();  // Disk state
  }

  async getOrCreatePty(worktree, type, path) {
    // Try live PTY first
    let entry = this.pool.ptys.get(sessionId);

    if (!entry) {
      // Restore from disk if available
      const state = await this.persistence.loadState(sessionId);
      entry = this.pool.getOrCreatePty(sessionId, {
        cwd: state?.cwd || path,
        env: state?.env
      });

      // Restore scrollback
      if (state?.scrollback) {
        entry.buffer.push(...state.scrollback);
      }
    }

    return entry;
  }
}
```

**Behavior Matrix**:
| Event | Result |
|-------|--------|
| Browser refresh | ✅ Instant reconnect to live PTY with full history |
| Server restart | ✅ New PTY, scrollback/history restored from disk |
| Worktree pause | ✅ PTY killed, state saved, resources freed |
| Worktree resume | ✅ New PTY, state restored on client connect |
| Machine reboot | ✅ State persists on disk, restored on next run |

**Resource Impact**:
- Memory: +30MB per live PTY, +10MB state overhead
- Disk: ~100KB per session (`.vibe/sessions/`)
- CPU: +0.5% per live PTY, negligible for state saves

**Success Criteria**:
- ✅ Browser refresh preserves terminal state
- ✅ Server restart restores scrollback and history
- ✅ AI agent conversations survive disconnections
- ✅ Pause/resume frees resources while preserving state
- ✅ No memory leaks from abandoned PTYs
- ✅ Secrets sanitized from saved state
- ✅ 80%+ test coverage for persistence layer

---

## Phase 3: MCP Server Integration

**Objective**: Automatic MCP server management across worktrees and AI agents

### Tasks

#### 3.1 MCP Server Discovery
- [ ] Create `scripts/mcp-manager.mjs`:
  - Scan for MCP server configurations
  - Detect installed MCP servers in project
  - Support standard MCP registry lookups
- [ ] Support MCP server sources:
  - npm packages (`@modelcontextprotocol/server-*`)
  - Local directories (`./mcp-servers/`)
  - Git repositories
  - MCP registry (official + community)

**Success Criteria**: Auto-discover MCP servers in any project

#### 3.2 MCP Installation & Linking
- [ ] Per-worktree MCP configuration:
  - Install MCP servers into worktree's `node_modules`
  - Or use shared global installation
  - Configure Claude Code settings per worktree
- [ ] Create `~/.vibe-worktrees/mcp-cache/` for shared servers
- [ ] Auto-generate `.claude/settings.json` for each worktree:
  ```json
  {
    "mcpServers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"]
      },
      "postgres": {
        "command": "node",
        "args": ["./mcp-servers/postgres-server.js"],
        "env": {
          "DATABASE_URL": "postgresql://localhost:5432/mydb"
        }
      }
    }
  }
  ```
- [ ] UI to enable/disable MCP servers per worktree
- [ ] UI to install new MCP servers from registry

**Success Criteria**: One-click MCP server setup for each worktree

#### 3.3 Cross-Worktree MCP Communication
- [ ] Design MCP bridge for sharing context across worktrees:
  - Read-only access to other worktrees' file systems
  - Query git status across all worktrees
  - Access shared knowledge base
- [ ] Create `mcp-bridge` server:
  ```javascript
  // Tools exposed:
  - list_worktrees()
  - read_file_from_worktree(worktree, path)
  - get_worktree_git_status(worktree)
  - search_across_worktrees(pattern)
  ```
- [ ] Auto-configure bridge for all agents

**Success Criteria**: Agents can access information from other worktrees

#### 3.4 MCP Server Testing
- [ ] Test with official MCP servers:
  - `@modelcontextprotocol/server-filesystem`
  - `@modelcontextprotocol/server-git`
  - `@modelcontextprotocol/server-github`
  - `@modelcontextprotocol/server-postgres`
- [ ] Test with custom MCP servers
- [ ] Document MCP server development guide

**Success Criteria**: Verified working with major MCP servers

---

## Phase 4: Multi-Agent Support

**Objective**: Easy to add and switch between AI agent CLIs

### Tasks

#### 4.1 Agent Abstraction Layer
- [ ] Create `scripts/agents/agent-interface.mjs`:
  ```javascript
  class AgentInterface {
    constructor(name, config) {}

    // Required methods
    async spawn(worktreePath, options) // Returns PTY instance
    getDefaultArgs() // Returns: ['-y', '@package/name']
    needsCacheClear() // Returns: boolean
    getConfigPath(worktreePath) // Returns: .claude/ or .gemini/ etc.

    // Optional methods
    async installDependencies() // Install agent CLI
    async checkVersion() // Returns current version
    async update() // Update to latest
  }
  ```
- [ ] Update `PTYManager` to use `AgentInterface`
- [ ] Remove hardcoded agent logic

**Success Criteria**: Generic agent interface defined and implemented

#### 4.2 Built-in Agent Implementations
- [ ] `scripts/agents/claude-agent.mjs`:
  ```javascript
  class ClaudeAgent extends AgentInterface {
    spawn() {
      return pty.spawn('npx', ['-y', '@anthropic-ai/claude-code@latest'], options);
    }
    getConfigPath() { return '.claude/'; }
  }
  ```
- [ ] `scripts/agents/codex-agent.mjs`:
  ```javascript
  class CodexAgent extends AgentInterface {
    spawn() {
      return pty.spawn('npx', ['-y', '@openai/codex@latest'], options);
    }
  }
  ```
- [ ] `scripts/agents/gemini-agent.mjs`:
  ```javascript
  class GeminiAgent extends AgentInterface {
    spawn() {
      return pty.spawn('npx', ['-y', 'gemini-cli@latest'], options);
    }
    getConfigPath() { return '.gemini/'; }
  }
  ```
- [ ] `scripts/agents/shell-agent.mjs` (no AI, just shell)
- [ ] Agent registry: `scripts/agents/index.mjs`

**Success Criteria**: Claude, Codex, Gemini, and shell all work

#### 4.3 Agent Selection UI
- [ ] Add agent selector to worktree creation:
  - Dropdown with available agents
  - Remember last selection per user
- [ ] Add agent switcher for existing worktrees:
  - Kill current terminal
  - Spawn new agent
  - Preserve history if possible
- [ ] Show agent info in worktree cards:
  - Icon/badge for active agent
  - Agent version number
- [ ] Add agent configuration UI:
  - Edit agent-specific settings
  - Manage API keys
  - Set model preferences

**Success Criteria**: Can create worktrees with any agent, switch agents dynamically

#### 4.4 Agent Documentation
- [ ] Create `docs/adding-agents.md`:
  - How to implement `AgentInterface`
  - Example implementations
  - Testing guide
  - PR submission guidelines
- [ ] Create agent comparison table:
  | Agent | Features | Setup | Cost |
  |-------|----------|-------|------|
  | Claude | ... | ... | ... |
  | Codex | ... | ... | ... |
  | Gemini | ... | ... | ... |

**Success Criteria**: Clear guide for adding new agents

---

## Phase 5: Smart Reload (Advanced Updates)

**Objective**: Intelligent change detection and automatic service restart

**Note**: Basic sync functionality moved to Phase 2.9. This phase adds smart features.

### Tasks

#### 5.1 Smart Change Detection
- [ ] Enhance `scripts/git-sync-manager.mjs` with file analysis:
  ```javascript
  class ChangeDetector {
    async analyzeChanges(worktree, commits) {
      const changedFiles = await this.getChangedFiles(commits);

      return {
        needsServiceRestart: this.detectServiceChanges(changedFiles),
        needsDependencyInstall: this.detectDependencyChanges(changedFiles),
        needsMigration: this.detectMigrations(changedFiles),
        affectedServices: this.getAffectedServices(changedFiles)
      };
    }

    detectServiceChanges(files) {
      return files.some(f =>
        f === 'docker-compose.yml' ||
        f === 'Dockerfile' ||
        f.startsWith('.env')
      );
    }

    detectDependencyChanges(files) {
      return files.some(f =>
        f === 'package.json' ||
        f === 'requirements.txt' ||
        f === 'Gemfile' ||
        f === 'go.mod'
      );
    }

    detectMigrations(files) {
      return files.some(f =>
        f.includes('migrations/') ||
        f.includes('db/migrate/')
      );
    }

    getAffectedServices(files) {
      // Map changed files to services
      // e.g., "src/api/**" → "api" service
    }
  }
  ```
- [ ] Build service dependency graph:
  - Parse docker-compose.yml for `depends_on`
  - Build restart order
- [ ] Add `/api/worktrees/:name/analyze-changes` endpoint

**Success Criteria**: Accurately detects which services need restart

#### 5.2 Automatic Service Restart
- [ ] Restart Docker services if needed:
  - Detect if `docker-compose.yml` changed
  - Detect if `.env` files changed
  - Offer to restart services
- [ ] Reinstall dependencies if needed:
  - Detect if `package.json` changed
  - Run `npm install` automatically
- [ ] Re-sync data if needed:
  - Detect if migrations exist
  - Offer to run migrations
- [ ] Notify agent of updates:
  - Send context to AI agent about changes
  - Suggest reviewing important files

**Success Criteria**: Worktrees stay functional after updates

#### 5.3 AI-Assisted Conflict Resolution
- [ ] Integrate AI agent for conflict help:
  - Send conflict diffs to active AI agent
  - Agent suggests resolution strategies
  - Agent can directly resolve simple conflicts (e.g., package.json version bumps)
- [ ] Smart conflict categorization:
  - Auto-resolve: whitespace, formatting, version bumps
  - Suggest-resolve: simple logic conflicts, config merges
  - Manual-resolve: complex business logic, breaking changes
- [ ] Conflict resolution UI enhancement:
  - Show AI suggestions inline
  - One-click "Accept AI Resolution"
  - "Explain conflict" button for complex cases
- [ ] Add `/api/worktrees/:name/resolve-conflicts` endpoint:
  - Accept conflict files
  - Query AI agent for suggestions
  - Apply resolution if user approves

**Success Criteria**: AI can resolve 60%+ of common conflicts automatically

**Estimated Effort**: 2-3 days (total Phase 5)

---

## Phase 6: Testing & Documentation

**Objective**: Comprehensive tests and user documentation

### Tasks

#### 6.1 Create New Test Suite
- [ ] Test `container-runtime.mjs`:
  - Detect Docker vs Podman correctly
  - Handle sudo requirements for each
  - Execute commands with correct runtime
  - Fallback behavior when runtime not available
- [ ] Test `compose-inspector.mjs`:
  - Parse various docker-compose.yml formats
  - Handle version 2, 3, 3.x
  - Extract services, ports, volumes
  - Work with both Docker and Podman compose formats
- [ ] Test `config-manager.mjs`:
  - Load/save configuration
  - Validation errors
  - Environment variable overrides
- [ ] Test `data-sync.mjs`:
  - Copy volumes between worktrees
  - Handle bind mounts
  - Progress tracking
- [ ] Test `mcp-manager.mjs`:
  - Discover MCP servers
  - Install and configure
  - Cross-worktree communication
- [ ] Test agent implementations:
  - Each agent spawns correctly
  - Configuration paths
  - Version detection
- [ ] Test `git-sync.mjs`:
  - Detect updates
  - Merge strategies
  - Conflict detection
  - Rollback capability
- [ ] Integration tests:
  - Full worktree lifecycle
  - Multi-worktree scenarios
  - Agent switching
  - Update workflows

**Success Criteria**: 80%+ test coverage, all major features tested

#### 6.2 Update Documentation
- [ ] Update `README.md`:
  - Clear value proposition
  - Demo GIF/video
  - Installation instructions:
    - npm/node requirements
    - Docker OR Podman (user's choice)
    - git installation
    - Platform-specific notes (macOS, Linux, Windows/WSL)
  - Quick start (5 minutes)
  - Feature showcase (highlight Docker + Podman support)
  - FAQ (include Podman questions)
  - Troubleshooting (Docker vs Podman issues)
- [ ] Update `CLAUDE.md`:
  - Remove project-riftwing references
  - Add new architecture sections
  - Document MCP integration
  - Document agent system
  - Update testing instructions
- [ ] Create `docs/` directory:
  - `configuration.md`: Config file reference
  - `mcp-integration.md`: MCP setup guide
  - `adding-agents.md`: Agent development guide
  - `container-runtimes.md`: Docker and Podman support
  - `docker-support.md`: Docker Compose requirements
  - `podman-support.md`: Podman and podman-compose specifics
  - `git-sync.md`: Update strategies explained
  - `architecture.md`: System design deep-dive
  - `api.md`: WebSocket API reference
- [ ] Create video tutorials:
  - Installation and first run
  - Creating worktrees
  - Using MCP servers
  - Switching AI agents
  - Updating worktrees

**Success Criteria**: New user can get started in 5 minutes

#### 6.3 Error Handling & UX
- [ ] Improve error messages:
  - No docker-compose.yml found
  - Docker not running
  - Port conflicts
  - Git errors
  - MCP server failures
  - Agent spawn failures
- [ ] Add loading states:
  - Worktree creation progress
  - Docker service startup
  - Data copy operations
  - Update operations
- [ ] Add success confirmations:
  - Worktree created
  - Services started
  - Updates applied
  - Agent switched
- [ ] Add undo capabilities:
  - Delete worktree → restore with warning
  - Failed update → rollback
  - Service restart → revert to previous state

**Success Criteria**: Clear, actionable error messages; no silent failures

---

## Phase 7: Polish & Release

**Objective**: Production-ready release

### Tasks

#### 7.1 Performance Optimization
- [ ] Optimize Docker operations:
  - Parallel service startups where safe
  - Cache docker-compose parsing
  - Lazy-load service status
- [ ] Optimize data copying:
  - Stream large volumes
  - Skip unchanged files
  - Compress during transfer
- [ ] Optimize web UI:
  - Lazy-load terminals
  - Virtual scrolling for logs
  - Debounce status updates
  - WebSocket message batching

**Success Criteria**: Creates worktree in <30s, responsive UI

#### 7.2 Security Hardening
- [ ] Secure WebSocket connections:
  - Add authentication token
  - CORS configuration
  - Rate limiting
- [ ] Secure Docker operations:
  - Validate service names
  - Sanitize environment variables
  - Limit sudo commands
- [ ] Secure file operations:
  - Validate paths (prevent traversal)
  - Check permissions
  - Sandbox MCP servers
- [ ] Secure agent credentials:
  - Encrypt API keys at rest
  - Use OS keychain when available
  - Never log credentials

**Success Criteria**: No security vulnerabilities in automated scan

#### 7.3 Monitoring & Logging
- [ ] Structured logging:
  - Use standard log levels
  - JSON format for programmatic parsing
  - Rotate log files
- [ ] Add telemetry (opt-in):
  - Track feature usage
  - Collect error reports
  - Performance metrics
- [ ] Add health checks:
  - `/health` endpoint
  - Check Docker connection
  - Check git repository
  - Check disk space

**Success Criteria**: Easy to diagnose issues from logs

#### 7.4 CI/CD Setup
- [ ] GitHub Actions workflows:
  - Run tests on PR
  - Run linter
  - Check for security vulnerabilities
  - Build and publish Docker image
- [ ] Automated releases:
  - Semantic versioning
  - Changelog generation
  - Release notes
  - npm publish (if applicable)
- [ ] Docker image:
  - Multi-stage build
  - Minimal base image
  - Health checks
  - Publish to GitHub Container Registry

**Success Criteria**: Automated testing and releases

---

## Phase 8: Advanced Features (Future)

**Objective**: Nice-to-have features for v2.0

### Potential Features

- [ ] **Team Collaboration**:
  - Share worktrees with team members
  - Remote agent access via WebSockets
  - Collaborative debugging sessions

- [ ] **Cloud Integration**:
  - Deploy worktrees to cloud VMs
  - Remote Docker hosts
  - Kubernetes support

- [ ] **Advanced MCP**:
  - MCP server marketplace
  - Custom MCP server generator
  - MCP server performance monitoring

- [ ] **Agent Orchestration**:
  - Multi-agent workflows
  - Agent hand-offs
  - Agent collaboration patterns

- [ ] **Analytics**:
  - Development time tracking
  - Agent effectiveness metrics
  - Bottleneck analysis

- [ ] **VS Code Extension**:
  - Native integration
  - Direct worktree management
  - Agent status in sidebar

---

## Migration Checklist

### Pre-Migration
- [ ] Backup project-riftwing worktree setup
- [ ] Document current workflow
- [ ] Export worktree configurations
- [ ] Save port allocations

### During Migration
- [ ] Follow phases in order
- [ ] Test after each phase
- [ ] Keep old version running until validated
- [ ] Document any issues encountered

### Post-Migration
- [ ] Verify all worktrees work
- [ ] Verify all agents work
- [ ] Verify MCP servers work
- [ ] Verify updates work
- [ ] Archive old project-riftwing version

---

## Success Metrics

### Technical
- ✓ Zero hardcoded project assumptions
- ✓ Works with any docker-compose project
- ✓ 3+ AI agents supported
- ✓ MCP servers auto-configured
- ✓ 80%+ test coverage
- ✓ <30s worktree creation time

### User Experience
- ✓ 5-minute setup for new users
- ✓ Clear error messages
- ✓ No silent failures
- ✓ Responsive UI (<100ms interactions)

### Adoption
- ✓ GitHub stars > 50 (6 months)
- ✓ Active community discussions
- ✓ External contributions
- ✓ Documentation clarity rating > 4/5

---

## Risk Management

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing workflows | High | Keep old version running during transition |
| Docker compatibility issues | Medium | Test with multiple Docker versions (20.x, 24.x, 25.x) |
| Podman compatibility issues | Medium | Test with Podman 4.x and 5.x, handle command differences |
| Docker vs Podman behavior differences | High | Comprehensive testing, runtime abstraction layer |
| Agent CLI changes | Medium | Version pinning, graceful degradation |
| MCP specification changes | Medium | Follow MCP working group updates |
| Security vulnerabilities | High | Regular security audits, dependency updates |
| Performance with many worktrees | Medium | Lazy loading, virtualization |
| Cross-platform issues | Medium | Test on macOS, Linux, Windows (WSL) |
| Rootless Podman permission issues | Low | Auto-detect and configure, clear error messages |

---

## Timeline Estimate

| Phase | Estimated Time | Dependencies |
|-------|----------------|--------------|
| Phase 1: Cleanup | 1-2 days | None |
| Phase 2: Agnostic | 16-21 days | Phase 1 |
| ├─ 2.1-2.5: Core Features | 3-5 days | |
| ├─ 2.6: Terminal Persistence | 4-5 days | 2.1-2.5 |
| ├─ 2.7: Branch Selector | 5-7 days | 2.1-2.5 |
| └─ 2.8: Branch Cleanup | 3-4 days | 2.1-2.5 |
| Phase 3: MCP | 5-7 days | Phase 2 |
| Phase 4: Agents | 3-4 days | Phase 2 |
| Phase 5: Updates | 2-3 days | Phase 2 |
| Phase 6: Testing | 3-4 days | All previous |
| Phase 7: Polish | 2-3 days | All previous |
| **Total** | **32-44 days** | Sequential |

**Realistic Timeline**: 6-9 weeks with testing and iteration

---

## Next Steps

1. **Review this plan** with team/stakeholders
2. **Prioritize phases** if timeline needs compression
3. **Set up new GitHub repo** (Phase 1.3)
4. **Begin Phase 1** cleanup tasks
5. **Daily standups** to track progress
6. **Weekly demos** to validate direction

---

## Notes & Decisions

### Architectural Decisions

**Decision**: Web-only interface (no tmux CLI)
- **Rationale**: Web UI is more accessible, easier to maintain, better UX
- **Trade-off**: Loses terminal purists, but gains broader audience

**Decision**: Support both Docker and Podman
- **Rationale**: Podman is increasingly popular, especially for rootless containers
- **Benefits**: Broader platform support, security benefits of rootless, no daemon required
- **Trade-off**: More testing surface, need to handle behavior differences

**Decision**: Runtime abstraction layer
- **Rationale**: Hide Docker vs Podman differences behind unified interface
- **Benefits**: Code stays clean, easy to add more runtimes in future
- **Trade-off**: Extra abstraction layer, but worth it for maintainability

**Decision**: File-based configuration (`.vibe/config.json`)
- **Rationale**: Easy to edit, version control, share across team
- **Trade-off**: Could use database, but adds complexity

**Decision**: Shared port registry (`~/.vibe-worktrees/ports.json`)
- **Rationale**: Prevents conflicts across all projects
- **Trade-off**: Global state, but worth it for safety

**Decision**: MCP bridge for cross-worktree access
- **Rationale**: Enables powerful agent collaboration
- **Trade-off**: Security implications, needs careful sandboxing

### Open Questions

- [ ] **License**: MIT vs Apache 2.0?
- [ ] **Name**: Keep "Vibe Worktrees" or rebrand?
- [ ] **Pricing**: Free open source vs paid team features?
- [ ] **Support**: Discord vs GitHub Discussions?
- [ ] **Hosting**: Self-hosted only vs cloud offering?

---

## Appendix

### File Changes Summary

**Files to Delete**:
- `scripts/worktree-manager.mjs`
- `scripts/worktree-manager.test.mjs`
- `scripts/worktree-manager.test.README.md`

**Files to Create**:
- `scripts/container-runtime.mjs`
- `scripts/compose-inspector.mjs`
- `scripts/config-manager.mjs`
- `scripts/data-sync.mjs`
- `scripts/branch-manager.mjs` (branch selector)
- `scripts/branch-cleanup-manager.mjs` (branch cleanup)
- `scripts/worktree-web/pty-pool.mjs` (terminal persistence)
- `scripts/worktree-web/persistent-pty-manager.mjs` (terminal persistence)
- `scripts/worktree-web/hybrid-pty-manager.mjs` (terminal persistence)
- `scripts/worktree-web/public/js/branch-selector.js` (branch selector UI)
- `scripts/mcp-manager.mjs`
- `scripts/git-sync.mjs`
- `scripts/agents/agent-interface.mjs`
- `scripts/agents/claude-agent.mjs`
- `scripts/agents/codex-agent.mjs`
- `scripts/agents/gemini-agent.mjs`
- `scripts/agents/shell-agent.mjs`
- `scripts/agents/index.mjs`
- `.vibe/config.json` (template)
- `docs/configuration.md`
- `docs/mcp-integration.md`
- `docs/adding-agents.md`
- `docs/container-runtimes.md`
- `docs/docker-support.md`
- `docs/podman-support.md`
- `docs/git-sync.md`
- `docs/terminal-persistence.md`
- `docs/architecture.md`
- `docs/api.md`

**Files to Modify**:
- `scripts/port-registry.mjs` (make service-agnostic)
- `scripts/worktree-web/server.mjs` (major refactor)
- `scripts/worktree-web/public/index.html` (UI enhancements)
- `scripts/worktree-web/public/js/*.js` (UI logic updates)
- `package.json` (update scripts, deps)
- `CLAUDE.md` (full rewrite)
- `README.md` (full rewrite)

### Reference Links

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Docker Compose File Reference](https://docs.docker.com/compose/compose-file/)
- [Podman Documentation](https://docs.podman.io/)
- [podman-compose](https://github.com/containers/podman-compose)
- [Docker vs Podman](https://docs.podman.io/en/latest/Introduction.html#comparison-with-docker)
- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [Claude Code CLI](https://github.com/anthropics/claude-code)
- [WebSocket Protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

---

**Document Version**: 1.4
**Last Updated**: 2025-10-27
**Maintained By**: Project Team

**Latest Updates**:
- Added Phase 2.9 - Basic Sync (git fetch/merge, conflict detection, rollback)
- Split sync functionality: Phase 2.9 (basic) + Phase 5 (smart reload)
- Phase 5 renamed to "Smart Reload (Advanced Updates)"
- Phase 5 reduced to 2-3 days (was 5-7 days)
- Added Phase 5.3 - AI-Assisted Conflict Resolution
- Changed update notifications from popups to toast (non-intrusive)
- Added Phase 2.6 - Terminal Persistence (hybrid approach)
- Added Phase 2.7 - Branch Selector UI (browse existing branches)
- Added Phase 2.8 - Branch Cleanup on Deletion (delete branches with worktrees)
- Updated timeline: 6-9 weeks (was 4-6 weeks)
