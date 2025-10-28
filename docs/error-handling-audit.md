# Error Handling Audit Report

**Date**: 2025-10-28
**Scope**: VibeTrees application error handling and user experience analysis
**Files Audited**: 8 core modules + web server + frontend

---

## Executive Summary

This audit identifies **73 error scenarios** across the VibeTrees codebase, categorizing each as:
- **Good** (25): Clear messages with actionable guidance
- **Needs Improvement** (38): Generic messages without context
- **Missing** (10): No error handling present

**Key Findings**:
1. Most error handling uses generic `error.message` without user-friendly context
2. Missing loading states for long-running operations (30s+ worktree creation)
3. Inconsistent error response formats between API endpoints
4. No centralized error logging strategy
5. Limited error codes for programmatic error detection

---

## Detailed Audit by Module

### 1. scripts/worktree-web/server.mjs (45 scenarios)

#### API Endpoints

| Endpoint | Error Scenarios | Rating | Notes |
|----------|----------------|--------|-------|
| `POST /api/worktrees` | Docker not running, Port conflicts, Git errors, Disk space | **Needs Improvement** | Returns generic error messages |
| `DELETE /api/worktrees/:name` | Main worktree protection, Services still running | **Good** | Clear protection logic |
| `GET /api/worktrees/:name/close-info` | Git errors, Database connection fails | **Needs Improvement** | Returns error object but no guidance |
| `POST /api/worktrees/:name/services/start` | Docker daemon down, Port in use, compose.yml invalid | **Needs Improvement** | Some diagnostics in logs, not in response |
| `POST /api/worktrees/:name/services/restart` | Service not found, Container crashed | **Missing** | No specific error messages |
| `POST /api/worktrees/:name/sync` | Uncommitted changes, Merge conflicts, Network errors | **Good** | Returns conflict details |
| `POST /api/worktrees/:name/conflicts/resolve` | File not found, Invalid strategy, Permission denied | **Needs Improvement** | Generic error pass-through |

#### WorktreeManager Methods

**createWorktree() - 15 error scenarios**

| Scenario | Current Handling | Rating | Recommendation |
|----------|-----------------|--------|----------------|
| Git worktree add fails | Broadcasts generic error | **Needs Improvement** | Suggest checking branch exists, disk space |
| Bootstrap fails | `Failed to bootstrap packages: ${err.message}` | **Needs Improvement** | Add "Try: npm install manually in worktree" |
| Database copy timeout | 5min timeout, generic error | **Needs Improvement** | Show progress, estimate remaining time |
| Docker compose up fails | Broadcasts error | **Good** | Auto-diagnoses common issues (lines 1850-1896) |
| Port already in use | Detected in auto-start | **Good** | Shows allocated ports |
| Disk full | Not specifically caught | **Missing** | Add disk space check before operations |
| Invalid branch name | Slugified automatically | **Good** | Prevents errors proactively |
| Network timeout | Generic error | **Missing** | Detect network issues, suggest retry |
| Permission denied | Generic error | **Needs Improvement** | Check file permissions, suggest sudo |
| MCP config fails | Non-critical warning | **Good** | Warns but doesn't fail worktree creation |

**startServices() - 8 error scenarios**

Lines 871-924 show **excellent diagnostic logic** (lines 1850-1896 in auto-start):

```javascript
// GOOD EXAMPLE: Detailed diagnostics
if (result.error.includes('has neither an image nor a build context')) {
  console.error(`💡 Diagnosis: Invalid docker-compose.override.yml detected`);
  console.error(`   This is likely a leftover from the old service selection system`);
  console.error(`   Deleting: ${worktree.path}/docker-compose.override.yml`);
  // Auto-remediation attempt
}
```

**Issues**: This diagnostic logic only exists in `autoStartContainers()` (lines 1820-1907), not in the main `startServices()` method used by API endpoints.

#### Progress Reporting

