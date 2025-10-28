# Performance Optimization

Worktree creation optimization through profiling infrastructure, parallel operations, and intelligent caching.

## Overview

This feature adds performance profiling and optimization infrastructure to VibeTrees, laying the foundation for reducing worktree creation time from ~30s to <15s through:

1. **Performance Profiling** - Track and measure all operations
2. **Parallel Operations** - Execute independent tasks concurrently
3. **Intelligent Caching** - Cache node_modules and Docker layers
4. **Lazy Initialization** - Defer non-critical services

## Current Implementation Status

### Completed (v1.1 - Foundation)

- ✅ **Profiler** (`scripts/profiler.mjs`)
  - Track operation timing with start/end
  - Support nested operations
  - Aggregate statistics across multiple runs
  - Generate summary reports

- ✅ **Cache Manager** (`scripts/cache-manager.mjs`)
  - Cache node_modules directory structure
  - Validate cache against package.json
  - Docker BuildKit environment configuration

- ✅ **Performance Optimizer** (`scripts/performance-optimizer.mjs`)
  - Run tasks in parallel
  - Respect dependency graphs
  - Topological sorting for correct execution order

- ✅ **Profiling Integration**
  - Baseline profiling in `createWorktree()` method
  - Track: git worktree add, port allocation, MCP discovery, npm bootstrap, docker startup
  - Log performance reports after creation

- ✅ **Performance Metrics API**
  - `GET /api/performance/metrics` endpoint
  - Returns: operations, totalTime, avgWorktreeCreation

- ✅ **Performance Metrics UI**
  - Display average worktree creation time
  - Show operation breakdown table (collapsible)
  - Refresh metrics button

### Planned (Future Iteration)

- ⏳ **Full Parallel Optimization**
  - Implement `createWorktreeOptimized()` with parallel task execution
  - Use `PerformanceOptimizer.runWithDependencies()` for orchestration
  - Example dependency graph:
    - Stage 1 (parallel): git worktree + docker pull
    - Stage 2 (parallel): port allocation + npm cache restore + MCP discovery
    - Stage 3 (sequential): start postgres → start other services

- ⏳ **Node Modules Caching**
  - Hardlink node_modules from `~/.vibetrees/cache/node_modules/`
  - Expected savings: ~8-10s per worktree creation
  - Cache invalidation on package.json change

- ⏳ **Docker Layer Reuse**
  - BuildKit cache for Docker images
  - Expected savings: ~5-7s per worktree creation
  - Shared layers across worktrees

- ⏳ **Lazy Service Initialization**
  - Start postgres immediately (required for API)
  - Defer minio, temporal to background
  - Return "ready" when terminal available
  - Expected savings: ~3-5s perceived time

## Performance Breakdown (Baseline)

| Operation | Baseline (estimated) | Optimized (target) | Savings |
|-----------|----------------------|--------------------|---------|
| Git worktree add | 2s | 2s | - |
| npm install/bootstrap | 12s | 3s | 9s (cache) |
| Docker compose up | 15s | 4s | 11s (cache + lazy) |
| MCP discovery | 1s | 0.2s | 0.8s (cache) |
| **Total** | **30s** | **9.2s** | **20.8s (69%)** |

*Note: Actual times vary by hardware, network, and project size*

## API Reference

### Get Performance Metrics

```bash
GET /api/performance/metrics
```

**Response:**
```json
{
  "operations": [
    {
      "name": "create-worktree-total",
      "count": 3,
      "avg": 28543.21,
      "min": 26012.45,
      "max": 31289.67,
      "total": 85629.63
    },
    {
      "name": "git-worktree-add",
      "count": 3,
      "avg": 1892.34,
      "min": 1567.23,
      "max": 2123.45,
      "total": 5677.02
    }
  ],
  "totalTime": 85629.63,
  "avgWorktreeCreation": 28543.21
}
```

## Architecture

### Class Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ WorktreeManager                                             │
├─────────────────────────────────────────────────────────────┤
│ - profiler: Profiler                                        │
│ - optimizer: PerformanceOptimizer                           │
│ - cacheManager: CacheManager                                │
├─────────────────────────────────────────────────────────────┤
│ + createWorktree(branchName, fromBranch): Promise<object>   │
│ + createWorktreeOptimized(branchName, fromBranch): Promise  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ uses
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Profiler                                                    │
├─────────────────────────────────────────────────────────────┤
│ + start(name, parentId?): string                            │
│ + end(operationId): object                                  │
│ + isRunning(operationId): boolean                           │
│ + getResult(operationId): object                            │
│ + getStats(name): object                                    │
│ + generateReport(): object                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PerformanceOptimizer                                        │
├─────────────────────────────────────────────────────────────┤
│ + runParallel(tasks): Promise<Array>                        │
│ + runWithDependencies(tasks): Promise<Map>                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CacheManager                                                │
├─────────────────────────────────────────────────────────────┤
│ + cacheNodeModules(sourcePath): Promise<void>               │
│ + restoreNodeModules(targetPath): Promise<void>             │
│ + isCacheValid(projectPath): boolean                        │
│ + getDockerCacheEnv(): object                               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
createWorktree() / createWorktreeOptimized()
    │
    ├─> Profiler.start('create-worktree-total')
    │
    ├─> Execute operations (currently sequential)
    │   ├─> git worktree add
    │   ├─> allocate ports
    │   ├─> MCP discovery
    │   ├─> npm bootstrap
    │   └─> docker compose up
    │
    ├─> Profiler.end('create-worktree-total')
    │
    └─> Profiler.generateReport() → API → UI
