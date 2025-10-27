# Vibe Worktrees: Planning Summary

**Complete Planning Documentation**
**Date**: 2025-10-26
**Status**: Planning Complete - Ready for Implementation

---

## Overview

We've completed comprehensive planning for transforming the project-riftwing worktree manager into a standalone, production-ready tool. This document ties together all planning artifacts and provides clear next steps.

---

## Planning Documents Created

### 1. **REFACTORING-PLAN.md** (Main Plan)
**Purpose**: 8-phase implementation roadmap
**Scope**: Complete refactoring from project-specific to generic tool

**Key Phases**:
- Phase 1: Cleanup & repository setup
- Phase 2: Make codebase-agnostic (Docker + Podman support)
- Phase 3: MCP server integration (centralized architecture)
- Phase 4: Multi-agent support
- Phase 5: Automatic updates
- Phase 6: Testing & documentation
- Phase 7: Polish & release
- Phase 8: Advanced features (future)

**Timeline**: 6-9 weeks
**Status**: ✅ Complete

### 2. **FEATURE-SYNC-RELOAD.md** (Feature Spec)
**Purpose**: Detailed specification for sync & reload button
**Features**:
- One-click sync with main branch
- Intelligent service restart detection
- Merge conflict handling with AI assistance
- Progress tracking and rollback

**Components**:
- Backend: `SyncReloadManager`, `ChangeDetector`
- Frontend: Progress modal, conflict dialog, status badges
- WebSocket API: Real-time updates

**Status**: ✅ Ready for implementation

### 3. **CRITICAL-FEATURES.md** (GPT-5 Analysis)
**Purpose**: Features identified as critical before implementation
**Source**: Expert security and architecture review

**Priority Features**:
1. **Compose config rendering** (CRITICAL) - Use `docker compose config` not raw YAML
2. **Volume namespacing** (HIGH) - Prevent data conflicts
3. **Worktree profiles** (HIGH) - Light vs full stack
4. **Resource budgeting** (MEDIUM) - Prevent saturation
5. **Pause/resume** (MEDIUM) - Free resources without teardown
6. **Agent sandboxing** (HIGH) - Security critical
7. **Undo/recovery** (HIGH) - Safety net

**Status**: ✅ Prioritized, integrated into main plan

### 4. **SECURITY-DESIGN.md** (Security Architecture)
**Purpose**: Comprehensive security model and threat mitigation
**Components**:
- Agent sandboxing (directory allowlist, command validation)
- MCP server architecture (centralized with validation layer)
- Container security (rootless, capability dropping)
- WebSocket security (auth, CSRF, rate limiting)
- Secrets management (OS keychain)
- Audit logging

**Threat Model**: Addresses malicious AI, MCP servers, privilege escalation
**Status**: ✅ Complete, ready for Phase 4 implementation

### 5. **MCP-ARCHITECTURE.md** (MCP Design) ⭐ **NEW**
**Purpose**: Centralized MCP server architecture
**Decision**: One MCP instance per type, shared across all worktrees

**Rationale**:
- 87% resource savings vs per-worktree approach
- Acceptable security trade-off for local single-user environment
- Validation layer provides security at application level

**Components**:
- `MCPServerManager` - Starts and manages shared MCP servers
- `MCPRequestValidator` - Validates paths, methods, rate limits
- `RateLimiter` - Per-worktree rate limiting
- MCP Proxy - Routes agent requests to centralized servers

**Status**: ✅ Approved for implementation

### 6. **TERMINAL-PERSISTENCE.md** (Feature Design) ⭐ **NEW**
**Purpose**: Terminal state preservation across disconnections
**Decision**: Hybrid approach combining process supervision with state serialization

**Features**:
- Browser refresh → Instant reconnect to live PTY
- Server restart → Restore scrollback and history from disk
- Worktree pause/resume → Save/restore state, free resources
- AI agent continuity → Long conversations preserved

**Components**:
- `PtyPool` - Keep PTYs alive, buffer output for reconnections
- `PersistentPtyManager` - Save/restore terminal state to disk
- `HybridPtyManager` - Combine both approaches

**Benefits**:
- +30MB per live PTY, +10MB state overhead
- ~100KB per session on disk
- No external dependencies (pure Node.js)
- Cross-platform (macOS, Linux, Windows)

**Status**: ✅ Design approved, ready for Phase 2.6 implementation

### 7. **FEATURE-BRANCH-SELECTOR.md** (Feature Design) ⭐ **NEW**
**Purpose**: Browse and select existing branches when creating worktrees
**Decision**: Full modal with branch list, search, and metadata