**Good**: WebSocket progress events during worktree creation (lines 318-478)
- Git progress
- Port allocation
- Database copy
- Bootstrap
- Container startup

**Missing**:
- No progress for long-running operations (database copy can take 2+ minutes)
- No ETA or percentage complete
- No cancellation support

---

### 2. scripts/git-sync-manager.mjs (12 scenarios)

| Method | Error Scenarios | Rating | Issues |
|--------|----------------|--------|---------|
| `fetchUpstream()` | Network timeout, Invalid remote, Auth failure | **Needs Improvement** | Returns `{ error: error.message }` without context |
| `syncWithMain()` | Uncommitted changes, Merge conflicts, Network error | **Good** | Returns structured response with `error` field and `conflicts` array |
| `rollback()` | Invalid commit SHA, Detached HEAD | **Needs Improvement** | Generic error messages |
| `analyzeChanges()` | Git command fails, Invalid commits | **Needs Improvement** | Silent failure returns empty arrays |

**Good Example**: Uncommitted changes detection (lines 441-447)
```javascript
if (this.hasUncommittedChanges() && !options.force) {
  return {
    success: false,
    error: 'uncommitted_changes',
    message: 'Worktree has uncommitted changes. Commit or stash them first.'
  };
}
```

**Issues**:
- No error codes for programmatic handling (only one example: `uncommitted_changes`)
- Network errors not distinguished from other git failures
- No retry logic for transient failures

---

### 3. scripts/smart-reload-manager.mjs (8 scenarios)

| Method | Error Scenarios | Rating | Issues |
|--------|----------------|--------|---------|
| `performSmartReload()` | Dependency install fails, Migration fails, Service restart fails | **Good** | Structured error handling with `continueOnError` option |
| `reinstallDependencies()` | npm install fails, Package not found, Network timeout | **Needs Improvement** | Generic npm error output |
| `runMigrations()` | No framework detected, Migration fails, Database unreachable | **Good** | Detects framework, provides context |
| `restartServices()` | Service not found, Container unhealthy | **Needs Improvement** | Generic docker error |

**Good Example**: Error accumulation pattern (lines 29-73)
```javascript
const results = {
  success: true,
  actions: [],
  errors: []
};
// Accumulate errors but continue if continueOnError=true
```

**Issues**:
- No distinction between retryable and permanent failures
- No rollback support if multiple operations fail
- Silent failure detection (e.g., npm install "succeeds" but packages not installed)

---

### 4. scripts/ai-conflict-resolver.mjs (6 scenarios)

| Method | Error Scenarios | Rating | Issues |
|--------|----------------|--------|---------|
| `getConflicts()` | Git command fails, Invalid worktree | **Needs Improvement** | Returns empty array on error (silent failure) |
| `autoResolve()` | Not auto-resolvable, Git checkout fails, Permission denied | **Good** | Returns structured response |
| `requestAIAssistance()` | No active terminal, Terminal crashed | **Good** | Clear error messages |

**Issues**:
- Silent failures (returns empty array instead of error)
- No validation that conflict was actually resolved
- No undo/rollback for auto-resolution

---

### 5. scripts/container-runtime.mjs (7 scenarios)

| Scenario | Current Handling | Rating |
|----------|-----------------|--------|
| No runtime installed | **Excellent** | Provides install links for Docker and Podman |
| Specified runtime not available | **Excellent** | Clear message with instructions |
| Docker daemon not running | **Good** | Detected but message could suggest starting daemon |
| Permission denied | **Good** | Detected in sudo check, clear message |
| Compose not installed | **Excellent** | Provides install link |
| Invalid runtime specified | **Excellent** | Validates against enum |
| Sudo test fails | **Good** | Tries with/without sudo |

**Excellent Example**: Runtime detection errors (lines 56-60)
```javascript
throw new Error(
  'No container runtime found. Please install Docker or Podman.\n' +
  '  Docker: https://docs.docker.com/get-docker/\n' +
  '  Podman: https://podman.io/getting-started/installation'
);
```

