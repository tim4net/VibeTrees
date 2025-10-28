# Status Bar Design Specification

**Feature**: Global status bar showing git/worktree metadata
**Position**: Bottom of window (always visible)
**Behavior**: Responsive - icons always visible, text labels appear when horizontal space available

---

## Core Features (Phase 1)

### 1. Branch Name
**Display**:
- Wide: `🌲 feature-xyz`
- Narrow: `🌲 feat...`
- Icon: `git-branch` (lucide) or 🌲
- Color: Based on git status (green=clean, yellow=uncommitted, blue=unpushed)

**Click Action**: Copy branch name to clipboard
**Hover Tooltip**: Full branch name + base branch (e.g., "feature-xyz (based on main)")

---

### 2. Ahead/Behind Main
**Display**:
- Wide: `↑3 commits ahead, ↓5 behind`
- Medium: `↑3 ↓5 from main`
- Narrow: `↑3 ↓5`
- Icons: `arrow-up` + `arrow-down` (lucide)
- Color: Green if only ahead, yellow if only behind, orange if both, gray if even

**Click Action**: Open sync dialog
**Hover Tooltip**: "3 commits ahead of main, 5 commits behind main. Click to sync."

---

### 3. Uncommitted Changes
**Display**:
- Wide: `●5 modified files`
- Medium: `●5 files`
- Narrow: `●5`
- Clean: `✓ Clean` (wide), `✓` (narrow)
- Icons:
  - `●` (dot) = modified files
  - `+` (plus) = untracked files
  - `✓` (check) = clean working directory
- Color: Yellow if changes, green if clean

**Click Action**: Open modal showing file list with status
**Hover Tooltip**: "5 modified files, 2 untracked. Click to view details."

---

### 4. Last Commit
**Display**:
- Wide: `🕐 2 hours ago by Alice`
- Medium: `🕐 2h ago`
- Narrow: `🕐 2h`
- Icon: `clock` (lucide)
- Color: Gray

**Click Action**: Open commit on GitHub (if available)
**Hover Tooltip**: Full commit message + hash + author + timestamp
Example: "feat: Add status bar\na004dca by Tim Chen\n2 hours ago"

---

### 5. Docker Services
**Display**:
- Wide: `🐳 3/4 services running`
- Medium: `🐳 3/4 running`
- Narrow: `🐳 3/4`
- Icon: Docker logo or `container` (lucide)
- Color: Green if all running, yellow if partial, red if none, gray if no services

**Click Action**: Show service list modal with start/stop/restart buttons
**Hover Tooltip**: "3 of 4 services running: api ✓, worker ✓, db ✓, redis ✗"

---

## Layout Examples

### Wide Screen (> 1400px)
```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ 🌲 feature-xyz  │  ↑3 commits ahead, ↓5 behind  │  ●5 modified files  │  🕐 2h ago by Alice  │  🐳 3/4 services running │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Medium Screen (1000-1400px)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🌲 feature-xyz  │  ↑3 ↓5 from main  │  ●5 files  │  🕐 2h ago  │  🐳 3/4 running │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Narrow Screen (< 1000px)
```
┌──────────────────────────────────────────────────┐
│ 🌲 feat...  │  ↑3 ↓5  │  ●5  │  🕐 2h  │  🐳 3/4 │
└──────────────────────────────────────────────────┘
```

---

## Responsive Breakpoints

```css
/* Narrow: Icons + minimal text */
@media (max-width: 999px) {
  .status-segment .text-full { display: none; }
  .status-segment .text-short { display: none; }
  .status-segment .text-minimal { display: inline; }
}

/* Medium: Icons + short text */
@media (min-width: 1000px) and (max-width: 1399px) {
  .status-segment .text-full { display: none; }
  .status-segment .text-short { display: inline; }
  .status-segment .text-minimal { display: none; }
}