**Features**:
- Browse all local and remote branches
- Filter out branches already in worktrees
- Show branch metadata (last commit, author, date)
- Real-time search/filtering
- One-click selection with auto-fill worktree name

**Components**:
- `BranchManager` - List branches, check availability, get metadata
- `/api/branches` endpoint - Return filtered branch list
- Branch selector UI - Tab-based modal with search

**Benefits**:
- No more typos in branch names
- Can't accidentally use branch already in worktree
- See which branches are available at a glance
- Better discovery of existing work

**Status**: ✅ Design approved, ready for Phase 2.7 implementation

### 8. **FEATURE-BRANCH-CLEANUP.md** (Feature Design) ⭐ **NEW**
**Purpose**: Delete branches when closing/deleting worktrees
**Decision**: Checkbox in delete dialog with smart defaults based on merge status

**Features**:
- One-click deletion of worktree + branch
- Smart defaults: pre-checked if merged, unchecked if unmerged
- Base branch protection (main/master cannot be deleted)
- Unmerged commit warnings with confirmation
- Delete local and/or remote (GitHub) branches

**Components**:
- `BranchCleanupManager` - Check merge status, delete branches
- `/api/worktrees/:name/branch-status` endpoint - Return safety info
- Enhanced delete modal with branch deletion options

**Benefits**:
- Reduces 4 manual steps to 1 click
- Prevents branch clutter over time
- Safe defaults prevent data loss
- Works with GitHub via gh CLI or git commands

**Status**: ✅ Design approved, ready for Phase 2.8 implementation

### 9. **CLAUDE.md** (Current Architecture)
**Purpose**: Documentation for AI agents working on the codebase
**Content**:
- Current architecture overview
- Common commands and workflows
- Testing patterns (TDD approach)
- Code organization principles
- Development patterns

**Status**: ✅ Baseline documented, will be updated during refactoring

---

## Key Decisions Made

### Architecture

**1. Web-Only Interface**
- ✅ **Decision**: Remove tmux CLI, keep only web interface
- **Rationale**: Better accessibility, easier maintenance, broader audience
- **Trade-off**: Loses terminal purists, but gains mainstream users

**2. Docker + Podman Support**
- ✅ **Decision**: Support both container runtimes via abstraction layer
- **Rationale**: Broader platform support, Podman's security benefits (rootless)
- **Implementation**: `ContainerRuntime` class with unified interface

**3. Compose Config Rendering**
- ✅ **Decision**: ALWAYS use `docker compose config` output, never parse raw YAML
- **Rationale**: Handles includes, profiles, x-anchors, env interpolation correctly
- **Critical**: This prevents brittle service detection

**4. Agent Sandboxing**
- ✅ **Decision**: Directory allowlist + command validation + user confirmation
- **Rationale**: Balance AI autonomy with security
- **Implementation**: `AgentSandbox` wrapper around all agent operations

**5. MCP Server Architecture** ⭐ **UPDATED**
- ✅ **Decision**: Centralized MCP servers, one instance per type shared across all worktrees
- **Rationale**: 87% resource savings, acceptable risk for local single-user environment
- **Security**: Validation layer (path validation, rate limiting, method allowlists, audit logging)
- **Implementation**: `MCPServerManager` with request validator and rate limiter

### Features

**6. Worktree Profiles**
- ✅ **Decision**: Support light/full/custom profiles to control which services run
- **Rationale**: Prevent resource saturation with many worktrees
- **User Story**: "I only need API + DB for this feature, not the full stack"

**7. Smart Reload**
- ✅ **Decision**: Conservative initially, detect docker-compose/package.json changes
- **Rationale**: Better to restart too much than miss a required restart
- **Evolution**: Learn which files affect which services over time

**8. Volume Namespacing**
- ✅ **Decision**: Unique `COMPOSE_PROJECT_NAME` per worktree
- **Rationale**: Prevent volume conflicts and data corruption
- **Implementation**: `vibe-{worktreeName}` prefix

**9. Terminal Persistence** ⭐ **NEW**
- ✅ **Decision**: Hybrid approach (process supervision + state serialization)
- **Rationale**: Best of both worlds - instant reconnection + survives restarts
- **Implementation**: `HybridPtyManager` combining `PtyPool` and `PersistentPtyManager`
- **Benefits**:
  - Browser refresh → Instant reconnect to live PTY
  - Server restart → Restore scrollback/history from disk
  - Pause/resume → Free resources while preserving state
  - AI agent continuity → Long conversations survive disconnections
- **Trade-offs**: More complexity than state-only, but provides better UX

---

## Critical Path Items

