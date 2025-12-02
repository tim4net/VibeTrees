# Performance

Worktree creation is profiled to identify bottlenecks.

## What's tracked

Every worktree creation logs timing for:
- git worktree add
- port allocation
- MCP discovery
- npm bootstrap
- docker startup

## API

```bash
GET /api/performance/metrics
```

Returns operation timings and average creation time.

## Infrastructure

- `scripts/profiler.mjs` - timing tracker
- `scripts/cache-manager.mjs` - node_modules caching
- `scripts/performance-optimizer.mjs` - parallel task runner

## Future work

- Node modules caching across worktrees
- Docker BuildKit layer caching
- Lazy service initialization