```

## Usage

### For Users

Performance metrics are automatically collected. View them in the web UI:

1. Open VibeTrees web interface (`npm run web`)
2. Look for "Performance Metrics" section in sidebar
3. Click "Refresh Metrics" to see latest stats
4. Expand "Operation Breakdown" to see detailed timings

### For Developers

#### Using the Profiler

```javascript
import { Profiler } from './profiler.mjs';

const profiler = new Profiler();

// Start timing
const id = profiler.start('my-operation');

// Do work...
await someAsyncOperation();

// End timing
const result = profiler.end(id);
console.log(`Operation took ${result.duration}ms`);

// Get aggregated stats
const stats = profiler.getStats('my-operation');
console.log(`Average: ${stats.avg}ms over ${stats.count} runs`);
```

#### Using Nested Operations

```javascript
const parentId = profiler.start('parent-operation');
const childId = profiler.start('child-operation', parentId);

await childOperation();
profiler.end(childId);

await parentOperation();
profiler.end(parentId);

// Parent result includes children
const parent = profiler.getResult(parentId);
console.log('Children:', parent.children);
```

#### Using the Performance Optimizer

```javascript
import { PerformanceOptimizer } from './performance-optimizer.mjs';

const optimizer = new PerformanceOptimizer();

// Run independent tasks in parallel
const results = await optimizer.runParallel([
  { name: 'task1', fn: async () => await doTask1() },
  { name: 'task2', fn: async () => await doTask2() }
]);

// Run tasks with dependencies
const tasks = [
  {
    name: 'fetch-data',
    fn: async () => await fetchData(),
    dependencies: []
  },
  {
    name: 'process-data',
    fn: async (deps) => await processData(deps['fetch-data']),
    dependencies: ['fetch-data']
  }
];

const results = await optimizer.runWithDependencies(tasks);
```

## Testing

All performance modules have comprehensive test coverage:

```bash
# Run performance-related tests
npm test scripts/profiler.test.mjs
npm test scripts/cache-manager.test.mjs
npm test scripts/performance-optimizer.test.mjs

# Run all tests
npm test
```

Test coverage:
- `profiler.test.mjs`: 5 tests covering timing, nesting, aggregation
- `cache-manager.test.mjs`: 6 tests covering caching and validation
- `performance-optimizer.test.mjs`: 4 tests covering parallel execution

## Benchmarking (Future Work)

To properly benchmark performance improvements, we need to:

1. Create multiple worktrees with baseline implementation
2. Measure average creation time
3. Implement full optimization (parallel + caching)
4. Create multiple worktrees with optimized implementation
5. Compare average times and calculate improvement percentage

Expected workflow:
```bash
# Baseline measurement (5 worktrees)
for i in {1..5}; do
  # Create worktree, measure time
done

# Implement optimization

# Optimized measurement (5 worktrees)
for i in {1..5}; do
  # Create worktree with createWorktreeOptimized, measure time
done

# Calculate improvement
```

## Limitations

1. **Cache Directory**: Node modules cache only works on same filesystem (hardlinks limitation)
2. **First Run**: First worktree creation still slow (no cache exists)
3. **Cache Invalidation**: Conservative approach may rebuild unnecessarily
4. **Parallel Optimization**: Not yet implemented - currently sequential execution with profiling
5. **Docker Caching**: BuildKit cache configuration present but not fully tested

## Future Enhancements

1. **Cross-filesystem caching**: Use copy-on-write or rsync for cross-filesystem support
2. **Incremental npm install**: Only install changed packages
3. **Smart cache warming**: Pre-pull Docker images on server startup
4. **Progress indicators**: Real-time progress bars for long operations
5. **Historical metrics**: Store metrics over time, track trends
6. **Operation comparison**: Compare operation times between different worktrees
7. **Automatic optimization**: Detect slow operations and suggest optimizations

## See Also

- [CLAUDE.md](../CLAUDE.md) - Project overview
- [Git Sync & Smart Reload](../CLAUDE.md#git-sync--smart-reload-phase-5) - Related performance features
- [scripts/profiler.mjs](../scripts/profiler.mjs) - Profiler implementation
- [scripts/performance-optimizer.mjs](../scripts/performance-optimizer.mjs) - Optimizer implementation
- [scripts/cache-manager.mjs](../scripts/cache-manager.mjs) - Cache manager implementation