### Must Do Before Phase 2
1. ✅ Remove tmux CLI interface completely
2. ✅ Implement `ContainerRuntime` abstraction (Docker + Podman)
3. ✅ Implement `ComposeInspector` using `docker compose config`
4. ✅ Add volume namespacing with `COMPOSE_PROJECT_NAME`

### Must Do Before Phase 4 (Security)
5. ✅ Implement `AgentSandbox` with directory allowlist
6. ✅ Add command validation and rate limiting
7. ✅ Implement user confirmation flow
8. ✅ Add audit logging

### Must Do Before Phase 7 (Release)
9. ✅ External security audit
10. ✅ Penetration testing on agent sandbox
11. ✅ Comprehensive test coverage (80%+)
12. ✅ Documentation for users and developers

---

## Open Questions for User

**Priority**: Please answer to finalize implementation approach

### 1. Primary OS Targets (Priority Order)
**Question**: Which platforms should we optimize for first?
**Options**:
- [ ] macOS (developer machines)
- [ ] Linux (servers, developer machines)
- [ ] Windows/WSL2 (enterprise developers)

**Recommendation**: macOS → Linux → Windows/WSL2

### 2. Windows Support
**Question**: Require WSL2 for Windows, or support native Windows?
**Options**:
- [ ] Require WSL2 (simpler, better compatibility)
- [ ] Support native Windows (more complex, more users)

**Recommendation**: Require WSL2 initially, add native Windows later

### 3. Default Sync Strategy
**Question**: Should sync & reload use merge or rebase by default?
**Options**:
- [ ] Merge (safer, preserves history)
- [ ] Rebase (cleaner history, more conflicts)
- [ ] User choice per repo (configurable)

**Recommendation**: Merge by default, configurable per repo

### 4. Trust Boundary
**Question**: Single-user local only, or multi-user shared host?
**Options**:
- [ ] Single-user local only (simpler security model)
- [ ] Multi-user shared host (needs auth/RBAC)

**Recommendation**: Single-user local initially, add multi-user in v2

### 5. AI/MCP Execution Environment
**Question**: Should AI agents and MCP servers run on host or in containers?
**Options**:
- [ ] On host (simpler, faster)
- [ ] In containers (more secure, isolated)
- [ ] Hybrid (agents on host, MCP in containers)

**Recommendation**: Hybrid - agents on host (for performance), MCP in containers (for security)

### 6. Typical Repository Size
**Question**: What repo sizes should we optimize for?
**Options**:
- [ ] Small (< 1GB, < 10k files)
- [ ] Medium (1-10GB, 10-100k files)
- [ ] Large (> 10GB, > 100k files)

**Recommendation**: Optimize for medium, test with large

### 7. Tech Stack Priority
**Question**: Which stacks should we optimize first?
**Options** (select 2-3):
- [ ] Node.js/Next.js
- [ ] Python/Django
- [ ] Go
- [ ] Java/Spring Boot
- [ ] Ruby/Rails

**Recommendation**: Node.js + Python (most common for AI development)

---

## Risk Assessment

### High-Risk Areas (Extra Testing Required)

**1. Smart Reload Logic**
- **Risk**: Incorrect restart decisions cause downtime or stale state
- **Mitigation**: Conservative defaults, extensive testing, user override

**2. Docker/Podman Parity**
- **Risk**: Behavior differences cause failures on specific runtime
- **Mitigation**: Test matrix, runtime capability detection, graceful degradation

**3. Volume Snapshot/Restore**
- **Risk**: Data corruption, slow copies, disk space issues
- **Mitigation**: Validate snapshots, stream large files, disk space checks

**4. Agent Security**
- **Risk**: Sandbox escape, data exfiltration, destructive operations
- **Mitigation**: Multiple validation layers, audit logging, user confirmation

**5. MCP Server Trust**
- **Risk**: Malicious third-party code execution
- **Mitigation**: Container isolation, network policy, resource limits, signature verification

---

## Success Metrics

### Technical Metrics
- ✅ Zero hardcoded project assumptions
- ✅ Works with any docker-compose.yml
- ✅ 3+ AI agents supported
- ✅ MCP servers auto-configured
- ✅ 80%+ test coverage
- ✅ < 30s worktree creation time

### User Experience Metrics
- ✅ 5-minute setup for new users
- ✅ Clear error messages
- ✅ No silent failures
- ✅ < 100ms UI response time

### Security Metrics
- ✅ Zero critical vulnerabilities
- ✅ All destructive ops require confirmation
- ✅ Audit log for all security events
- ✅ Secrets never in plaintext

### Adoption Metrics (6 months)
- ✅ GitHub stars > 50
- ✅ Active community discussions
- ✅ External contributions
- ✅ Documentation rating > 4/5

---

## Next Steps

