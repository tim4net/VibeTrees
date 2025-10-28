# Terminal Tab Restoration - Testing Guide

## Quick Start Testing

### 1. Basic Restoration Test
```bash
# Start the web UI
npm run web

# In browser:
1. Open http://localhost:3335
2. Create 3 different terminal tabs:
   - Claude terminal for worktree-A
   - Shell terminal for worktree-B
   - Logs viewer for worktree-C
3. Switch to the middle tab (make it active)
4. Press F5 to refresh the page
5. ✓ Verify all 3 tabs are restored
6. ✓ Verify middle tab is active
7. ✓ Verify terminal history is intact
```

### 2. Test Mixed Tab Types
```bash
# In browser:
1. Open these tabs in order:
   - Claude terminal for worktree-A
   - WebUI console for worktree-A (port required)
   - Combined logs for worktree-A
   - Shell terminal for worktree-B
   - Single service logs for worktree-B (e.g., api)
2. Interact with each tab (type commands, view logs)
3. Switch to WebUI tab (make it active)
4. Refresh page (F5)
5. ✓ Verify all 5 tabs restored with correct types
6. ✓ Verify WebUI iframe loads correctly
7. ✓ Verify logs reconnect and stream
8. ✓ Verify PTY terminals reconnect
9. ✓ Verify WebUI tab is active
```

### 3. Test Session Validation
```bash
# Test expired sessions:
1. Open Chrome DevTools → Application → Session Storage
2. Find 'terminal-sessions' key
3. Edit timestamp to be 25 hours ago:
   Change: "timestamp": 1234567890000
   To: "timestamp": 1234477890000  (subtract 90,000,000)
4. Refresh page
5. ✓ Verify expired tab is NOT restored
6. ✓ Verify sessionStorage is cleaned up
7. ✓ Console shows: "Session expired: tab-X"
```

### 4. Test Worktree Deletion
```bash
# Terminal 1: Start web UI
npm run web

# Terminal 2: Delete a worktree
cd /Users/tim/code/vibe-worktrees
npm start -- delete feature-test

# Browser:
1. Before deletion: Open tabs for feature-test worktree
2. Delete the worktree (via Terminal 2)
3. Refresh browser page (F5)
4. ✓ Verify feature-test tabs are NOT restored
5. ✓ Verify other worktree tabs ARE restored
6. ✓ Console shows: "Worktree no longer exists: feature-test"
7. ✓ SessionStorage is cleaned up
```

### 5. Test Partial Restoration
```bash
# Setup: 3 worktrees with tabs
1. Open tabs for: main, feature-A, feature-B
2. Delete feature-A via CLI
3. Refresh browser
4. ✓ Verify only main and feature-B tabs restored
5. ✓ Verify no errors in console
6. ✓ SessionStorage only contains valid sessions
```

## Debugging with Console

### Expected Console Output (Successful Restoration)
```
[restoreTerminalTabs] Found 3 saved sessions
[restoreTerminalTabs] Restoring session: tab-1 (main)
[restoreTerminalTabs] ✓ Restored: tab-1 -> tab-4
[restoreTerminalTabs] Restoring session: tab-2 (feature-xyz)
[restoreTerminalTabs] ✓ Restored: tab-2 -> tab-5
[restoreTerminalTabs] Restoring session: tab-3 (feature-abc)
[restoreTerminalTabs] ✓ Restored: tab-3 -> tab-6
[restoreTerminalTabs] Restoring active tab: tab-2 -> tab-5
[restoreTerminalTabs] Restoration complete: 3 tabs restored
```

### Expected Console Output (Partial Failure)
```
[restoreTerminalTabs] Found 4 saved sessions
[restoreTerminalTabs] Session expired: tab-1
[restoreTerminalTabs] Worktree no longer exists: deleted-branch
[restoreTerminalTabs] Restoring session: tab-3 (main)
[restoreTerminalTabs] ✓ Restored: tab-3 -> tab-5
[restoreTerminalTabs] Restoring session: tab-4 (feature-xyz)
[restoreTerminalTabs] ✓ Restored: tab-4 -> tab-6
[restoreTerminalTabs] Cleaned up 2 invalid sessions
[restoreTerminalTabs] Restoring active tab: tab-3 -> tab-5
[restoreTerminalTabs] Restoration complete: 2 tabs restored
```

## SessionStorage Inspection

### View Saved Sessions
```javascript
// In browser console:
JSON.parse(sessionStorage.getItem('terminal-sessions'))
// Output:
[
  {
    tabId: "tab-1",
    worktreeName: "main",
    command: "claude",
    isWebUI: false,
    isLogs: false,
    isCombinedLogs: false,
    serviceName: null,
    uiPort: null,
    timestamp: 1234567890000
  },
  // ... more sessions
]
```

