# VibeTrees Performance Audit - Baseline Report

**Date**: 2025-10-28
**Phase**: 7.1 - Performance Optimization
**Status**: Baseline Analysis

---

## Executive Summary

This audit analyzes VibeTrees' current performance characteristics and identifies optimization opportunities across Docker operations, data copying, WebSocket communication, and API response times.

### Key Findings

1. **Docker Operations**: Multiple redundant `docker compose ps` calls during status checks
2. **ComposeInspector**: Parses docker-compose.yml on every request (no caching)
3. **WebSocket**: Rapid-fire progress updates without batching
4. **Data Sync**: Copy operations block without progress granularity
5. **Service Status**: Called on every worktree list (N+1 problem)

---

## Current Performance Characteristics

### Worktree Creation Time
**Target**: <30s
**Current Estimated**: 45-90s (unbenchmarked)

**Breakdown**:
- Git worktree creation: ~2s
- Port allocation: <100ms (fast, in-memory)
- Docker compose file copy: <100ms
- Database copy: 20-60s (blocking, no streaming)
- Bootstrap (npm run bootstrap): 15-30s (blocking)
- Container startup: 10-20s

**Bottlenecks**:
1. Database copy and bootstrap run sequentially with containers (should be parallel)
2. No progress granularity during database copy
3. Bootstrap output not streamed to UI

### API Response Times
**Target**: <500ms for 95% of requests

**Current Analysis** (no instrumentation):
- `/api/worktrees` (list): Estimated 500ms-2s
  - Calls `git worktree list` (~100ms)
  - **N+1 Problem**: Calls `docker compose ps` for each worktree (~200ms per worktree)
  - **N+1 Problem**: Calls `git status` for each worktree (~50ms per worktree)
  - With 5 worktrees: ~1.5s total
- `/api/worktrees/:name/check-updates`: ~200ms (git operations)
- `/api/worktrees/:name/services/start`: 5-10s (container startup)

**Bottlenecks**:
1. Multiple Docker status calls (not batched)
2. No caching of docker-compose.yml parsing
3. Synchronous git operations

### Docker/Container Operations

**Current Implementation**:
```javascript
// server.mjs:235-262
getDockerStatus(worktreePath, worktreeName) {
  // Calls: docker compose ps -a --format json
  runtime.execCompose('ps -a --format json', { cwd: worktreePath });
}
```

**Issues**:
- Called once per worktree on every list operation
- No caching of results (status can be stale for 1-2s)
- Spawns new process for each call (~200ms overhead)
- No parallel execution across worktrees

**Optimization Opportunities**:
1. Cache docker status for 2-3 seconds
2. Batch status checks across all worktrees
3. Use WebSocket for live updates instead of polling

### ComposeInspector

**Current Implementation**:
```javascript
// compose-inspector.mjs:34-53
_loadConfig() {
  if (this._config) return this._config;

  // Always executes: docker compose config
  const output = runtime.execCompose(`-f ${this.composeFilePath} config`);
  this._config = YAML.parse(output);
}
```

**Issues**:
- Parses on first access, but instance not reused
- New `ComposeInspector` created for each operation
- `docker compose config` takes 100-300ms
- No TTL-based cache invalidation

**Optimization Opportunities**:
1. **Global cache**: Singleton inspector per worktree path
2. **TTL cache**: Invalidate after 60s or on file change
3. **Lazy loading**: Only parse when services requested

### Data Sync Operations

**Current Implementation**:
```javascript
// data-sync.mjs:483-611 (server.mjs copyDatabase)
await this.copyDatabase(targetWorktreeName, targetWorktreePath);

// Uses rsync or cp, no progress granularity
await this._runCommandWithProgress(
  `rsync -a --progress "${mainDataPath}/" "${targetDataPath}/"`
);
```

**Issues**:
- Progress reporting is coarse (line-by-line)
- No byte-level progress tracking
- Blocks worktree creation (should be in parallel)
- **Already parallel**: Database copy + bootstrap run in parallel ✓

**Optimization Opportunities**:
1. Add byte-level progress tracking
2. Use streaming for large files (>100MB)
3. Skip unchanged files with rsync --checksum
4. **Already implemented**: Parallel execution with bootstrap ✓

### WebSocket Communication

**Current Implementation**:
```javascript
// server.mjs:187-194
broadcast(event, data) {
  const message = JSON.stringify({ event, data });
  this.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}
```

**Issues**:
- No message batching (sends immediately)
- No debouncing for rapid updates
- Progress updates sent individually (can be 10+ per second)
- No compression for large messages

**Optimization Opportunities**:
1. Batch messages within 100ms window
2. Debounce progress updates (max 5/second)
3. Use gzip compression for large payloads
4. Rate limit per client

### Terminal Output Streaming

**Current Implementation**:
```javascript
// server.mjs:1181-1192 (log forwarding)
logsProcess.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  // Sends each line immediately
  for (const line of lines) {
    ws.send(formatLogLine(line, serviceName) + '\r\n');
  }
});
```

