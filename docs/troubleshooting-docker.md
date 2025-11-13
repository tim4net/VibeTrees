# Docker Runtime Detection Troubleshooting

## Issue: Containers Not Listed After Docker Restart

### Symptoms
- VibeTrees web UI shows no containers
- Container status monitoring appears broken
- Docker commands work fine from terminal

### Root Cause
VibeTrees detects the container runtime (Docker/Podman) **once at server startup**. If Docker is:
1. Stopped when the server starts → Server uses `NullRuntime` (graceful degradation)
2. Started later → Server doesn't re-detect the runtime automatically

This is by design for performance - runtime detection is intentionally done once at startup rather than on every operation.

### Solution
**Simply restart the VibeTrees server:**

```bash
# Stop the server (Ctrl+C if running in foreground)
# OR if running in background:
pkill -f "worktree-web/server.mjs"

# Start it again:
npm run web
```

The server will detect Docker on startup and container monitoring will work normally.

### Prevention
**Start Docker/OrbStack before starting VibeTrees server** to avoid this scenario:

```bash
# For OrbStack users:
orb start

# Verify Docker is running:
docker ps

# Now start VibeTrees:
npm run web
```

### Technical Details

The runtime detection happens in `scripts/worktree-web/server.mjs`:

```javascript
let runtime;
try {
  runtime = new ContainerRuntime();
  console.log(`🐳 Container runtime: ${runtime.getRuntime()}`);
} catch (error) {
  console.error(`⚠️  ${error.message}`);
  console.warn('⚠️  Docker services will not be available.');
  runtime = new NullRuntime();
}
```

**Why not re-detect at runtime?**
- Performance: Runtime detection involves multiple system calls and command executions
- Simplicity: Server state is consistent throughout its lifetime
- Reliability: Avoids race conditions from runtime state changes during operations

**NullRuntime behavior:**
- Returns empty results for all container queries
- Prevents crashes when Docker is unavailable
- Allows terminals and other features to work normally
- UI gracefully shows "no containers" rather than erroring

### Related Files
- `scripts/worktree-web/server.mjs` - Runtime initialization
- `scripts/container-runtime.mjs` - Docker/Podman detection
- `scripts/null-runtime.mjs` - Fallback for unavailable runtime
- `scripts/compose-inspector.mjs` - Container status queries