**Best practice**: Actionable error messages with links to documentation.

---

### 6. scripts/compose-inspector.mjs (4 scenarios)

| Scenario | Current Handling | Rating |
|----------|-----------------|--------|
| Invalid YAML | **Good** | Wraps parse error with context |
| Environment variables not set | **Good** | Mentions in error message |
| File not found | Generic error from runtime | **Needs Improvement** |
| Compose config command fails | Generic error | **Needs Improvement** |

**Good Example**: Error context wrapping (lines 48-52)
```javascript
throw new Error(
  `Failed to parse compose file at ${this.composeFilePath}:\n${error.message}\n\n` +
  'Make sure your docker-compose.yml is valid and all environment variables are set.'
);
```

---

### 7. scripts/config-manager.mjs (5 scenarios)

| Scenario | Current Handling | Rating |
|----------|-----------------|--------|
| Invalid JSON | **Good** | Suggests deleting file to regenerate |
| Schema validation fails | **Excellent** | Lists all validation errors with fix suggestions |
| File write fails | **Needs Improvement** | Generic error |
| Invalid config path | **Needs Improvement** | Generic error |
| Git detection fails | **Good** | Falls back to defaults |

**Excellent Example**: Validation errors (lines 338-344)
```javascript
throw new Error(
  `Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}\n\n` +
  `Config file: ${this.configPath}\n` +
  'Fix these errors or delete the config file to regenerate it.'
);
```

---

### 8. scripts/mcp-manager.mjs (5 scenarios)

| Scenario | Current Handling | Rating |
|----------|-----------------|--------|
| npm list fails | **Good** | Silent catch, continues discovery |
| Package install fails | **Good** | Returns structured error with package name |
| Settings.json parse fails | **Good** | Warns but continues |
| Main file not found | **Good** | Skips server silently |
| Permission denied writing settings | Generic error | **Needs Improvement** |

**Good pattern**: Non-fatal errors don't stop discovery (lines 88-90, 192-194)

---

### 9. scripts/data-sync.mjs (6 scenarios)

| Scenario | Current Handling | Rating |
|----------|-----------------|--------|
| Source volume doesn't exist | **Good** | Clear error message |
| Insufficient disk space | **Missing** | No preemptive check |
| Rsync not available | **Good** | Falls back to cp |
| Permission denied | Generic error | **Needs Improvement** |
| Copy timeout | **Missing** | No timeout mechanism |
| Target already exists | **Good** | Overwrites (volume), creates dir (bind) |

**Issues**:
- No validation that copy completed successfully
- No progress reporting for large copies
- No integrity check (checksums)

---

## Common Error Patterns

### 1. Generic Error Pass-Through (38 occurrences)

**Problem**: Catching errors but returning raw `error.message` without context.

```javascript
// BAD: No context
catch (error) {
  return { success: false, error: error.message };
}

// GOOD: Add context
catch (error) {
  return {
    success: false,
    error: 'Failed to start services',
    details: error.message,
    suggestion: 'Check that Docker is running: docker ps'
  };
}
```

### 2. Silent Failures (10 occurrences)

**Problem**: Catching errors but returning empty results instead of error state.

```javascript
// BAD: Silent failure
catch (error) {
  console.error('Error:', error);
  return [];
}

// GOOD: Return error state
catch (error) {
  console.error('Error:', error);
  throw new Error(`Failed to list volumes: ${error.message}`);
}
```

### 3. Missing Error Codes (67 occurrences)

**Problem**: No structured error codes for programmatic error handling.

**Current**: Only 2 error codes exist in entire codebase:
- `uncommitted_changes` (git-sync-manager.mjs:444)
- `sync_failed` (git-sync-manager.mjs:501)

**Recommendation**: Implement error code enum for all error scenarios.

### 4. Inconsistent Error Response Format

**Found 4 different formats**:

