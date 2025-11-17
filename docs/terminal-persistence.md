# Terminal Persistence

Terminal sessions survive browser refresh, network disconnections, and server restarts with full scrollback history preserved.

## Features

- **Full Buffer Restoration**: Complete terminal history (10,000 lines scrollback)
- **Process Continuity**: Running commands continue executing server-side
- **Auto-Save**: Terminal state captured every 5 seconds
- **ANSI Preservation**: Colors, formatting, and control codes maintained
- **Seamless Recovery**: Browser refresh and WebSocket reconnect restore complete state
- **Orphan Cleanup**: Inactive sessions cleaned up after 1 hour

## Architecture

```
PTY Process → node-pty → xterm-headless (buffer) → serialize addon
                              ↓                          ↓
                          WebSocket                  string snapshot
                              ↓                          ↓
                         browser xterm.js     ~/.vibetrees/sessions/
```

**Data Flow**:
1. `node-pty` spawns PTY process and captures raw output
2. `xterm-headless` terminal maintains in-memory buffer with full ANSI processing
3. `SerializeAddon` provides production-ready serialization
4. Auto-save every 5 seconds to `~/.vibetrees/sessions/{id}/pty-state.json`
5. On reconnect: deserialize state and restore complete buffer to client terminal

**Components**:
- `PTYSessionManager`: Session lifecycle, auto-save orchestration
- `PTYStateSerializer`: State capture/restore using xterm-headless
- `xterm-headless`: Server-side terminal buffer (from @xterm/headless)
- `SerializeAddon`: Production-grade serialization (from @xterm/addon-serialize)

## Implementation Details

### State Capture (PTYStateSerializer.captureState)

Uses `SerializeAddon` to capture complete terminal state:

```javascript
const state = {
  sessionId: 'uuid',
  serialized: serializeAddon.serialize({ scrollback: 10000 }),
  dimensions: { cols: 80, rows: 24 },
  timestamp: Date.now()
};
```

**Serialized format**: Single string containing all buffer lines with ANSI codes preserved, exactly as xterm.js expects for restoration.

### State Restoration (PTYSessionManager.restoreTerminal)

```javascript
const { Terminal } = await import('@xterm/headless');
const { SerializeAddon } = await import('@xterm/addon-serialize');

const terminal = new Terminal({
  cols: savedState.dimensions.cols,
  rows: savedState.dimensions.rows,
  allowProposedApi: true
});

const serializeAddon = new SerializeAddon();
terminal.loadAddon(serializeAddon);

// Write serialized state to restore complete buffer
for (const line of savedState.buffer) {
  terminal.write(line);
}
```

## State Format

Saved to `~/.vibetrees/sessions/{sessionId}/pty-state.json`:

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "serialized": "...[complete terminal buffer with ANSI codes]...",
  "dimensions": {
    "cols": 120,
    "rows": 30
  },
  "timestamp": 1699876543210
}
```

**Format characteristics**:
- `serialized`: Complete buffer as single string (ANSI codes intact)
- `dimensions`: Terminal size for proper restoration
- `timestamp`: Save time for debugging and cleanup decisions
- Total size: Typically 50-200KB for active sessions

## Usage

No user action required - persistence is automatic.

### Browser Refresh
1. Session ID stored in browser `sessionStorage`
2. On page load, WebSocket reconnects with session ID
3. Server streams saved terminal buffer to client
4. Running processes continue uninterrupted

### Server Restart
1. Auto-save captures state before shutdown
2. On restart, session manager loads saved states
3. Clients reconnect and receive complete buffer restoration
4. PTY processes may need restart (future: process persistence)

### Session Takeover
When multiple clients connect to same session:
- Previous client receives takeover notification
- New client becomes active connection
- Both clients see identical terminal state

## Storage and Cleanup

**Location**: `~/.vibetrees/sessions/{sessionId}/pty-state.json`

**Auto-save interval**: 5 seconds (configurable via `autoSaveInterval` option)

**Orphan cleanup**: Sessions disconnected for >1 hour are automatically destroyed
- Cleanup check runs every 5 minutes
- Orphan timeout configurable via `orphanTimeout` option (default: 1 hour)
- Session files deleted on cleanup

**Manual cleanup**: Session destroyed when worktree is deleted or terminal explicitly closed
