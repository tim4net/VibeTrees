# Terminal UX: Persistence & Session Management

**Status**: Design Complete - Ready for Phase 2.6 Implementation
**Priority**: CRITICAL - Core UX requirement
**Effort**: 11-12 days

---

## Problem Statement

Current terminal implementation has critical UX gaps:

1. **No way to reopen closed terminals** - User closes tab by accident, loses AI conversation
2. **Browser crash/update loses context** - All terminals appear gone, no recovery UI
3. **Unclear what "close" means** - Does it kill the PTY or just hide it?
4. **No visibility into running terminals** - Can't see detached terminals

**User Impact**: Frustrating, breaks flow, loses work

---

## Solution Architecture

### Three-Layer Persistence

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: PTY Process Survival (server-side)            │
│  - PTYs stay alive when browser disconnects             │
│  - Scrollback buffered in memory                        │
│  - Auto-cleanup after TTL                               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Terminal Registry (server-side)               │
│  - Track all PTYs per worktree                          │
│  - Status: connected/detached/starting/dead             │
│  - Metadata: type, created, last activity               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 3: UI Session State (client + server)            │
│  - localStorage: which terminals were open              │
│  - Server backup: validate against alive PTYs           │
│  - Recovery modal on startup                            │
└─────────────────────────────────────────────────────────┘
```

---

## Detailed Design

### 1. Terminal Registry (Server-Side)

**Location**: `scripts/worktree-web/terminal-registry.mjs`

```javascript
class TerminalRegistry {
  constructor() {
    // Map: worktreeName -> Map<terminalId, TerminalInfo>
    this.terminals = new Map();
  }

  register(worktreeName, terminalId, info) {
    // info: { type, pty, status, created, lastActivity }
  }

  get(worktreeName, terminalId) { }

  list(worktreeName) {
    // Returns all terminals for a worktree
  }

  updateStatus(worktreeName, terminalId, status) {
    // Status: 'connected' | 'detached' | 'starting' | 'dead'
  }

  updateActivity(worktreeName, terminalId) {
    // Touch lastActivity timestamp
  }

  cleanup(ttl = 3600000) {
    // Kill detached terminals older than TTL (default 1 hour)
    // Exclude AI agents or use longer TTL (24h)
  }

  serialize() {
    // For persistence across server restarts
  }

  deserialize(data) { }
}
```

**Storage**: `~/.vibe-worktrees/terminal-registry.json`

```json
{
  "feature-auth": {
    "claude-1698765432": {
      "type": "claude",
      "status": "detached",
      "created": "2025-10-27T10:30:00Z",
      "lastActivity": "2025-10-27T10:35:00Z",
      "ttl": 86400000
    },
    "shell-1698765555": {
      "type": "shell",
      "status": "connected",
      "created": "2025-10-27T10:32:00Z",
      "lastActivity": "2025-10-27T10:40:00Z",
      "ttl": 3600000
    }
  }
}
```

**Auto-cleanup Task**:
- Runs every 5 minutes
- Warns user 5 minutes before cleanup (via WebSocket)
- User can "keep alive" from notification

---

### 2. PTY Lifecycle States

```
┌─────────┐
│ Created │ (new PTY spawned)
└────┬────┘
     │
     v
┌───────────┐
│ Connected │ (browser actively viewing)
└─────┬─────┘
      │
      ├─ Browser closes tab
      │
      v
┌───────────┐
│ Detached  │ (PTY alive, no browser connected)
└─────┬─────┘
      │
      ├─ TTL expires OR user kills
      │
      v