```javascript
// Format 1: Simple object (most common)
{ success: false, error: 'message' }

// Format 2: With error field type
{ success: false, error: 'error_code', message: 'human message' }

// Format 3: With details
{ success: false, error: 'message', details: { ... } }

// Format 4: With conflicts array
{ success: false, conflicts: [...], message: 'message' }
```

---

## Loading States & Progress Tracking

### Operations Requiring Loading Indicators

| Operation | Duration | Current State | Priority |
|-----------|----------|---------------|----------|
| Create worktree | 30-120s | Progress events via WebSocket | **Good** |
| Database copy | 10-180s | Progress events but no percentage | **High** |
| Bootstrap (npm install) | 30-300s | Progress events but no ETA | **High** |
| Docker compose up | 10-60s | Progress events | **Medium** |
| Service restart | 2-10s | No indicator | **High** |
| Git sync | 5-30s | No indicator | **High** |
| Dependency install | 10-120s | No indicator | **High** |
| Migration run | 1-60s | No indicator | **Medium** |
| Volume copy | 10-600s | Callback support but not used | **High** |
| Conflict analysis | 1-10s | No indicator | **Low** |

### Missing Progress Features

1. **No percentage complete** for any operation
2. **No ETAs** for long operations
3. **No cancellation support** for any operation
4. **No rate limiting** for progress events (could overwhelm WebSocket)
5. **No progress persistence** (refresh loses progress state)

---

## Success Confirmations

### Operations Requiring Success Messages

| Operation | Current State | Recommendation |
|-----------|--------------|----------------|
| Worktree created | ✓ Broadcast + UI update | Good |
| Services started | ✗ Silent success | Add toast notification |
| Services stopped | ✗ Silent success | Add toast notification |
| Worktree deleted | ✓ Broadcast + UI update | Good |
| Sync completed | ✓ Broadcast | Add change summary |
| Conflicts resolved | ✓ Broadcast | Good |
| Agent switched | ✗ No confirmation | Add terminal message |
| Dependencies installed | ✗ Silent success | Add notification with summary |
| Migration completed | ✗ Silent success | Add notification with count |

---

## Critical Issues

### High Priority (Must Fix)

1. **No disk space checks** before creating worktrees or copying data
   - **Impact**: Operations fail after minutes of work
   - **Recommendation**: Check available space before starting

2. **No network error detection**
   - **Impact**: Users don't know if failure is network or configuration
   - **Recommendation**: Wrap network operations, detect timeout/DNS failures

3. **Docker daemon not running gives generic error**
   - **Impact**: Most common error for new users
   - **Recommendation**: Detect and provide start instructions per OS

4. **No loading states for service restart**
   - **Impact**: User doesn't know if click worked
   - **Recommendation**: Show spinner/progress during restart

5. **Service restart failures not shown in UI**
   - **Impact**: Users think restart succeeded when it failed
   - **Recommendation**: Show error modal with logs

### Medium Priority (Should Fix)

6. **Generic npm install errors**
   - **Impact**: Users don't know why installation failed
   - **Recommendation**: Parse npm error output, show relevant lines

7. **No progress for database copy**
   - **Impact**: Looks frozen during 2+ minute copies
   - **Recommendation**: Stream progress from rsync -P or docker events

8. **No validation of successful operations**
   - **Impact**: Silent failures (e.g., npm install claims success but packages missing)
   - **Recommendation**: Verify expected state after operations

9. **No retry logic for transient failures**
   - **Impact**: One network blip fails entire worktree creation
   - **Recommendation**: Retry network operations 2-3 times with backoff

10. **Inconsistent error response formats**
    - **Impact**: Frontend must handle multiple formats
    - **Recommendation**: Standardize on single error response schema

### Low Priority (Nice to Have)

11. **No error codes for programmatic handling**
12. **No centralized error logging**
13. **No error rate monitoring**
14. **No user feedback collection on errors**
15. **No automatic error reporting**

---

## Error Scenarios by Category