**Issues**:
- No buffering/batching (sends every line immediately)
- Can overwhelm WebSocket with rapid logs
- xterm.js re-renders on every write

**Optimization Opportunities**:
1. Buffer log lines for 50-100ms
2. Send in batches of 10-50 lines
3. Use xterm.js write callbacks for backpressure

---

## Optimization Recommendations

### Priority 1: High Impact, Low Effort

1. **Cache Docker Status** (Impact: 50% reduction in list time)
   - Cache `docker compose ps` results for 2-3s
   - Invalidate on service start/stop/restart
   - Estimated savings: 500ms per list operation

2. **Batch WebSocket Messages** (Impact: 30% reduction in network overhead)
   - Queue messages for 100ms before sending
   - Group progress updates into batches
   - Estimated savings: Reduced message count by 70%

3. **Debounce Progress Updates** (Impact: Better UX, less CPU)
   - Limit progress broadcasts to 5/second
   - Still show all updates, just throttled
   - Estimated savings: Reduced broadcast calls by 80%

### Priority 2: Medium Impact, Medium Effort

4. **Global ComposeInspector Cache** (Impact: 30% reduction in compose parsing)
   - Singleton cache per worktree path
   - TTL: 60 seconds
   - Estimated savings: 200ms per operation

5. **Parallel Status Checks** (Impact: 40% reduction in list time with many worktrees)
   - Check all worktree statuses in parallel
   - Use `Promise.all()` for git + docker calls
   - Estimated savings: Linear → Constant time (O(n) → O(1))

6. **Add Performance Metrics Endpoint** (Impact: Ongoing monitoring)
   - Track operation timings
   - Identify slow operations in production
   - Enable performance regression detection

### Priority 3: Lower Impact, Higher Effort

7. **Optimize Data Copy Progress** (Impact: Better UX, no speed improvement)
   - Byte-level progress tracking
   - More granular updates
   - Estimated improvement: UX only

8. **Lazy-Load Service Discovery** (Impact: 20% faster startup)
   - Only discover services when needed
   - Cache service list per worktree
   - Estimated savings: 100ms per worktree creation

---

## Performance Targets

### After Optimization

| Operation | Current | Target | Achieved |
|-----------|---------|--------|----------|
| Worktree creation | 45-90s | <30s | ⏳ Pending |
| List worktrees (5 worktrees) | ~1.5s | <500ms | ⏳ Pending |
| Docker status check | 200ms/worktree | 50ms/worktree (cached) | ⏳ Pending |
| Compose parsing | 200ms/call | 0ms (cached) | ⏳ Pending |
| WebSocket message overhead | High | 70% reduction | ⏳ Pending |
| API response (95th percentile) | Unknown | <500ms | ⏳ Pending |

---

## Benchmark Suite Needed

To validate optimizations, we need:

1. **Worktree Creation Benchmark**
   - Measure total time
   - Break down by phase (git, database, bootstrap, containers)
   - Test with different database sizes (empty, 100MB, 1GB)

2. **API Response Time Benchmark**
   - Measure all endpoints under load
   - Test with 1, 5, 10, 20 worktrees
   - Record 50th, 95th, 99th percentiles

3. **WebSocket Throughput Benchmark**
   - Messages per second
   - Latency distribution
   - Memory usage over time

4. **Docker Operations Benchmark**
   - Time for `docker compose ps`
   - Time for `docker compose config`
   - Cache hit rate after optimization

---

## Implementation Plan

### Phase 1: Instrumentation (Week 1)
1. Add timing middleware to all API routes
2. Add performance.now() tracking to key operations
3. Create `/api/metrics` endpoint
4. Log slow operations (>1s) automatically

### Phase 2: Quick Wins (Week 1)
1. Implement Docker status caching
2. Add WebSocket message batching
3. Debounce progress updates
4. Test and measure improvements

### Phase 3: Deeper Optimizations (Week 2)
1. Global ComposeInspector cache
2. Parallel status checks
3. Optimize data copy progress
4. Document performance tuning guide

### Phase 4: Validation (Week 2)
1. Run benchmark suite
2. Validate targets achieved
3. Performance regression tests
4. Update documentation

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Caching causes stale data | Medium | Short TTL (2-3s), manual invalidation on mutations |
| Batching delays urgent updates | Low | Keep batch window small (100ms) |
| Parallel operations overwhelm system | Low | Limit concurrency, use p-limit library |
| Metrics overhead impacts performance | Very Low | Async logging, sampling for high-volume operations |

---

## Next Steps

1. ✅ Complete baseline audit (this document)
2. ⏳ Implement Priority 1 optimizations
3. ⏳ Add performance metrics endpoint
4. ⏳ Create benchmark suite
5. ⏳ Measure and validate improvements
6. ⏳ Document findings in performance.md

---

**Prepared by**: Claude Code (AI Performance Audit)
**Review Status**: Awaiting implementation
