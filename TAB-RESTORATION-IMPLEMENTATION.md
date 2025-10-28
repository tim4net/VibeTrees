# Terminal Tab Restoration Implementation

## Overview

Implemented automatic restoration of terminal tabs on page refresh, preserving tab state and active selection across browser sessions.

## Implementation Details

### Storage Schema

**sessionStorage keys:**
- `terminal-sessions`: JSON array of session objects
- `active-terminal-tab`: tabId string of the active tab

**Session object structure:**
```javascript
{
  tabId: 'tab-1',
  worktreeName: 'feature-xyz',
  command: 'claude' | 'codex' | 'shell',
  isWebUI: boolean,
  isLogs: boolean,
  isCombinedLogs: boolean,
  serviceName: 'api' | 'db' | 'worker' | null,
  uiPort: number | null,
  timestamp: Date.now() // for expiry tracking
}
```

## Core Functions

### 1. `saveTerminalSession()`
**Purpose**: Save terminal tab metadata to sessionStorage when a tab is created.

**Called by**: `createTerminalTab()` after tab initialization

**Behavior**:
- Checks for existing session with same tabId (updates if found)
- Stores complete tab configuration including type flags
- Adds timestamp for expiry validation
- Handles storage errors gracefully

### 2. `removeTerminalSession()`
**Purpose**: Remove terminal session from sessionStorage when tab is closed.

**Called by**: `closeTerminalTab()` during cleanup

**Behavior**:
- Filters out the closed tab from sessions array
- Updates sessionStorage with remaining sessions
- Handles storage errors gracefully

### 3. `saveActiveTab()`
**Purpose**: Track which tab is currently active.

**Called by**: `switchToTab()` on every tab switch

**Behavior**:
- Stores current active tabId
- Used during restoration to reactivate the correct tab

### 4. `restoreTerminalTabs()` (async)
**Purpose**: Restore all valid terminal tabs from previous session on page load.

**Called by**: `initTerminals()` during app initialization

**Restoration Flow**:

1. **Load & Validate Sessions**
   - Retrieve saved sessions from sessionStorage
   - Fetch current worktrees from API for validation
   - Check each session for:
     - Expiry (24 hour timeout)
     - Worktree still exists
     - WebUI ports still valid

