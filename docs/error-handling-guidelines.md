# Error Handling Guidelines

**Version**: 1.0
**Last Updated**: 2025-10-28
**Status**: Standards Document

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Error Message Standards](#error-message-standards)
3. [Error Response Format](#error-response-format)
4. [Error Codes](#error-codes)
5. [Logging Strategy](#logging-strategy)
6. [User-Facing vs Developer-Facing Errors](#user-facing-vs-developer-facing-errors)
7. [Examples](#examples)
8. [Checklist](#checklist)

---

## Core Principles

### 1. **Fail Fast, Fail Clearly**

Detect errors early and provide immediate, actionable feedback.

```javascript
// ✅ GOOD: Validate before starting work
if (!existsSync(worktreePath)) {
  throw new Error(`Worktree not found: ${worktreePath}`);
}

// ❌ BAD: Let it fail deep in execution
createWorktree(); // Fails 5 steps later with generic error
```

### 2. **Never Fail Silently**

Every error must be logged or reported. No swallowed exceptions.

```javascript
// ✅ GOOD: Log and propagate
catch (error) {
  errorLogger.log(error, { context: 'database_copy' });
  throw error;
}

// ❌ BAD: Silent failure
catch (error) {
  return []; // Looks like success!
}
```

### 3. **Provide Context and Next Steps**

Users should understand what failed and what to do about it.

```javascript
// ✅ GOOD: Actionable error
{
  message: 'Docker daemon is not running',
  suggestion: 'Start Docker Desktop or run: sudo systemctl start docker',
  documentation: 'https://docs.docker.com/config/daemon/start/'
}

// ❌ BAD: Generic error
{
  error: 'spawn docker ENOENT'
}
```

### 4. **Distinguish Error Types**

Different errors need different handling (retryable vs permanent, user error vs system error).

```javascript
// ✅ GOOD: Categorized errors
if (isNetworkError(error)) {
  return retry(operation);
} else if (isValidationError(error)) {
  return showUserError(error);
} else {
  return reportBug(error);
}
```

### 5. **Log Technical Details, Show User-Friendly Messages**

Keep full details in logs, show simplified version to users.

```javascript
// ✅ GOOD: Separate concerns
errorLogger.log(error, { stack: error.stack, operation: 'sync' });

return {
  message: 'Failed to sync with main branch',
  suggestion: 'Check your network connection'
  // Don't expose: stack trace, file paths, internal details
};
```

---

## Error Message Standards

### Message Structure

Every error message should answer:
1. **What** happened? (Clear statement of failure)
2. **Why** did it happen? (Root cause if known)
3. **What** should the user do? (Next steps)

### Template

```
{WHAT}: {BRIEF_DESCRIPTION}

{WHY}: {ROOT_CAUSE}

{HOW_TO_FIX}: {ACTIONABLE_STEPS}

[Optional] {DOCUMENTATION}: {LINK}
```

### Good vs Bad Examples

| ❌ Bad | ✅ Good |
|--------|---------|
| "Error" | "Docker daemon is not running" |
| "Failed" | "Failed to start services: Port 3000 is already in use" |
| "EACCES" | "Permission denied accessing /var/run/docker.sock. Run with sudo or add user to docker group." |
| "Command failed with exit code 1" | "npm install failed: Package '@foo/bar' not found in registry. Check package name and version." |
| "Operation timed out" | "Git fetch timed out after 30s. Check your network connection and try again." |

### Writing Style

- **Use active voice**: "Docker is not running" (not "Docker has been determined to not be in a running state")
- **Be specific**: "Port 3000 is in use" (not "Port conflict detected")
- **Avoid jargon**: "Database not responding" (not "ECONNREFUSED on PG socket")
- **Be concise**: 1-2 sentences maximum for user-facing messages
- **Include commands**: "Run: docker ps" (with actual commands to try)

---

## Error Response Format

### Standard Structure

All API endpoints and async operations must return errors in this format:

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;           // Machine-readable error code (e.g., 'DOCKER_NOT_RUNNING')
    message: string;        // Human-readable message (1-2 sentences)
    details?: object;       // Additional context (stack trace, file paths, etc.)
    suggestion?: string;    // Actionable next step for user
    documentation?: string; // Link to docs/troubleshooting guide
    timestamp: string;      // ISO 8601 timestamp
  };
  data?: any;              // Additional error-specific data (e.g., conflicts array)
}
```

### Success Response Format

```typescript
interface SuccessResponse {
  success: true;
  data: any;  // Operation result
}
```

### Using ErrorResponse Utility

```javascript
import { ErrorResponse, ErrorCodes } from './utils/error-response.mjs';

// Return error
return ErrorResponse.create({
  code: ErrorCodes.DOCKER_NOT_RUNNING,
  message: 'Docker daemon is not running',
  details: { originalError: error.message },
  suggestion: 'Start Docker Desktop or run: sudo systemctl start docker',
  documentation: 'https://docs.docker.com/config/daemon/start/'
});

// Return success
return ErrorResponse.success({ worktree: { name, path, ports } });
```

---

## Error Codes

### Code Format

`{CATEGORY}_{SPECIFIC_ERROR}`

**Categories**:
- `GIT_*` - Git operations (1000-1999)
- `DOCKER_*` - Docker operations (2000-2999)
- `FS_*` - Filesystem operations (3000-3999)
- `NETWORK_*` - Network operations (4000-4999)
- `DEPS_*` - Dependency management (5000-5999)
- `WORKTREE_*` - Worktree operations (6000-6999)
- `MCP_*` - MCP server operations (7000-7999)
- `CONFIG_*` - Configuration errors (8000-8999)
- `*` - Generic errors (9000-9999)

### Common Error Codes

```javascript
// Git (1000-1999)
GIT_UNCOMMITTED_CHANGES = 'GIT_UNCOMMITTED_CHANGES'      // 1001
GIT_MERGE_CONFLICT = 'GIT_MERGE_CONFLICT'                // 1002
GIT_NETWORK_ERROR = 'GIT_NETWORK_ERROR'                  // 1003
GIT_BRANCH_NOT_FOUND = 'GIT_BRANCH_NOT_FOUND'            // 1004

// Docker (2000-2999)
DOCKER_NOT_INSTALLED = 'DOCKER_NOT_INSTALLED'            // 2001
DOCKER_NOT_RUNNING = 'DOCKER_NOT_RUNNING'                // 2002
DOCKER_PERMISSION_DENIED = 'DOCKER_PERMISSION_DENIED'    // 2003
DOCKER_PORT_IN_USE = 'DOCKER_PORT_IN_USE'                // 2004
DOCKER_COMPOSE_INVALID = 'DOCKER_COMPOSE_INVALID'        // 2005
DOCKER_SERVICE_FAILED = 'DOCKER_SERVICE_FAILED'          // 2006

// Filesystem (3000-3999)
FS_DISK_FULL = 'FS_DISK_FULL'                           // 3001
FS_PERMISSION_DENIED = 'FS_PERMISSION_DENIED'            // 3002
FS_NOT_FOUND = 'FS_NOT_FOUND'                           // 3003
FS_ALREADY_EXISTS = 'FS_ALREADY_EXISTS'                 // 3004

// Network (4000-4999)
NETWORK_TIMEOUT = 'NETWORK_TIMEOUT'                      // 4001
NETWORK_DNS_ERROR = 'NETWORK_DNS_ERROR'                  // 4002
NETWORK_CONNECTION_REFUSED = 'NETWORK_CONNECTION_REFUSED' // 4003
NETWORK_SSL_ERROR = 'NETWORK_SSL_ERROR'                  // 4004

// Dependencies (5000-5999)
DEPS_INSTALL_FAILED = 'DEPS_INSTALL_FAILED'              // 5001
DEPS_PACKAGE_NOT_FOUND = 'DEPS_PACKAGE_NOT_FOUND'        // 5002
DEPS_VERSION_CONFLICT = 'DEPS_VERSION_CONFLICT'          // 5003

// Worktree (6000-6999)
WORKTREE_CREATE_FAILED = 'WORKTREE_CREATE_FAILED'        // 6001
WORKTREE_NOT_FOUND = 'WORKTREE_NOT_FOUND'                // 6002
WORKTREE_MAIN_PROTECTED = 'WORKTREE_MAIN_PROTECTED'      // 6003

// Generic (9000-9999)
UNKNOWN_ERROR = 'UNKNOWN_ERROR'                          // 9001
OPERATION_CANCELLED = 'OPERATION_CANCELLED'              // 9002
OPERATION_TIMEOUT = 'OPERATION_TIMEOUT'                  // 9003
VALIDATION_ERROR = 'VALIDATION_ERROR'                    // 9004
```

### When to Create New Error Codes

Create a new error code when:
- Error needs different handling logic
- Error occurs frequently enough to track
- Error has specific recovery steps

Don't create error codes for:
- One-off errors
- Errors that are subcategories of existing codes
- Internal errors that users will never see

---

## Logging Strategy

### Log Levels

```javascript
// ERROR: Application errors that need attention
errorLogger.error(error, { operation: 'create_worktree' });

// WARN: Potential issues, but operation continues
errorLogger.warn('MCP server discovery failed, continuing...');

// INFO: Important operational events
errorLogger.info('Worktree created', { name, duration: '45s' });

// DEBUG: Detailed diagnostic information (development only)
errorLogger.debug('Git status:', { status: output });
```

### What to Log

**Always log**:
- All exceptions and errors
- Operation start/completion times
- User actions (worktree create, service restart)
- Configuration changes
- External service failures (Docker, Git, npm)

**Never log**:
- Sensitive data (passwords, API keys, tokens)
- Personal information (email addresses, IP addresses beyond local network)
- Full file contents
- Binary data

### Log Format

```javascript
{
  timestamp: '2025-10-28T10:30:45.123Z',
  level: 'ERROR',
  message: 'Failed to start Docker services',
  error: {
    code: 'DOCKER_SERVICE_FAILED',
    message: 'Port 3000 is already in use',
    stack: '...'  // Full stack trace
  },
  context: {
    operation: 'start_services',
    worktree: 'feature-auth',
    service: 'api',
    user: 'tim',
    platform: 'darwin',
    nodeVersion: 'v18.0.0',
    vibeVersion: '1.0.0'
  }
}
```

### Where to Log

```javascript
// Structured logs to file
errorLogger.log(error, context);  // ~/.vibe-worktrees/logs/errors.log

// Console for development
console.error('[Operation]', message, details);

// Future: Send to monitoring service
// sendToSentry(error, context);
// sendToLogRocket(error, context);
```

---

## User-Facing vs Developer-Facing Errors

### User-Facing Errors

**Audience**: End users (may not be technical)

**Guidelines**:
- Use plain language
- Focus on what to do next
- Hide technical details
- Provide documentation links
- Be encouraging ("This is easy to fix!")

**Example**:
```
Docker is not running

VibeTrees needs Docker to run services. Please start Docker Desktop
from your Applications folder, then try again.

Need help? https://docs.vibetrees.dev/troubleshooting/docker
```

### Developer-Facing Errors

**Audience**: Developers debugging issues

**Guidelines**:
- Include technical details
- Show full stack traces
- Include file paths and line numbers
- Reference relevant code/docs
- Suggest debugging commands

**Example**:
```
Error: spawn docker ENOENT
  at Process.ChildProcess._handle.onexit (node:internal/child_process:283:19)
  at onErrorNT (node:internal/child_process:476:16)

Docker executable not found in PATH.
PATH: /usr/local/bin:/usr/bin:/bin

Debug: which docker
```

### Where Each Type Appears

| Context | User-Facing | Developer-Facing |
|---------|-------------|------------------|
| UI error modals | ✅ | ❌ |
| API error responses | ✅ | ❌ (in `details` field) |
| Console logs | ❌ | ✅ |
| Log files | ❌ | ✅ |
| Error monitoring (Sentry) | ❌ | ✅ |
| Status messages | ✅ | ❌ |

---

## Examples

### Example 1: Docker Not Running

```javascript
// Detect error
catch (error) {
  if (error.message.includes('Cannot connect to the Docker daemon')) {

    // Log full details for developers
    errorLogger.error(error, {
      operation: 'start_services',
      worktree: worktreeName,
      stack: error.stack
    });

    // Return user-friendly error
    return ErrorResponse.create({
      code: ErrorCodes.DOCKER_NOT_RUNNING,
      message: 'Docker daemon is not running',
      details: {
        originalError: error.message,
        stack: error.stack  // Available but not displayed to user
      },
      suggestion: process.platform === 'darwin'
        ? 'Start Docker Desktop from Applications'
        : 'Run: sudo systemctl start docker',
      documentation: 'https://docs.docker.com/config/daemon/start/'
    });
  }
}
```

### Example 2: Network Timeout

```javascript
try {
  await NetworkRetry.execWithRetry('git fetch origin', {
    timeout: 30000,
    retries: 3
  });
} catch (error) {
  // Enhanced error has retry information
  errorLogger.error(error, {
    operation: 'git_fetch',
    attempts: error.attempts,
    maxAttempts: error.maxAttempts
  });

  return ErrorResponse.create({
    code: ErrorCodes.NETWORK_TIMEOUT,
    message: `Git fetch timed out after ${error.attempts} attempts`,
    details: {
      timeout: 30000,
      attempts: error.attempts
    },
    suggestion: 'Check your internet connection and try again',
    documentation: 'https://docs.vibetrees.dev/troubleshooting/network'
  });
}
```

### Example 3: Validation Error

```javascript
// Validate before operation
const validation = await DiskSpaceValidator.checkSpace(worktreePath, 2048);

if (!validation.hasSpace) {
  // User error - don't log as system error
  errorLogger.info('Validation failed: insufficient disk space', {
    available: validation.availableMB,
    required: validation.requiredMB
  });

  return ErrorResponse.create({
    code: ErrorCodes.FS_DISK_FULL,
    message: 'Not enough disk space to create worktree',
    details: {
      availableMB: validation.availableMB,
      requiredMB: validation.requiredMB,
      path: worktreePath
    },
    suggestion: 'Free up at least 2GB of disk space, then try again'
  });
}
```

### Example 4: Service Restart with Progress

```javascript
async function restartService(worktreeName, serviceName) {
  try {
    // Broadcast progress
    manager.broadcast('service:restarting', {
      worktree: worktreeName,
      service: serviceName,
      status: 'stopping'
    });

    // Restart
    await runtime.execCompose(`restart ${serviceName}`, {
      cwd: worktreePath
    });

    // Wait for health check
    await manager._waitForServiceHealth(worktreePath, serviceName, 30000);

    // Success!
    manager.broadcast('service:restarted', {
      worktree: worktreeName,
      service: serviceName,
      status: 'running'
    });

    return ErrorResponse.success({ service: serviceName, status: 'running' });

  } catch (error) {
    errorLogger.error(error, {
      operation: 'restart_service',
      service: serviceName,
      worktree: worktreeName
    });

    // Broadcast failure
    manager.broadcast('service:restart-failed', {
      worktree: worktreeName,
      service: serviceName,
      error: error.message
    });

    return ErrorResponse.create({
      code: ErrorCodes.DOCKER_SERVICE_FAILED,
      message: `Service "${serviceName}" failed to start`,
      details: {
        service: serviceName,
        worktree: worktreeName,
        error: error.message
      },
      suggestion: `Check service logs: docker compose logs ${serviceName}`
    });
  }
}
```

---

## Checklist

Use this checklist when handling errors:

### Before Throwing/Returning Error

- [ ] Is the error message clear and specific?
- [ ] Does it explain what failed (not just "error")?
- [ ] Does it include actionable next steps?
- [ ] Is technical jargon avoided or explained?
- [ ] Is there a relevant documentation link?
- [ ] Is the error code appropriate for the category?
- [ ] Are sensitive details excluded?

### Error Logging

- [ ] Is the error logged with full context?
- [ ] Is the log level appropriate (ERROR vs WARN)?
- [ ] Does the log include relevant context (operation, worktree, user)?
- [ ] Are stack traces included in logs?
- [ ] Are sensitive details excluded from logs?

### Error Response

- [ ] Does the response follow the standard format?
- [ ] Is `success: false` set?
- [ ] Is there an error code?
- [ ] Is there a user-friendly message?
- [ ] Is there a suggestion for next steps?
- [ ] Are technical details in the `details` field?

### User Experience

- [ ] Will the user understand what went wrong?
- [ ] Will the user know what to do next?
- [ ] Is the error message encouraging (not blaming)?
- [ ] Is there a loading/progress indicator before error?
- [ ] Is the error displayed prominently (not hidden)?

### Testing

- [ ] Can you trigger this error in testing?
- [ ] Does the error message make sense to a non-technical user?
- [ ] Does the error code allow programmatic handling?
- [ ] Is the error retryable if appropriate?
- [ ] Is there a way to recover from this error?

---

## Anti-Patterns to Avoid

### ❌ Swallowing Exceptions

```javascript
// DON'T
catch (error) {
  console.log('Error occurred');
  return [];  // Looks like success
}

// DO
catch (error) {
  errorLogger.error(error, context);
  throw error;  // Or return ErrorResponse
}
```

### ❌ Generic Error Messages

```javascript
// DON'T
throw new Error('Failed');

// DO
throw new Error('Failed to start Docker services: Port 3000 is already in use');
```

### ❌ Exposing Internal Details to Users

```javascript
// DON'T
return {
  error: 'Error: EACCES: permission denied, open /var/run/docker.sock'
};

// DO
return ErrorResponse.create({
  code: ErrorCodes.DOCKER_PERMISSION_DENIED,
  message: 'Permission denied accessing Docker',
  suggestion: 'Add your user to the docker group or run with sudo',
  details: { originalError: error.message }  // Hidden from UI
});
```

### ❌ No Context in Logs

```javascript
// DON'T
console.error(error);

// DO
errorLogger.error(error, {
  operation: 'create_worktree',
  worktree: worktreeName,
  branch: branchName,
  fromBranch: fromBranch
});
```

### ❌ Inconsistent Error Formats

```javascript
// DON'T mix formats
return { error: 'message' };
return { success: false, message: 'error' };
return { err: { msg: 'error' } };

// DO use standard format
return ErrorResponse.create({ ... });
```

---

## Resources

- [Error Response Utility](/scripts/utils/error-response.mjs)
- [Error Logger](/scripts/utils/error-logger.mjs)
- [Network Retry Utility](/scripts/utils/network-retry.mjs)
- [Error Handling Audit](/docs/error-handling-audit.md)
- [Error Handling Improvements](/docs/error-handling-improvements.md)

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-28 | Initial guidelines document |