┌──────────┐
│   Dead   │ (PTY terminated, can't reopen)
└──────────┘
```

**Actions**:
- **Detach** (default): Close UI, PTY stays alive
  - Click `×` on terminal tab
  - Browser crashes
  - Browser refresh

- **Kill** (explicit): Destroy PTY permanently
  - Right-click → "Kill Terminal"
  - Confirmation modal
  - Or auto after TTL expires

---

### 3. UI Session State Persistence

**Client-Side (localStorage)**:

```javascript
// Key: vibe-session-{repoHash}
{
  "sessionId": "uuid-v4",
  "timestamp": "2025-10-27T10:40:00Z",
  "version": "1.0",
  "worktrees": [
    {
      "name": "feature-auth",
      "activeTab": "terminals",
      "openTerminals": [
        {
          "id": "claude-1698765432",
          "type": "claude",
          "visible": true,
          "order": 0
        },
        {
          "id": "shell-1698765555",
          "type": "shell",
          "visible": false,
          "order": 1
        }
      ],
      "layout": {
        "terminalHeight": 400,
        "sidebarWidth": 250
      }
    }
  ],
  "activeWorktree": "feature-auth",
  "activeTerminal": "claude-1698765432"
}
```

**Server-Side Backup**: Same structure in `~/.vibe-worktrees/ui-sessions/{sessionId}.json`

**Sync Strategy**:
- Save to localStorage on every change (debounced 1s)
- Backup to server every 30s
- On reconnect, check both sources, prefer server if newer

---

### 4. Session Recovery Flow

**On Browser Startup**:

```javascript
1. Check localStorage for last session (age < 24h)
2. Query server: GET /api/session/restore
3. Server responds with:
   {
     "sessionFound": true,
     "timestamp": "...",
     "worktrees": [
       {
         "name": "feature-auth",
         "terminals": [
           { "id": "...", "type": "claude", "status": "alive" },
           { "id": "...", "type": "shell", "status": "alive" }
         ]
       }
     ]
   }
4. Show recovery modal (if terminals alive)
5. User chooses: Restore or Start Fresh
```

**Recovery Modal UI**:

```
┌────────────────────────────────────────────────────┐
│  🔄 Restore Previous Session?                      │
├────────────────────────────────────────────────────┤
│  Last active: 2 minutes ago                        │
│                                                    │
│  Worktrees with active terminals:                 │
│                                                    │
│  ☑ feature-auth                                   │
│     🟢 Claude (alive, last activity 2m ago)       │
│     🟢 Shell (alive, last activity 5m ago)        │
│                                                    │
│  ☑ bugfix-login                                   │
│     🔴 Codex (dead - server restarted)            │
│     🟢 Shell (alive, last activity 1h ago)        │
│                                                    │
│  □ Don't show this again (can re-enable)          │
│                                                    │
│  [Restore Selected]  [Start Fresh]  [Cancel]      │
└────────────────────────────────────────────────────┘
```

**Restore Behavior**:
- Reconnect to alive PTYs
- Skip dead PTYs (show notification)
- Restore terminal order/visibility
- Restore active worktree/terminal
- Show "🔄 Reconnected" badge for 5s

**Start Fresh**:
- Clear localStorage session
- Don't kill PTYs (they stay detached)
- Start with empty UI

---

### 5. Available Terminals Panel

**UI Location**: Sidebar or dropdown per worktree

```
┌─ feature-auth ────────────────────────────────┐
│                                               │
│  Terminals (3 running, 1 detached)            │
│  ┌────────────────────────────────────────┐  │
│  │ 🤖 Claude                              │  │
│  │    🟢 Connected • Last: just now       │  │
│  │    [×] Close                           │  │
│  └────────────────────────────────────────┘  │
│                                               │
│  ┌────────────────────────────────────────┐  │
│  │ 💻 Shell #1                            │  │
│  │    🟢 Connected • Last: 2m ago         │  │
│  │    [×] Close                           │  │
│  └────────────────────────────────────────┘  │
│                                               │
│  ┌────────────────────────────────────────┐  │
│  │ 💻 Shell #2                            │  │
│  │    🔵 Detached • Last: 10m ago         │  │
│  │    [↻ Reopen]  [🗑 Kill]               │  │
│  └────────────────────────────────────────┘  │
│                                               │
│  [+ New Terminal ▾]                           │
│     • Claude Code                             │
│     • Codex                                   │
│     • Shell                                   │
│                                               │
└───────────────────────────────────────────────┘
```

**Status Indicators**:
- 🟢 **Connected** - Browser actively viewing
- 🔵 **Detached** - PTY alive, no browser (can reopen)
- 🟡 **Starting** - PTY spawning
- 🔴 **Dead** - PTY terminated (can't reopen)
- 🔄 **Reconnected** - Just restored from previous session

**Actions**:
- **Close** (connected terminals) - Detaches PTY
- **Reopen** (detached terminals) - Reconnects to existing PTY
- **Kill** (any terminal) - Confirms & destroys PTY

---

### 6. WebSocket API

**New Endpoints**:

```javascript
// List all terminals for a worktree
ws.send({
  event: 'list-terminals',
  data: { worktreeName: 'feature-auth' }
});

// Response
{
  event: 'terminals-list',
  data: {
    worktreeName: 'feature-auth',
    terminals: [
      {
        id: 'claude-1698765432',
        type: 'claude',
        status: 'detached',
        created: '...',
        lastActivity: '...',
        ttl: 86400000,
        ttlRemaining: 82800000
      }
    ]
  }
}

// Reopen detached terminal
ws.send({
  event: 'reopen-terminal',
  data: {
    worktreeName: 'feature-auth',
    terminalId: 'claude-1698765432'
  }
});

// Kill terminal
ws.send({
  event: 'kill-terminal',
  data: {
    worktreeName: 'feature-auth',
    terminalId: 'shell-1698765555'
  }
});

// TTL warning (pushed from server)
{
  event: 'terminal-ttl-warning',
  data: {
    worktreeName: 'feature-auth',
    terminalId: 'shell-1698765555',
    type: 'shell',
    ttlRemaining: 300000  // 5 minutes
  }
}

// Keep alive (extend TTL)
ws.send({
  event: 'terminal-keepalive',
  data: {
    worktreeName: 'feature-auth',
    terminalId: 'shell-1698765555'
  }
});
```

---

### 7. HTTP API (for CLI/external tools)

```bash
# List terminals
GET /api/worktrees/:name/terminals
Response: [{ id, type, status, created, lastActivity }]

# Reopen terminal
POST /api/worktrees/:name/terminals/:id/reopen
Response: { success: true, ptyId: '...' }

# Kill terminal
DELETE /api/worktrees/:name/terminals/:id
Response: { success: true }

# Get session state
GET /api/session/current
Response: { sessionId, timestamp, worktrees: [...] }

# Restore previous session
GET /api/session/restore
Response: { sessionFound: true, ... }

# Save session state
POST /api/session/save
Body: { sessionId, worktrees: [...] }
Response: { success: true }
```

---

### 8. Configuration Options

**User-configurable in `.vibe/config.json`**:

```json
{
  "terminals": {
    "ttl": {
      "ai": 86400000,      // 24 hours for AI agents
      "shell": 3600000,    // 1 hour for shells
      "default": 3600000
    },
    "autoCleanup": {
      "enabled": true,
      "interval": 300000,  // Check every 5 minutes
      "warnBefore": 300000 // Warn 5 minutes before
    },
    "sessionRestore": {
      "enabled": true,
      "maxAge": 86400000,  // Don't restore >24h old
      "autoRestore": false // Prompt user vs auto-restore
    },
    "maxPerWorktree": 10   // Prevent runaway spawning
  }
}
```

---

## Implementation Plan

### Phase 2.6.1: Terminal Registry (2 days)

**Tasks**:
- [ ] Create `TerminalRegistry` class
- [ ] Integrate with existing `PTYManager`
- [ ] Add status tracking (connected/detached/dead)
- [ ] Add auto-cleanup task with TTL
- [ ] Persist registry to disk
- [ ] Tests: registry operations, cleanup, persistence

**Deliverable**: Server tracks all terminals, auto-cleans detached

---

### Phase 2.6.2: Detach vs Kill (1 day)

**Tasks**:
- [ ] Change "close" button to "detach" (PTY stays alive)
- [ ] Add "kill" action with confirmation modal
- [ ] Update WebSocket handlers
- [ ] Show detached terminals in registry
- [ ] Tests: detach flow, kill flow

**Deliverable**: User can detach terminals without killing them

---

### Phase 2.6.3: Available Terminals Panel (2 days)

**Tasks**:
- [ ] Create "Available Terminals" UI component
- [ ] Show all terminals per worktree (connected + detached)
- [ ] Add "Reopen" button for detached terminals
- [ ] Add status indicators (🟢🔵🟡🔴)
- [ ] Poll server for terminal list every 5s
- [ ] Tests: UI updates, reopen flow

**Deliverable**: User can see and reopen detached terminals

---

### Phase 2.6.4: UI Session Persistence (2 days)

**Tasks**:
- [ ] Save UI state to localStorage (debounced)
- [ ] Backup to server every 30s
- [ ] HTTP endpoint: `/api/session/save`
- [ ] HTTP endpoint: `/api/session/restore`
- [ ] Serialize: active worktree, open terminals, layout
- [ ] Tests: save/load, sync client/server

**Deliverable**: UI state persists across browser refresh

---

### Phase 2.6.5: Session Recovery Modal (1.5 days)

**Tasks**:
- [ ] Detect previous session on startup
- [ ] Check which terminals are alive
- [ ] Show recovery modal with terminal list
- [ ] "Restore" action: reconnect to alive PTYs
- [ ] "Start Fresh" action: clear session, keep PTYs alive
- [ ] "Don't show again" setting
- [ ] Tests: recovery flow, edge cases

**Deliverable**: User can restore terminals after browser crash

---

### Phase 2.6.6: TTL Warnings & Keepalive (1 day)

**Tasks**:
- [ ] Push TTL warning via WebSocket 5m before cleanup
- [ ] Show notification in UI
- [ ] "Keep Alive" button extends TTL
- [ ] Visual countdown in terminal list
- [ ] Tests: warning, keepalive, cleanup

**Deliverable**: User warned before terminals auto-killed

---

### Phase 2.6.7: Connection Status Indicators (0.5 day)

**Tasks**:
- [ ] Terminal tab badges (🟢🔵🟡🔴🔄)
- [ ] "Reconnected" animation
- [ ] Connection health in header
- [ ] Tests: visual states

**Deliverable**: Clear visual feedback on terminal state

---

### Phase 2.6.8: Testing & Polish (2 days)

**Tasks**:
- [ ] E2E test: detach + reopen flow
- [ ] E2E test: browser crash recovery
- [ ] E2E test: server restart recovery
- [ ] E2E test: TTL cleanup
- [ ] Load test: 10 worktrees × 3 terminals
- [ ] Documentation: user guide, troubleshooting
- [ ] Video demo: recovery flows

**Deliverable**: Production-ready, documented

---

## Testing Strategy

### Unit Tests

```javascript
describe('TerminalRegistry', () => {
  it('registers new terminals');
  it('updates status on connect/disconnect');
  it('lists terminals per worktree');
  it('cleans up detached terminals after TTL');
  it('respects different TTLs for AI vs shells');
  it('persists and restores from disk');
});

describe('Session State', () => {
  it('saves to localStorage');
  it('syncs to server');
  it('loads on startup');
  it('handles localStorage corruption');
});
```

### Integration Tests

```javascript
describe('Detach/Reopen Flow', () => {
  it('PTY stays alive when tab closed');
  it('terminal appears in "Available" list');
  it('reopen reconnects to same PTY');
  it('scrollback preserved');
});

describe('Browser Crash Recovery', () => {
  it('detects previous session');
  it('shows recovery modal');
  it('reconnects to alive PTYs');
  it('skips dead PTYs');
});

describe('TTL Cleanup', () => {
  it('warns 5m before cleanup');
  it('extends TTL on keepalive');
  it('kills PTY after TTL expires');
  it('removes from registry');
});
```

### E2E Tests (Playwright)

```javascript
test('Close and reopen Claude terminal', async ({ page }) => {
  // Create worktree with Claude
  // Close terminal tab (detach)
  // Verify "Available Terminals" shows detached
  // Click "Reopen"
  // Verify reconnected to same PTY
  // Verify scrollback preserved
});

test('Browser crash recovery', async ({ page, context }) => {
  // Create worktree with 2 terminals
  // Close browser (simulate crash)
  // Reopen browser
  // Verify recovery modal appears
  // Click "Restore Session"
  // Verify terminals reconnected
});
```

---

## Success Metrics

**Functionality**:
- ✅ Detached terminals stay alive for TTL
- ✅ User can reopen any detached terminal
- ✅ Browser crash → full recovery in <5 clicks
- ✅ No loss of AI conversation on accidental close
- ✅ Clear visual feedback on terminal state

**Performance**:
- Registry operations < 10ms
- Session save < 50ms
- Recovery modal shows < 500ms
- Reopen terminal < 1s

**UX**:
- 0 complaints about "lost terminals"
- 0 confusion about detach vs kill
- Recovery success rate > 95%

---

## Risks & Mitigations

### Risk 1: Memory growth from abandoned PTYs
**Mitigation**: Auto-cleanup with TTL, warn before cleanup

### Risk 2: localStorage quota exceeded
**Mitigation**: Limit session history, server backup, graceful degradation

### Risk 3: PTY state corruption
**Mitigation**: Validate on reopen, show error, allow kill/recreate

### Risk 4: Race conditions on concurrent reconnect
**Mitigation**: Lock PTYs during reconnect, queue reconnect requests

---

## Future Enhancements (v1.1+)

1. **Multiple browsers** - Sync session across Chrome/Firefox/Safari
2. **Mobile access** - View terminals on phone/tablet
3. **Remote access** - SSH tunnel to dev machine, access from anywhere
4. **Collaboration** - Share terminal with teammate (read-only or interactive)
5. **Cloud backup** - Session state to cloud, restore on any machine
6. **Smart TTL** - Learn usage patterns, adjust TTL dynamically
7. **Terminal templates** - Save/restore terminal configurations

---

## Documentation Needed

### User Guide
- How detach vs kill works
- How to recover crashed session
- How to configure TTLs
- Troubleshooting: "where did my terminal go?"

### Developer Guide
- TerminalRegistry architecture
- Session state schema
- WebSocket protocol
- Testing strategy

---

**Document Version**: 1.0
**Last Updated**: 2025-10-27
**Status**: Design Complete ✅
**Next**: Phase 2.6 Implementation (11-12 days)