/* Wide: Icons + full text */
@media (min-width: 1400px) {
  .status-segment .text-full { display: inline; }
  .status-segment .text-short { display: none; }
  .status-segment .text-minimal { display: none; }
}
```

---

## HTML Structure

```html
<div class="status-bar" id="status-bar">
  <!-- Branch -->
  <div class="status-segment clickable" onclick="copyBranchName()" title="Click to copy branch name">
    <i data-lucide="git-branch" class="status-icon"></i>
    <span class="text-full">feature-xyz</span>
    <span class="text-short">feature-xyz</span>
    <span class="text-minimal">feat...</span>
  </div>

  <div class="status-divider">│</div>

  <!-- Ahead/Behind -->
  <div class="status-segment clickable ahead-behind" onclick="openSyncDialog()" title="Click to sync with main">
    <i data-lucide="arrow-up" class="status-icon"></i>
    <span class="ahead-count">3</span>
    <span class="text-full">commits ahead,</span>
    <span class="text-short">ahead</span>

    <i data-lucide="arrow-down" class="status-icon"></i>
    <span class="behind-count">5</span>
    <span class="text-full">behind</span>
    <span class="text-short">behind</span>
  </div>

  <div class="status-divider">│</div>

  <!-- Uncommitted Changes -->
  <div class="status-segment clickable changes" onclick="showChangesModal()" title="Click to view changes">
    <span class="status-icon">●</span>
    <span class="change-count">5</span>
    <span class="text-full">modified files</span>
    <span class="text-short">files</span>
  </div>

  <div class="status-divider">│</div>

  <!-- Last Commit -->
  <div class="status-segment clickable" onclick="openCommitOnGitHub()" title="Click to view commit on GitHub">
    <i data-lucide="clock" class="status-icon"></i>
    <span class="text-full">2 hours ago by Alice</span>
    <span class="text-short">2h ago</span>
    <span class="text-minimal">2h</span>
  </div>

  <div class="status-divider">│</div>

  <!-- Docker Services -->
  <div class="status-segment clickable docker" onclick="showServicesModal()" title="Click to manage services">
    <span class="status-icon">🐳</span>
    <span class="service-count">3/4</span>
    <span class="text-full">services running</span>
    <span class="text-short">running</span>
  </div>
</div>
```

---

## CSS Styling

```css
.status-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 28px;
  background: linear-gradient(180deg, #161b22 0%, #0d1117 100%);
  border-top: 1px solid #30363d;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  font-size: 12px;
  color: #8b949e;
  z-index: 100;
  user-select: none;
}