2. **Restore Valid Sessions**
   - Create new terminal tabs for each valid session
   - Track old→new tabId mappings (tab IDs regenerate on restore)
   - Handle restoration failures individually (doesn't block other tabs)

3. **Cleanup Invalid Sessions**
   - Remove expired sessions from storage
   - Remove sessions for deleted worktrees
   - Remove sessions with missing data

4. **Restore Active Tab**
   - Use tabId mapping to find new ID of previously active tab
   - Switch to that tab if it was successfully restored
   - Fall back to first restored tab if active tab couldn't be restored

## Error Handling

### Validation Checks

1. **Session Expiry**: 24-hour timeout prevents stale sessions
2. **Worktree Existence**: Validates worktree still exists via API
3. **Port Availability**: WebUI tabs validate port is present
4. **Restoration Failures**: Individual tab restoration errors don't block other tabs

### Recovery Strategies

1. **Corrupted sessionStorage**: Clear all session data on parse errors
2. **API Failure**: Caught and logged, restoration aborted gracefully
3. **Invalid Session**: Logged and skipped, removed from storage
4. **Partial Restoration**: Successfully restored tabs remain even if some fail

### Edge Cases Handled

1. **No saved sessions**: Early return, shows empty state
2. **All sessions invalid**: Cleans up storage, shows empty state
3. **Active tab not restored**: Falls back to first restored tab
4. **No tabs restored**: Shows empty state as normal
5. **WebSocket connection failures**: Handled by terminal-setup.js reconnection logic

## Integration Points

### Modified Functions

**`createTerminalTab()`**:
- Added `saveTerminalSession()` call after tab creation
- Saves for both PTY terminals and WebUI tabs

**`switchToTab()`**:
- Added `saveActiveTab()` call on every tab switch
- Maintains active tab state in sessionStorage

**`closeTerminalTab()`**:
- Added `removeTerminalSession()` call during cleanup
- Clears active tab from sessionStorage if last tab closed

**`initTerminals()`**:
- Added `restoreTerminalTabs()` call after empty state setup
- Runs async restoration before first render

## PTY Session Reconnection

The current implementation leverages the existing PTY architecture:

- Server maintains PTYs using `worktreeName:command` keys
- PTYs stay alive when WebSocket disconnects
- On restoration, new WebSocket connects to existing PTY
- Terminal history is preserved by the PTY process itself

This approach works because:
1. PTY processes aren't killed when browser closes
2. Server's `getOrCreateTerminal()` returns existing PTY if found
3. xterm.js receives full terminal history on reconnection

## Testing Approach

**Manual Testing Scenarios**:

1. **Basic Restoration**:
   - Open 3 tabs (Claude, Shell, Logs)
   - Refresh page
   - Verify all 3 tabs restored with correct types
   - Verify active tab is restored

2. **Expiry Validation**:
   - Open tab, save timestamp manually to 25 hours ago
   - Refresh page
   - Verify tab is not restored and cleaned from storage

3. **Worktree Deletion**:
   - Open tab for worktree-A
   - Delete worktree-A via API
   - Refresh page
   - Verify tab is not restored and cleaned from storage

4. **Mixed Tab Types**:
   - Open Claude terminal, WebUI, logs, shell
   - Refresh page
   - Verify all types restored correctly with proper behavior

5. **Partial Restoration**:
   - Open 3 tabs, delete 1 worktree
   - Refresh page
   - Verify 2 tabs restored, 1 cleaned up

6. **Storage Corruption**:
   - Manually corrupt sessionStorage JSON
   - Refresh page
   - Verify storage is cleared and app continues normally

7. **Active Tab Persistence**:
   - Open 5 tabs, switch to tab 3
   - Refresh page
   - Verify tab 3 is active after restoration

## Console Logging

Comprehensive logging for debugging:
- `[restoreTerminalTabs] Found N saved sessions`
- `[restoreTerminalTabs] Session expired: tab-X`
- `[restoreTerminalTabs] Worktree no longer exists: worktree-name`
- `[restoreTerminalTabs] Restoring session: tab-X (worktree-name)`
- `[restoreTerminalTabs] ✓ Restored: tab-X -> tab-Y`
- `[restoreTerminalTabs] Failed to restore tab-X: error`
- `[restoreTerminalTabs] Cleaned up N invalid sessions`
- `[restoreTerminalTabs] Restoring active tab: tab-X -> tab-Y`
- `[restoreTerminalTabs] Restoration complete: N tabs restored`

## Performance Considerations

1. **Async Restoration**: Uses async/await to avoid blocking page load
2. **Early Return**: Exits immediately if no saved sessions
3. **Single API Call**: Fetches worktrees once, validates all sessions
4. **Efficient Filtering**: Uses Set for O(1) worktree name lookups
5. **Batch Updates**: Updates sessionStorage once after validation

## Future Enhancements

1. **Session State Persistence**: Integrate with PTYStateSerializer for command history
2. **Tab Order Preservation**: Save and restore exact tab order
3. **Tab Groups**: Support grouping related tabs
4. **Cross-Device Sync**: Use localStorage + sync mechanism for multi-device support
5. **Intelligent Cleanup**: Archive old sessions instead of deleting
6. **Statistics**: Track usage patterns for UX improvements

## Files Modified

- `/scripts/worktree-web/public/js/terminals.js`
  - Added `saveTerminalSession()` function
  - Added `removeTerminalSession()` function
  - Added `saveActiveTab()` function
  - Added `restoreTerminalTabs()` async function
  - Modified `createTerminalTab()` to save sessions
  - Modified `switchToTab()` to save active tab
  - Modified `closeTerminalTab()` to remove sessions
  - Modified `initTerminals()` to restore tabs

## No Breaking Changes

The implementation is fully backward compatible:
- Works with existing terminal types (PTY, WebUI, logs)
- Doesn't affect tab creation/closing behavior
- Falls back gracefully if sessionStorage unavailable
- No changes to server-side code required