### Immediate (This Week)
1. **User Decision**: Answer open questions above
2. **Repo Setup**: Create private GitHub repo `vibe-worktrees`
3. **Phase 1 Start**: Remove tmux CLI interface
4. **Audit**: Complete project-riftwing reference audit

### Week 2-5 (Phase 2)
5. **Container Runtime**: Implement Docker/Podman abstraction
6. **Compose Inspector**: Implement with `docker compose config`
7. **Configuration**: Create `.vibe/config.json` system
8. **Volume Namespacing**: Implement `COMPOSE_PROJECT_NAME`
9. **Terminal Persistence**: Implement hybrid PTY manager (4-5 days)
10. **Branch Selector**: Implement branch browser UI (5-7 days)
11. **Branch Cleanup**: Delete branches with worktrees (3-4 days)

### Week 6-7 (Phase 3-4)
12. **MCP Integration**: Auto-discovery and installation
13. **Agent System**: Pluggable agent interface
14. **Security**: Implement sandboxing and audit logging

### Week 8 (Phase 5-6)
15. **Git Sync**: Automatic updates with smart reload
16. **Testing**: Achieve 80%+ coverage
17. **Documentation**: Update all docs

### Week 9-10 (Phase 7)
18. **Polish**: Performance optimization
19. **Security Audit**: External review
20. **CI/CD**: Automated testing and releases
21. **Launch**: Beta release

---

## Starting Implementation

### For AI Agents

**To begin Phase 1**:
```
Start Phase 1 of REFACTORING-PLAN.md.

Task 1.1: Remove tmux CLI Interface
- Delete scripts/worktree-manager.mjs
- Delete scripts/worktree-manager.test.mjs
- Delete scripts/worktree-manager.test.README.md
- Update package.json to remove CLI scripts
- Keep only web interface

Follow TDD principles. Run tests after each change.
```

### For Manual Work

**Repository Setup**:
1. Create new private GitHub repo: `vibe-worktrees`
2. Copy cleaned files (without tmux artifacts)
3. Initial commit with planning documents
4. Set up branch protection on `main`
5. Enable GitHub Actions

**First PR**:
- Title: "Phase 1: Remove tmux CLI interface"
- Description: Link to REFACTORING-PLAN.md Phase 1
- Include: Deleted files, updated package.json, updated docs
- Tests: Verify web interface still works

---

## Resources

### Planning Documents
- **REFACTORING-PLAN.md**: Main 8-phase plan
- **FEATURE-SYNC-RELOAD.md**: Sync & reload specification
- **FEATURE-BRANCH-SELECTOR.md**: Branch browser/selector UI design
- **FEATURE-BRANCH-CLEANUP.md**: Branch cleanup on worktree deletion
- **CRITICAL-FEATURES.md**: Must-have features from expert review
- **SECURITY-DESIGN.md**: Security architecture and threat model
- **MCP-ARCHITECTURE.md**: Centralized MCP server design
- **TERMINAL-PERSISTENCE.md**: Terminal state persistence design
- **CLAUDE.md**: Current architecture documentation

### Reference Materials
- [Docker Compose Config](https://docs.docker.com/compose/reference/config/)
- [Podman Compose](https://github.com/containers/podman-compose)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Git Worktree Docs](https://git-scm.com/docs/git-worktree)

### External Analysis
- **GPT-5 Review**: Comprehensive feedback on architecture, security, and features
- **Continuation ID**: `2d1f4df7-912f-4697-a8d1-6764ff0c1d0f` (for follow-up questions)

---

## Questions or Concerns?

**Before starting implementation**:
1. Review all planning documents
2. Answer open questions above
3. Raise any concerns or alternative approaches
4. Get alignment on priorities

**During implementation**:
- Follow the phases sequentially
- Don't skip security considerations
- Test continuously (TDD approach)
- Update planning docs if you discover issues

---

## Summary

We have a **comprehensive, battle-tested plan** incorporating:
- ✅ Expert security review (GPT-5)
- ✅ Detailed implementation phases
- ✅ Feature specifications with TDD tests
- ✅ Security architecture and threat model
- ✅ Risk mitigation strategies
- ✅ Clear success metrics

**The plan is solid. Time to build.** 🚀

---

**Document Version**: 1.3
**Last Updated**: 2025-10-27
**Status**: Planning Complete ✅
**Next Milestone**: Phase 1 - Cleanup & Repository Setup

**Latest Updates**:
- Added terminal persistence feature (hybrid approach) to Phase 2.6
- Added branch selector UI feature to Phase 2.7
- Added branch cleanup on deletion feature to Phase 2.8
- Updated timeline: 6-9 weeks (was 5-7 weeks)