### View Active Tab
```javascript
sessionStorage.getItem('active-terminal-tab')
// Output: "tab-2"
```

### Clear All Sessions (Reset)
```javascript
sessionStorage.removeItem('terminal-sessions');
sessionStorage.removeItem('active-terminal-tab');
location.reload();
```

## Edge Case Testing

### 1. No Saved Sessions (Fresh Start)
```
1. Clear sessionStorage (see above)
2. Refresh page
3. ✓ Console: "[restoreTerminalTabs] No saved sessions found"
4. ✓ Shows empty state (no tabs)
```

### 2. Corrupted SessionStorage
```javascript
// Corrupt the JSON:
sessionStorage.setItem('terminal-sessions', '{broken json');
location.reload();

// ✓ Console: "[restoreTerminalTabs] Error: ..."
// ✓ SessionStorage is cleared
// ✓ App continues to work normally
```

### 3. WebUI Tab Without Port
```javascript
// Edit session to remove uiPort:
let sessions = JSON.parse(sessionStorage.getItem('terminal-sessions'));
sessions[0].isWebUI = true;
sessions[0].uiPort = null;
sessionStorage.setItem('terminal-sessions', JSON.stringify(sessions));
location.reload();

// ✓ Console: "WebUI session missing port: tab-X"
// ✓ Tab is not restored
// ✓ Invalid session is cleaned up
```

### 4. All Tabs Invalid
```
1. Open 3 tabs for worktree-A
2. Delete worktree-A
3. Refresh page
4. ✓ No tabs restored
5. ✓ Shows empty state
6. ✓ SessionStorage is cleared
7. ✓ Console: "Cleaned up 3 invalid sessions"
```

### 5. Active Tab Not Restored
```
1. Open tabs: tab-1 (main), tab-2 (feature-A), tab-3 (main)
2. Make tab-2 active (feature-A)
3. Delete worktree feature-A
4. Refresh page
5. ✓ tab-1 and tab-3 restored
6. ✓ tab-1 becomes active (first restored tab)
7. ✓ Console: Active tab fallback message
```

## Performance Testing

### Large Number of Tabs
```
1. Open 10+ tabs across multiple worktrees
2. Refresh page
3. ✓ All tabs restore quickly (< 2s)
4. ✓ No UI freezing during restoration
5. ✓ Terminal history loads progressively
```

### API Failure Handling
```bash
# Stop the server
# Browser: Refresh page
# ✓ Console: Fetch error caught
# ✓ No infinite loops or crashes
# ✓ Empty state shown

# Restart server
# Browser: Refresh again
# ✓ Tabs restore normally
```

## Regression Testing

### Verify Existing Functionality Still Works

1. **Create New Tab**: Works normally, saved to sessionStorage
2. **Close Tab**: Removes from sessionStorage
3. **Switch Tabs**: Updates active tab in sessionStorage
4. **Terminal Input**: PTY commands work normally
5. **Log Streaming**: Logs continue to stream
6. **WebUI**: Iframe loads and interacts normally
7. **Context Menu**: Right-click still works
8. **Tab Labels**: Icons and labels render correctly
9. **Empty State**: Shows when no tabs open
10. **Multiple Worktrees**: Tab filtering still works

## Known Limitations

1. **Tab IDs Change**: Original tab-1 might become tab-5 after restoration
   - Not user-visible, internal only
   - Handled via tabIdMapping

2. **PTY History Length**: Limited by terminal buffer size
   - Server-side limitation, not restoration issue
   - Terminal shows scrollback available

3. **24-Hour Expiry**: Sessions older than 24h are discarded
   - Configurable via SESSION_EXPIRY constant
   - Prevents stale session accumulation

4. **sessionStorage Only**: Doesn't sync across tabs/windows
   - Each browser tab has independent restoration
   - By design for isolation

## Success Criteria

- ✓ All valid terminal tabs restore on page refresh
- ✓ Active tab selection is preserved
- ✓ Terminal history is intact (PTY reconnection)
- ✓ Expired sessions are cleaned up (24h timeout)
- ✓ Deleted worktree tabs are not restored
- ✓ Invalid sessions are removed from storage
- ✓ Partial restoration works (some tabs fail, others succeed)
- ✓ Error handling is graceful (no crashes)
- ✓ Console logging is comprehensive for debugging
- ✓ No breaking changes to existing functionality
- ✓ Performance is acceptable (< 2s for 10+ tabs)
