# Monitoring and Logging Guide

This guide covers VibeTrees' monitoring, logging, and telemetry features.

## Table of Contents

- [Logging System](#logging-system)
- [Health Checks](#health-checks)
- [Telemetry](#telemetry)
- [Metrics](#metrics)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## Logging System

VibeTrees uses a structured logging system with multiple log levels and output destinations.

### Log Levels

| Level | Description | When to Use |
|-------|-------------|-------------|
| `DEBUG` | Detailed debugging information | Development and troubleshooting |
| `INFO` | General informational messages | Normal operations |
| `WARN` | Warning messages | Potential issues |
| `ERROR` | Error messages | Errors that don't stop execution |
| `FATAL` | Critical errors | Errors that require immediate attention |

### Configuration

Configure logging via environment variables:

```bash
# Set log level (DEBUG, INFO, WARN, ERROR, FATAL)
export LOG_LEVEL=INFO

# Set log format (json or text)
export LOG_FORMAT=json

# Set log outputs (comma-separated: console, file)
export LOG_OUTPUTS=console,file
```

Or in your code:

```javascript
import { getLogger } from './scripts/logger.mjs';

const logger = getLogger({
  level: 'INFO',
  format: 'json',
  outputs: ['console', 'file']
});

logger.info('Server started', { port: 3335 });
logger.error('Connection failed', { error: err.message });
```

### Log Files

Logs are stored in `~/.vibetrees/logs/`:

- **app.log** - All application logs (INFO, WARN, DEBUG)
- **error.log** - Error logs only (ERROR, FATAL)
- **access.log** - HTTP access logs

### Log Rotation

Logs are automatically rotated when:
- File size exceeds 100MB
- Files are older than 7 days

### Log Format

#### JSON Format (default)

```json
{
  "timestamp": "2025-10-28T10:30:45.123Z",
  "level": "INFO",
  "message": "Worktree created",
  "worktree": "feature-auth",
  "duration": "3524ms"
}
```

#### Text Format

```
[2025-10-28T10:30:45.123Z] INFO: Worktree created {"worktree":"feature-auth","duration":"3524ms"}
```

### Child Loggers

Create loggers with additional context:

```javascript
const logger = getLogger();
const worktreeLogger = logger.child({ worktree: 'feature-auth' });

// All logs from worktreeLogger will include worktree: 'feature-auth'
worktreeLogger.info('Services started');
```

---

## Health Checks

VibeTrees provides comprehensive health checks for all system components.

### Health Check Endpoint

**GET** `/health`

Returns overall system health status:

```json
{
  "status": "healthy",
  "checks": {
    "runtime": {
      "status": "healthy",
      "message": "docker is running",
      "version": "Docker version 24.0.6",
      "runtime": "docker"
    },
    "git": {
      "status": "healthy",
      "message": "Git repository is accessible",
      "version": "git version 2.42.0",
      "repository": "/Users/tim/code/vibe-worktrees",
      "branch": "main",
      "worktreeCount": 3
    },
    "disk": {
      "status": "healthy",
      "message": "50.23 GB available",
      "available": 53912345600,
      "total": 500000000000,
      "used": 446087654400,
      "usedPercent": 89
    },
    "services": {
      "status": "healthy",
      "message": "5 containers running",
      "containers": [
        "feature-auth-postgres",
        "feature-auth-api",
        "feature-ui-postgres"
      ],
      "count": 3
    }
  },
  "timestamp": "2025-10-28T10:30:45.123Z",
  "duration": 234
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| `healthy` | All checks passed |
| `warning` | Some non-critical issues detected |
| `unhealthy` | Critical issues detected |
| `unknown` | Unable to determine status |

### Component Checks

#### Container Runtime

- Checks if Docker/Podman is installed
- Verifies daemon is running (Docker only)
- Returns runtime version

#### Git Repository

- Checks if git is installed
- Verifies current directory is a git repository
- Returns branch and worktree count

#### Disk Space

- Checks available disk space
- Warns if below 1GB
- Critical if below 512MB

#### Services

- Lists running containers
- Counts containers with `vibe.worktree` label

### Using Health Checks

#### In Code

```javascript
import HealthChecker from './scripts/health-checker.mjs';

const checker = new HealthChecker({
  runtime: containerRuntime,
  projectRoot: '/path/to/project'
});

const health = await checker.check();

if (health.status !== 'healthy') {
  console.error('System is unhealthy:', health);
}
```

#### Via HTTP

```bash
curl http://localhost:3335/health
```

#### In Docker

Health checks run automatically every 30 seconds:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3335/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"
```

---

## Telemetry

VibeTrees includes **opt-in** telemetry for anonymous usage tracking.

### Privacy-First Design

- **Opt-in only** - Telemetry is disabled by default
- **No PII** - No personal identifiable information collected
- **Anonymous** - Install ID is hashed, not traceable
- **Local storage** - Data stored locally, not transmitted
- **Transparent** - All data visible in `~/.vibetrees/telemetry/`

### Enabling Telemetry

```bash
# Via environment variable
export VIBE_TELEMETRY=true

# Or in config
{
  "telemetry": {
    "enabled": true
  }
}
```

### What is Collected

#### Events

- Feature usage (worktree created, services started, etc.)
- User actions (button clicks, command executions)
- Session duration

#### Errors

- Error messages (sanitized)
- Stack traces (paths anonymized)
- Error codes

#### Performance Metrics

- Operation duration (worktree creation, service startup)
- Resource usage (memory, CPU)
- Response times

### Data Sanitization

All data is sanitized before storage:

- **Paths** - `/Users/tim/project` → `/Users/***/project`
- **Emails** - `user@example.com` → `***@***.***`
- **IP addresses** - `192.168.1.1` → `***.***.***.***`
- **Sensitive keys** - password, token, secret, etc. removed

### Telemetry Files

Located in `~/.vibetrees/telemetry/`:

- **install-id** - Anonymous installation identifier
- **events.jsonl** - Event log (JSONL format)
- **metrics.jsonl** - Metrics log (JSONL format)
- **session-{id}.json** - Session summaries

### Usage Examples

#### Track Event

```javascript
import { getTelemetry } from './scripts/telemetry.mjs';

const telemetry = getTelemetry();

await telemetry.trackEvent('worktree.created', {
  agent: 'claude',
  services: 3,
  fromBranch: 'main'
});
```

#### Track Error

```javascript
try {
  // Operation
} catch (error) {
  await telemetry.trackError(error, {
    operation: 'create-worktree',
    worktree: 'feature-auth'
  });
  throw error;
}
```

#### Track Performance

```javascript
const timer = telemetry.startTimer('worktree.creation');

// Perform operation
await createWorktree();

const duration = await timer.end(); // Automatically tracked
console.log(`Operation took ${duration}ms`);
```

#### Get Metrics

```javascript
const stats = telemetry.getMetricStats('worktree.creation');

console.log(stats);
// {
//   count: 15,
//   min: 2340,
//   max: 8921,
//   mean: 4523,
//   median: 4120,
//   p95: 7890,
//   p99: 8756
// }
```

---

## Metrics

VibeTrees exposes performance and usage metrics.

### Metrics Endpoint

**GET** `/metrics`

Returns current metrics:

```json
{
  "uptime": 3600000,
  "memory": {
    "rss": 123456789,
    "heapTotal": 98765432,
    "heapUsed": 87654321,
    "external": 1234567
  },
  "worktrees": {
    "total": 5,
    "active": 3,
    "paused": 2
  },
  "containers": {
    "running": 12,
    "stopped": 3
  },
  "operations": {
    "worktree.created": {
      "count": 15,
      "avgDuration": 4523,
      "p95Duration": 7890
    }
  }
}
```

### Prometheus Format

For Prometheus integration, use `/metrics?format=prometheus`:

```
# HELP vibetrees_uptime_seconds Uptime in seconds
# TYPE vibetrees_uptime_seconds gauge
vibetrees_uptime_seconds 3600

# HELP vibetrees_worktrees_total Total worktrees
# TYPE vibetrees_worktrees_total gauge
vibetrees_worktrees_total 5

# HELP vibetrees_worktrees_active Active worktrees
# TYPE vibetrees_worktrees_active gauge
vibetrees_worktrees_active 3
```

---

## Configuration

### Full Configuration Example

```json
{
  "logging": {
    "level": "INFO",
    "format": "json",
    "outputs": ["console", "file"],
    "logDir": "~/.vibetrees/logs",
    "maxFileSize": 104857600,
    "maxAge": 604800000
  },
  "telemetry": {
    "enabled": false
  },
  "health": {
    "diskSpaceWarning": 1073741824,
    "diskSpaceCritical": 536870912
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `INFO` | Log level |
| `LOG_FORMAT` | `json` | Log format (json/text) |
| `LOG_OUTPUTS` | `console,file` | Output destinations |
| `VIBE_TELEMETRY` | `false` | Enable telemetry |

---

## Troubleshooting

### Logs Not Appearing

**Check log level:**

```bash
export LOG_LEVEL=DEBUG
npm run web
```

**Check outputs:**

```bash
export LOG_OUTPUTS=console,file
npm run web
```

**Check permissions:**

```bash
ls -la ~/.vibetrees/logs/
# Should be writable by current user
```

### Health Check Fails

**Check Docker/Podman:**

```bash
docker ps  # or podman ps
```

**Check git:**

```bash
git status
git worktree list
```

**Check disk space:**

```bash
df -h ~/.vibetrees
```

### High Memory Usage

Check metrics:

```bash
curl http://localhost:3335/metrics | jq '.memory'
```

Review log files:

```bash
du -sh ~/.vibetrees/logs/*
```

Rotate logs manually:

```bash
rm ~/.vibetrees/logs/*.log
```

### Telemetry Not Working

**Verify enabled:**

```bash
echo $VIBE_TELEMETRY  # Should be 'true'
```

**Check files:**

```bash
ls -la ~/.vibetrees/telemetry/
```

**Review events:**

```bash
cat ~/.vibetrees/telemetry/events.jsonl | jq '.'
```

---

## Best Practices

### Logging

1. **Use appropriate log levels** - Don't log everything at INFO
2. **Include context** - Add relevant metadata (worktree, operation, etc.)
3. **Use child loggers** - Create context-specific loggers
4. **Don't log sensitive data** - Passwords, tokens, API keys
5. **Log at boundaries** - Entry/exit of major operations

### Health Checks

1. **Check before operations** - Verify system health before critical operations
2. **Monitor regularly** - Set up automated health check monitoring
3. **Act on warnings** - Don't ignore warning status
4. **Test in CI** - Include health checks in CI pipeline

### Telemetry

1. **Respect user privacy** - Keep opt-in, never collect PII
2. **Track what matters** - Focus on actionable metrics
3. **Review regularly** - Analyze metrics to improve UX
4. **Be transparent** - Document what you collect

### Metrics

1. **Track key operations** - Worktree creation, service startup, etc.
2. **Monitor performance** - Track duration and resource usage
3. **Set up alerts** - Alert on performance degradation
4. **Visualize trends** - Use tools like Grafana for visualization

---

## Related Documentation

- [Deployment Guide](deployment.md)
- [Architecture](architecture.md)
- [API Reference](api.md)
- [Configuration](configuration.md)
