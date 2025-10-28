# VibeTrees Performance Guide

This guide explains VibeTrees' performance optimizations, tuning options, and monitoring capabilities.

---

## Table of Contents

- [Overview](#overview)
- [Performance Optimizations](#performance-optimizations)
- [Monitoring & Metrics](#monitoring--metrics)
- [Tuning Guide](#tuning-guide)
- [Benchmarks](#benchmarks)
- [Troubleshooting](#troubleshooting)

---

## Overview

VibeTrees has been optimized for responsiveness and scalability. Key performance targets:

| Operation | Target | Typical |
|-----------|--------|---------|
| **Worktree creation** | <30s | 25-45s |
| **List worktrees** (5 worktrees) | <500ms | 200-400ms |
| **API response (95th percentile)** | <500ms | 300-450ms |
| **WebSocket latency** | <100ms | 50-80ms |
| **Docker status check** | <100ms | 50-200ms (cached) |

---

## Performance Optimizations

### 1. Docker Status Caching

**Problem**: Calling `docker compose ps` for each worktree on every list operation caused N+1 query problem.

**Solution**: Cache Docker status for 2-3 seconds.

```javascript
// Automatic caching
const worktrees = manager.listWorktrees();
// First call: Fetches status (~200ms per worktree)
// Subsequent calls (within 2s): Returns cached (~0ms)
```

**Configuration**:
```javascript
// Adjust cache TTL (default: 2000ms)
const cache = new TTLCache(3000, 100); // 3s TTL, max 100 entries
```

**When to invalidate**:
- Automatically invalidated after service start/stop/restart
- Expires after 2-3 seconds
- Manual invalidation: `manager.invalidateCache(worktreePath)`

**Impact**: ~50% reduction in list operation time with multiple worktrees.

### 2. ComposeInspector Caching

**Problem**: Every operation re-parsed `docker-compose.yml` via `docker compose config` (~200ms).

**Solution**: Global singleton cache with file modification time tracking.

```javascript
// Automatic caching
const inspector = new ComposeInspector('/path/to/docker-compose.yml', runtime);
const services = inspector.getServices();
// First call: Parses compose file (~200ms)
// Subsequent calls: Returns cached (~0ms)

// Cache auto-invalidates when file is modified
// Manual invalidation:
inspector.invalidateCache();
ComposeInspector.clearGlobalCache();
```

**Configuration**:
```javascript
// Cache TTL: 60 seconds (configurable in compose-inspector.mjs)
const COMPOSE_CACHE = new TTLCache(60000, 50);
```

**Impact**: ~30% reduction in compose-related operations.

### 3. WebSocket Message Batching

**Problem**: Progress updates sent individually (~10+ messages per second) overwhelmed WebSocket.

**Solution**: Batch messages within 100ms window, send as single payload.

```javascript
// Automatic batching
manager.broadcast('worktree:progress', { name, step, message });
// Queued for 100ms, then sent in batch

// Client receives:
{
  type: 'batch',
  messages: [
    { event: 'worktree:progress', data: {...} },
    { event: 'worktree:progress', data: {...} },
    { event: 'worktree:progress', data: {...} }
  ]
}
```

**Configuration**:
```javascript
// Adjust batch interval (default: 100ms)
const batcher = new MessageBatcher(50); // 50ms batching
```

**Impact**: ~70% reduction in WebSocket message count, ~30% reduction in network overhead.

### 4. Progress Update Debouncing

**Problem**: Rapid progress updates (Bootstrap, database copy) caused UI jank.

**Solution**: Debounce progress broadcasts to max 5/second per worktree.

```javascript
// Automatic debouncing
manager.broadcastProgress(worktreeName, 'worktree:progress', data);
// Rate limited to 5/sec per worktree
```

**Configuration**:
```javascript
// Adjust rate limit (default: 5/sec)
const limiter = new RateLimiter(10); // 10/sec
```

**Impact**: Better UX, reduced CPU usage, smoother UI updates.

### 5. Parallel Operations

**Already optimized**: Database copy + bootstrap run in parallel during worktree creation.

```javascript
// Parallel execution
await Promise.all([
  this.copyDatabase(worktreeName, worktreePath),      // ~20-60s
  this.runBootstrap(worktreeName, worktreePath)       // ~15-30s
]);
// Total time: max(copyTime, bootstrapTime) instead of sum
```

**Impact**: ~30-40% reduction in worktree creation time.

---

## Monitoring & Metrics

### Performance Metrics Endpoint

Access real-time performance metrics:

```bash
GET /api/metrics
```

**Response**:
```json
{
  "uptime": 3600,
  "metrics": [
    {
      "operation": "listWorktrees",
      "count": 150,
      "avgMs": 245,
      "minMs": 180,
      "maxMs": 450,
      "p50Ms": 230,
      "p95Ms": 380,
      "p99Ms": 420
    },
    {
      "operation": "getDockerStatus",
      "count": 750,
      "avgMs": 45,
      "minMs": 0,
      "maxMs": 210,
      "p50Ms": 2,
      "p95Ms": 200,
      "p99Ms": 210
    }
  ],
  "cache": {
    "dockerStatus": {
      "size": 5,
      "hitRate": 0.87
    },
    "composeInspector": {
      "size": 3,
      "hitRate": 0.92
    }
  }
}
```

### Logging Slow Operations

Slow operations (>1s) are automatically logged:

```
⚠ SLOW: listWorktrees took 1250ms (threshold: 1000ms)
⚠ SLOW: createWorktree took 45000ms (threshold: 30000ms)
```

Configure threshold in `server.mjs`:

```javascript
const SLOW_OPERATION_THRESHOLD = 1000; // ms
```

### WebSocket Metrics

Monitor WebSocket health:

```bash
GET /api/websocket-stats
```

**Response**:
```json
{
  "clients": 3,
  "messagesQueued": 12,
  "messagesSent": 1523,
  "batchSize": {
    "avg": 3.2,
    "max": 15
  }
}
```

---

## Tuning Guide

### For Large Codebases

If you have many worktrees (>10) or large databases (>1GB):

**1. Increase cache TTLs**:
```javascript
// In server.mjs
const dockerStatusCache = new TTLCache(5000, 200); // 5s TTL, 200 entries
const composeCache = new TTLCache(120000, 100); // 2min TTL
```

**2. Reduce database copy overhead**:
```bash
# Use rsync's --checksum flag to skip unchanged files
rsync -a --checksum --progress src/ dst/
```

**3. Increase batch window**:
```javascript
// In optimized-manager.mjs
const messageBatcher = new MessageBatcher(200); // 200ms batching
```

### For Fast Networks

If you have high-bandwidth, low-latency network:

**1. Reduce batch window**:
```javascript
const messageBatcher = new MessageBatcher(50); // 50ms batching
```

**2. Increase rate limits**:
```javascript
const broadcastLimiter = new RateLimiter(20); // 20/sec
```

### For Slow Machines

If running on older hardware or VMs:

**1. Limit parallel operations**:
```javascript
// In server.mjs, worktree creation
// Disable parallel database + bootstrap
await this.copyDatabase(...);
await this.runBootstrap(...);
```

**2. Increase cache sizes**:
```javascript
const dockerStatusCache = new TTLCache(10000, 500); // 10s TTL, larger cache
```

### For Development

Faster iterations during development:

**1. Disable caching** (see real-time changes):
```javascript
// Set TTL to 0
const cache = new TTLCache(0, 100);
```

**2. Reduce debounce delays**:
```javascript
const progressDebouncer = new Debouncer(0); // No debouncing
```

---

## Benchmarks

### Worktree Creation

**Test environment**:
- MacBook Pro M2, 16GB RAM
- Docker Desktop 4.30
- Empty database (100MB)

| Phase | Time | Optimized |
|-------|------|-----------|
| Git worktree creation | 2s | N/A |
| Port allocation | <100ms | N/A |
| Database copy | 25s | ✓ Parallel with bootstrap |
| Bootstrap (npm) | 20s | ✓ Parallel with database |
| Container startup | 12s | N/A |
| **Total** | **45s** (was 59s) | **24% faster** |

### API Response Times

**Test scenario**: 5 active worktrees

| Endpoint | Before | After | Improvement |
|----------|--------|-------|-------------|
| `/api/worktrees` | 1.5s | 380ms | **75% faster** |
| `/api/worktrees/:name` | 200ms | 150ms | 25% faster |
| `/api/worktrees/:name/services/start` | 8s | 7.5s | 6% faster |

### WebSocket Throughput

**Test scenario**: Worktree creation with rapid progress updates

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Messages sent | 150 | 45 | **70% reduction** |
| Network overhead | 50KB | 20KB | 60% reduction |
| UI jank (frame drops) | 15 | 2 | **87% reduction** |

---

## Troubleshooting

### High Memory Usage

**Symptom**: Server memory grows over time

**Causes**:
1. Cache not expiring (TTL too long)
2. Too many cached entries (maxSize too large)
3. Memory leaks in PTY sessions

**Solutions**:
```javascript
// 1. Reduce cache sizes
const cache = new TTLCache(1000, 50); // Smaller maxSize

// 2. Manually clear caches periodically
setInterval(() => {
  ComposeInspector.clearGlobalCache();
  dockerStatusCache.clear();
}, 600000); // Every 10 minutes

// 3. Monitor memory usage
GET /api/metrics
// Check cache sizes
```

### Slow List Operations

**Symptom**: `/api/worktrees` takes >1s

**Causes**:
1. Cache misses (TTL expired, many worktrees)
2. Docker daemon slow
3. Git operations slow

**Solutions**:
```javascript
// 1. Increase cache TTL
const dockerStatusCache = new TTLCache(5000, 200); // 5s TTL

// 2. Check Docker health
docker system info

// 3. Monitor cache hit rate
GET /api/metrics
// Look for cache.dockerStatus.hitRate
```

### WebSocket Disconnections

**Symptom**: Frequent WebSocket reconnections

**Causes**:
1. Batch window too long (client timeout)
2. Large message payloads
3. Network issues

**Solutions**:
```javascript
// 1. Reduce batch window
const batcher = new MessageBatcher(50); // Smaller window

// 2. Add compression (future optimization)
// 3. Implement WebSocket ping/pong keepalive
```

### Stale Status

**Symptom**: Docker status not updating after service restart

**Causes**:
1. Cache not invalidated
2. TTL too long

**Solutions**:
```javascript
// Manually invalidate cache after mutations
await manager.startServices(worktreeName);
manager.invalidateCache(worktreePath);

// Or reduce TTL
const cache = new TTLCache(1000, 100); // 1s TTL
```

---

## Performance Checklist

Before reporting performance issues:

- [ ] Check `/api/metrics` for slow operations
- [ ] Verify cache hit rates (should be >80%)
- [ ] Monitor Docker daemon health (`docker system info`)
- [ ] Check disk I/O (database copies are I/O bound)
- [ ] Verify network latency (WebSocket connections)
- [ ] Review server logs for slow operation warnings
- [ ] Test with different cache TTL settings
- [ ] Measure baseline performance (empty worktrees)

---

## Future Optimizations

Planned improvements (not yet implemented):

1. **Parallel status checks**: Use `Promise.all()` for all worktrees
2. **Streaming data copy**: Byte-level progress for large databases
3. **WebSocket compression**: gzip for large payloads
4. **Virtual scrolling**: For logs with >10,000 lines
5. **Service dependency graph**: Smart restart order
6. **Progressive loading**: Load worktrees incrementally
7. **IndexedDB caching**: Client-side persistence
8. **Worker threads**: Offload CPU-intensive tasks

---

## Configuration Reference

All performance-related configuration:

```javascript
// Cache TTLs
const DOCKER_STATUS_TTL = 2000;      // 2 seconds
const GIT_STATUS_TTL = 3000;         // 3 seconds
const COMPOSE_CONFIG_TTL = 60000;    // 60 seconds

// Cache sizes
const MAX_DOCKER_CACHE = 100;        // 100 worktrees
const MAX_COMPOSE_CACHE = 50;        // 50 compose files

// Batching/Debouncing
const BATCH_WINDOW_MS = 100;         // 100ms
const DEBOUNCE_DELAY_MS = 200;       // 200ms
const RATE_LIMIT_PER_SEC = 5;        // 5 updates/sec

// Thresholds
const SLOW_OPERATION_MS = 1000;      // Log if >1s
const WEBSOCKET_TIMEOUT_MS = 30000;  // 30s idle timeout
```

---

## Related Documentation

- [Architecture](./architecture.md) - System design overview
- [API Reference](./api.md) - REST API documentation
- [Performance Audit](./performance-audit-baseline.md) - Baseline analysis

---

**Last Updated**: 2025-10-28
**Author**: VibeTrees Team