.status-segment {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.status-segment.clickable {
  cursor: pointer;
}

.status-segment.clickable:hover {
  background: rgba(56, 139, 253, 0.1);
  color: #58a6ff;
}

.status-icon {
  width: 14px;
  height: 14px;
  opacity: 0.8;
}

.status-divider {
  color: #30363d;
  opacity: 0.5;
}

/* Color states */
.status-segment.clean { color: #2ea043; }
.status-segment.modified { color: #e5a935; }
.status-segment.ahead { color: #2ea043; }
.status-segment.behind { color: #e5a935; }
.status-segment.ahead-behind { color: #f78166; }
.status-segment.docker.running { color: #2ea043; }
.status-segment.docker.partial { color: #e5a935; }
.status-segment.docker.stopped { color: #f85149; }
```

---

## JavaScript Implementation

### Data Refresh
**Use Existing Polling Cycles** - Piggyback on existing PollingManager:
- **15 seconds** when tab is visible
- **2 minutes** when tab is hidden
- **Immediate refresh** when tab becomes visible
- **On worktree selection change**

```javascript
// Listen to existing refresh events
import { appState } from './state.js';

// Initialize status bar module
export function initStatusBar() {
  console.log('[status-bar] Initializing status bar');

  // Update on worktree selection change
  if (window.appState) {
    window.appState.on('worktree:selected', (worktreeName) => {
      updateStatusBar(worktreeName);
    });

    // Update when worktree data refreshes (piggyback on existing polling)
    window.appState.on('worktrees:updated', () => {
      const selected = window.appState.selectedWorktreeId;
      if (selected) {
        updateStatusBar(selected);
      }
    });
  }

  // Initial update
  const selected = window.appState?.selectedWorktreeId;
  if (selected) {
    updateStatusBar(selected);
  }
}

async function updateStatusBar(worktreeName) {
  if (!worktreeName) {
    hideStatusBar();
    return;
  }

  // Get data from existing worktree object (no new API call needed)
  const worktree = window.appState?.getWorktrees?.().find(w => w.name === worktreeName);
  if (!worktree) return;

  updateBranchDisplay(worktree.branch, worktree.gitStatus);
  updateAheadBehind(worktree.ahead, worktree.behind);
  updateChanges(worktree.modifiedFiles, worktree.untrackedFiles);
  updateLastCommit(worktree.lastCommit);
  updateDockerServices(worktree.dockerStatus);

  showStatusBar();
}
```

### Click Handlers
```javascript
function copyBranchName() {
  const branch = appState.getSelectedWorktree()?.branch;
  navigator.clipboard.writeText(branch);
  showToast(`Copied: ${branch}`);
}

function openSyncDialog() {
  window.syncUI?.showSyncDialog(appState.selectedWorktreeId);
}

function showChangesModal() {
  // Show modal with file list
}

function openCommitOnGitHub() {
  const worktree = appState.getSelectedWorktree();
  const url = `${worktree.githubUrl}/commit/${worktree.lastCommitHash}`;
  window.open(url, '_blank');
}

function showServicesModal() {
  // Show modal with service controls
}
```

---

## Backend API

### No New Endpoints Required! 🎉

The status bar will use **existing data** from the worktree object that's already being fetched:
- `GET /api/worktrees` provides all the data we need
- Already refreshes every 15 seconds (visible) / 2 minutes (hidden)
- No additional API calls needed

**Required Data Enhancements** (if missing):
- `worktree.ahead` - commits ahead of main
- `worktree.behind` - commits behind main
- `worktree.modifiedFiles` - count of modified files
- `worktree.untrackedFiles` - count of untracked files
- `worktree.lastCommit` - object with hash, message, author, timestamp

If these fields are already in the worktree object, no backend changes needed!

---

## Phase 2 Features (Future)

### Additional Segments
1. **Worktree Path** - Click to copy or open in file manager
2. **Active Agent** - Click to change agent
3. **Port Range** - Click to copy or open in browser
4. **Disk Usage** - Warning if > 5GB
5. **Stash Count** - Click to view/apply stashes
6. **Database Status** - Connection indicator
7. **MCP Servers** - Number of active servers

### Enhanced Interactions
- **Keyboard shortcuts** - Press `Ctrl+B` to focus status bar
- **Drag to reorder** - Customize segment order
- **Hide/show segments** - Right-click to toggle visibility
- **Custom refresh interval** - User preference

---

## Implementation Plan

1. **Backend**: Create `/api/worktrees/:name/status-bar` endpoint
2. **HTML**: Add status bar structure to `index.html`
3. **CSS**: Create `status-bar.css` with responsive styles
4. **JavaScript**: Create `status-bar.js` module
5. **Integration**: Initialize in `main.js`, listen to worktree selection
6. **Testing**: Test all click actions and responsive breakpoints

---

## Success Criteria

- ✅ Status bar visible at bottom of window
- ✅ All 5 segments display correctly
- ✅ Icons always visible, text responsive to screen width
- ✅ All segments clickable with appropriate actions
- ✅ Hover tooltips show detailed information
- ✅ Auto-refresh every 10 seconds
- ✅ Color coding reflects status accurately
- ✅ Smooth transitions when data changes
- ✅ Works on screens 800px+ wide

---

**Estimated Effort**: 4-6 hours
**Priority**: High (major UX improvement)
**Dependencies**: Existing git status APIs, docker status APIs
