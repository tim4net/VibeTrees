# Status Bar Testing Checklist

## Prerequisites
- [ ] Web UI is running (`npm run web`)
- [ ] Browser is open to http://localhost:3335
- [ ] At least one worktree exists
- [ ] Browser dev tools console is open (to see logs)

## Visual Tests

### Initial Load
- [ ] Status bar is NOT visible when no worktree is selected
- [ ] Status bar appears at bottom when worktree is selected
- [ ] Status bar has 5 segments separated by vertical dividers (│)
- [ ] All Lucide icons are rendered correctly
- [ ] Background gradient is visible (#161b22 → #0d1117)
- [ ] Border top is visible (1px solid #30363d)

### Responsive Layout

#### Wide Screen (> 1400px)
- [ ] All segments show full text
- [ ] Example: "feature-xyz", "commits ahead, behind", "modified files", "2 hours ago by Alice", "services running"

#### Medium Screen (1000-1400px)
- [ ] All segments show short text
- [ ] Example: "feature-xyz", "ahead behind", "files", "2h ago", "running"

#### Narrow Screen (< 1000px)
- [ ] All segments show minimal text
- [ ] Example: "feat...", numbers only, "2h", minimal labels
- [ ] Icons still visible

### Segment 1: Branch Name
- [ ] Git branch icon (lucide "git-branch") is visible
- [ ] Branch name is displayed
- [ ] Long branch names are truncated on narrow screens
- [ ] Color changes based on status:
  - [ ] Green when clean
  - [ ] Yellow when uncommitted changes
  - [ ] Blue when ahead of base

### Segment 2: Ahead/Behind
- [ ] Up arrow icon (lucide "arrow-up") is visible
- [ ] Down arrow icon (lucide "arrow-down") is visible
- [ ] Ahead count is displayed
- [ ] Behind count is displayed
- [ ] Color changes based on status:
  - [ ] Green when only ahead
  - [ ] Yellow when only behind
  - [ ] Orange when both ahead and behind
  - [ ] Gray when even

### Segment 3: Uncommitted Changes
- [ ] Shows ● icon when there are changes
- [ ] Shows ✓ icon when clean
- [ ] Count is displayed when there are changes
- [ ] Text changes to "Clean" when no changes
- [ ] Color is yellow with changes, green when clean

### Segment 4: Last Commit
- [ ] Clock icon (lucide "clock") is visible
- [ ] Relative time is displayed (e.g., "2 hours ago")
- [ ] Author name is shown on wide screens
- [ ] Time format adjusts for screen size
- [ ] Shows "unknown" if commit data missing

### Segment 5: Docker Services
- [ ] Docker emoji (🐳) is visible
- [ ] Service count is displayed (e.g., "3/4")
- [ ] Text describes status ("running", etc.)
- [ ] Color changes based on status:
  - [ ] Green when all running
  - [ ] Yellow when partial
  - [ ] Red when all stopped
  - [ ] Gray when no services

## Interaction Tests

### Hover Effects
- [ ] Each segment highlights on hover (blue glow effect)
- [ ] Cursor changes to pointer on hover
- [ ] Tooltip appears on hover for each segment
- [ ] Tooltips show detailed information:
  - [ ] Branch: Full name + base branch
  - [ ] Ahead/Behind: Detailed counts + "Click to sync"
  - [ ] Changes: File counts by type
  - [ ] Last Commit: Full message + hash + author
  - [ ] Docker: Service list with status (✓/✗)

### Click Actions

#### Branch Segment
- [ ] Click copies branch name to clipboard
- [ ] Toast notification appears: "Copied: [branch-name]"
- [ ] Toast disappears after ~3 seconds

#### Ahead/Behind Segment
- [ ] Click opens sync dialog (if sync UI available)
- [ ] If sync button exists, it triggers sync action
- [ ] If not available, shows info toast

#### Changes Segment
- [ ] Click shows alert with file counts (placeholder)
- [ ] Alert message includes modified and untracked counts
- [ ] Works even when no changes (shows "Clean" toast)

#### Last Commit Segment
- [ ] Click opens GitHub commit page (if URL available)
- [ ] Opens in new tab
- [ ] Shows error toast if GitHub URL not configured
- [ ] URL format: `https://github.com/owner/repo/commit/{hash}`

#### Docker Segment
- [ ] Click scrolls to worktree card in sidebar
- [ ] Worktree card is highlighted briefly (blue glow)
- [ ] Highlight effect fades after ~1 second
- [ ] If sidebar is collapsed, shows context menu
- [ ] Shows info toast if no services configured

### Focus States (Accessibility)
- [ ] Press Tab to navigate to status bar
- [ ] Each clickable segment is focusable
- [ ] Focus indicator (2px blue outline) is visible
- [ ] Press Enter to activate focused segment
- [ ] Focus order is logical (left to right)

## Dynamic Update Tests

### Worktree Selection
- [ ] Select different worktree in sidebar
- [ ] Status bar updates immediately
- [ ] All segments show new worktree data
- [ ] No visible delay or flicker

### Auto-Refresh (Visible Tab)
- [ ] Make a change in selected worktree (e.g., edit a file)
- [ ] Wait 15 seconds
- [ ] Status bar updates automatically
- [ ] Changes segment shows new count
- [ ] No page reload required

### Auto-Refresh (Hidden Tab)
- [ ] Switch to another browser tab
- [ ] Wait 2 minutes
- [ ] Switch back to VibeTrees tab
- [ ] Status bar immediately refreshes
- [ ] Shows current data

### No Worktree Selected
- [ ] Deselect all worktrees (if possible)
- [ ] Status bar becomes hidden
- [ ] No errors in console
- [ ] Re-selecting worktree shows status bar again

## Console Tests

### Success Logs
Check browser console for these logs:
- [ ] `[status-bar] Initializing status bar`
- [ ] `[status-bar] Worktree selected: [name]`
- [ ] `[status-bar] Worktrees updated, refreshing status bar`
- [ ] `[status-bar] Updating with data:` (followed by worktree object)

### Error Handling
- [ ] No console errors on page load
- [ ] No errors when clicking segments
- [ ] Graceful handling of missing data (no crashes)
- [ ] Warning logs for missing fields (expected)

## Edge Cases

### Missing Data
- [ ] Works when `ahead` is undefined (defaults to 0)
- [ ] Works when `behind` is undefined (defaults to 0)
- [ ] Works when `modifiedFiles` is undefined (defaults to 0)
- [ ] Works when `untrackedFiles` is undefined (defaults to 0)
- [ ] Works when `lastCommit` is undefined (shows "unknown")
- [ ] Works when `githubUrl` is undefined (shows error toast on click)
- [ ] Works when `baseBranch` is undefined (defaults to "main")

### Empty States
- [ ] Works when no Docker services configured
- [ ] Works when working directory is clean
- [ ] Works when even with base branch (ahead=0, behind=0)

### Very Long Text
- [ ] Long branch names truncate gracefully
- [ ] Long commit messages in tooltip wrap properly
- [ ] Long service names in tooltip display correctly

### Multiple Worktrees
- [ ] Switching between worktrees updates status bar
- [ ] No data from previous worktree bleeds through
- [ ] Each worktree shows correct data

## Performance Tests

### Initial Render
- [ ] Status bar appears instantly on worktree selection
- [ ] No visible lag or delay
- [ ] Smooth transition (not jarring)

### Updates
- [ ] Status bar updates are smooth (no flicker)
- [ ] No layout shift when updating
- [ ] Transitions are smooth (0.2s)

### Memory
- [ ] No memory leaks after multiple worktree switches
- [ ] Browser stays responsive
- [ ] No accumulating event listeners

## Cross-Browser Tests

### Chrome/Edge
- [ ] All features work
- [ ] Icons render correctly
- [ ] Tooltips appear
- [ ] Click handlers work

### Firefox
- [ ] All features work
- [ ] Icons render correctly
- [ ] Tooltips appear
- [ ] Click handlers work

### Safari
- [ ] All features work
- [ ] Icons render correctly
- [ ] Tooltips appear
- [ ] Click handlers work

## Mobile/Tablet Tests

### Narrow Screen (< 800px)
- [ ] Status bar is visible
- [ ] Minimal text mode active
- [ ] All segments fit on screen
- [ ] No horizontal scroll
- [ ] Tap works (no hover on mobile)
- [ ] Tooltips appear on tap/long-press

## Accessibility Tests

### Screen Reader
- [ ] Status bar is announced
- [ ] Each segment is readable
- [ ] Tooltips are announced
- [ ] Click actions are announced

### Keyboard Navigation
- [ ] All segments reachable via Tab
- [ ] Enter activates segment
- [ ] Focus visible (2px blue outline)
- [ ] Tab order is logical

### Color Contrast
- [ ] Text is readable against background
- [ ] Colors meet WCAG AA standards
- [ ] High contrast mode works

### Motion
- [ ] Animations respect `prefers-reduced-motion`
- [ ] No jarring movements
- [ ] Transitions can be disabled

## Integration Tests

### With Sidebar
- [ ] Status bar doesn't overlap sidebar
- [ ] Sidebar actions work correctly
- [ ] Worktree selection triggers status bar update
- [ ] No layout conflicts

### With Terminals
- [ ] Status bar doesn't overlap terminal area
- [ ] Terminal area adjusts for status bar height
- [ ] No scrollbar issues
- [ ] Terminal resize works correctly

### With Modals
- [ ] Modals appear above status bar (z-index)
- [ ] Status bar visible when modal open
- [ ] Status bar accessible behind modal
- [ ] No interaction conflicts

### With Context Menus
- [ ] Context menus appear above status bar
- [ ] Status bar clicks don't close context menus
- [ ] No z-index conflicts

## Success Criteria

All tests should pass for the status bar to be considered complete:

- [ ] Visual appearance matches design
- [ ] All 5 segments display correctly
- [ ] Responsive design works at all breakpoints
- [ ] All click handlers function properly
- [ ] Tooltips show detailed information
- [ ] Auto-refresh works (15s visible, 2min hidden)
- [ ] Color coding reflects status accurately
- [ ] No console errors
- [ ] Graceful handling of missing data
- [ ] Accessibility features work
- [ ] Performance is acceptable
- [ ] Cross-browser compatibility
- [ ] Mobile/tablet support

## Notes for Testers

1. **Backend Data**: Some fields may not be available yet (ahead, behind, file counts, commit info). Status bar should handle this gracefully with defaults.

2. **Placeholder Features**: Changes modal and services modal are placeholders. This is expected and documented.

3. **GitHub URL**: Clicking last commit segment may show error if GitHub URL isn't configured. This is expected.

4. **Console Logs**: Debug logs are helpful for verifying event flow. Don't be alarmed by warning logs for missing data.

5. **Data Updates**: If data doesn't seem to update, check that backend is returning the expected fields in `/api/worktrees`.

## Reporting Issues

When reporting issues, please include:
1. Browser and version
2. Screen size/resolution
3. Selected worktree name
4. Console errors (if any)
5. Screenshot or video if visual issue
6. Steps to reproduce