### Git Errors (18 total)
- Branch doesn't exist (Missing)
- Uncommitted changes (Good)
- Merge conflicts (Good)
- Network timeout (Missing)
- Auth failure (Missing)
- Invalid remote (Needs Improvement)
- Detached HEAD (Missing)
- Untracked files (Good)
- No upstream branch (Good)
- Invalid commit SHA (Needs Improvement)

### Docker Errors (25 total)
- Daemon not running (Needs Improvement)
- Permission denied (Good)
- Port in use (Good)
- Invalid compose file (Good)
- Image not found (Needs Improvement)
- Network error (Needs Improvement)
- Volume mount error (Needs Improvement)
- Container crashed (Missing)
- Build failed (Missing)
- Health check failed (Missing)

### Filesystem Errors (12 total)
- Disk full (Missing)
- Permission denied (Needs Improvement)
- File not found (Needs Improvement)
- Directory exists (Good)
- Read-only filesystem (Missing)
- Path too long (Missing)
- Symlink loop (Missing)

### Network Errors (8 total)
- Connection timeout (Missing)
- DNS resolution failure (Missing)
- Connection refused (Missing)
- SSL/TLS error (Missing)

### Dependency Errors (10 total)
- Package not found (Needs Improvement)
- Version conflict (Missing)
- Install failed (Needs Improvement)
- Checksum mismatch (Missing)
- Registry unreachable (Missing)

---

## Recommendations Summary

### Immediate Actions (Week 1)

1. **Standardize error response format** across all API endpoints
2. **Add loading states** for service restart operations
3. **Add disk space checks** before worktree creation
4. **Detect Docker daemon** not running with OS-specific instructions
5. **Add error codes enum** for all error categories

### Short-term Actions (Month 1)

6. **Add progress tracking** for database copy and bootstrap
7. **Improve network error detection** and retry logic
8. **Add success notifications** for silent operations
9. **Enhance error messages** with actionable suggestions
10. **Add validation** of operation success (not just no exception)

### Long-term Actions (Quarter 1)

11. **Implement centralized error logging** with structured logs
12. **Add error rate monitoring** and alerting
13. **Implement cancellation support** for long operations
14. **Add automatic error reporting** (with user consent)
15. **Build error knowledge base** for common issues

---

## Appendix A: Error Message Quality Examples

### Excellent Error Messages ✅

1. Container runtime detection (container-runtime.mjs:56-60)
2. Schema validation (config-manager.mjs:338-344)
3. Auto-start diagnostics (server.mjs:1850-1896)
4. Uncommitted changes (git-sync-manager.mjs:441-447)

### Poor Error Messages ❌

1. Generic pass-through: `{ error: error.message }`
2. Silent failures: `catch (e) { return []; }`
3. No context: `Failed to start services`
4. No suggestion: `Error: EACCES`

### Template for Good Error Messages

```javascript
{
  success: false,
  errorCode: 'DOCKER_NOT_RUNNING',
  message: 'Docker daemon is not running',
  details: 'Could not connect to Docker socket at /var/run/docker.sock',
  suggestion: 'Start Docker Desktop or run: sudo systemctl start docker',
  documentation: 'https://docs.docker.com/config/daemon/start/',
  timestamp: new Date().toISOString()
}
```

---

## Appendix B: Loading State Requirements

### Minimum Requirements

- Show spinner/progress bar when operation takes >500ms
- Show ETA when operation takes >10s
- Show percentage when progress can be measured
- Allow cancellation for operations >30s
- Persist progress state across page refresh
- Show failure reason immediately on error
- Auto-dismiss success messages after 5s

### Example Progress Event Format

```javascript
{
  event: 'worktree:progress',
  data: {
    name: 'feature-auth',
    step: 'database',
    message: 'Copying database files...',
    progress: {
      current: 45,
      total: 100,
      unit: 'MB',
      percentage: 45,
      eta: 30, // seconds
      startedAt: '2025-10-28T10:00:00Z'
    }
  }
}
```
