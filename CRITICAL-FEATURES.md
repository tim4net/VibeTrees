# Critical Features to Add

**Based on GPT-5 Expert Analysis**
**Status**: Must Address Before Phase 2

---

## 1. Compose Config Rendering (CRITICAL - Phase 2.2)

**Problem**: Parsing raw YAML will break on edge cases (includes, env interpolation, profiles, x-anchors)

**Solution**: Always use `docker compose config` or `podman-compose config` as canonical source

### Implementation

```javascript
class ComposeInspector {
  async getRenderedConfig(worktreePath) {
    // Render through compose to resolve all includes, env, profiles
    const output = await this.runtime.exec(
      `${this.runtime.getComposeCommand()} config`,
      { cwd: worktreePath }
    );

    // Parse the RENDERED output
    return yaml.parse(output);
  }

  async getServices() {
    const config = await this.getRenderedConfig();
    return Object.keys(config.services).map(name => ({
      name,
      ports: this.extractPorts(config.services[name]),
      volumes: this.extractVolumes(config.services[name]),
      env: config.services[name].environment,
      image: config.services[name].image,
      build: config.services[name].build
    }));
  }
}
```

**Priority**: CRITICAL - Do this in Phase 2.2 before any other compose parsing

---

## 2. Worktree Lifecycle Operations (Phase 2)

### 2.1 Pause/Resume Worktrees

**Use Case**: Free resources without teardown

```javascript
class WorktreeManager {
  async pauseWorktree(worktreeName) {
    // Stop containers without removing volumes
    await this.runtime.exec(
      `${this.runtime.getComposeCommand()} stop`,
      { cwd: worktree.path }
    );

    // Mark as paused in registry
    this.worktreeRegistry.setPaused(worktreeName, true);

    // Close agent terminals but keep ports reserved
    this.ptyManager.closeTerminal(worktreeName);
  }

  async resumeWorktree(worktreeName) {
    // Start stopped containers
    await this.runtime.exec(
      `${this.runtime.getComposeCommand()} start`,
      { cwd: worktree.path }
    );

    // Mark as active
    this.worktreeRegistry.setPaused(worktreeName, false);

    // Reopen agent terminal
    await this.ptyManager.getOrCreateTerminal(worktreeName, worktree.path);
  }
}
```

**UI Addition**:
- Pause button on worktree card
- Status indicator: `⏸️ Paused`
- Resume button when paused

### 2.2 Clone/Snapshot Worktrees

**Use Case**: Duplicate worktree with data for testing

```javascript
async snapshotWorktree(sourceName, targetName, options = {}) {
  // 1. Create new worktree from same branch
  const source = this.getWorktree(sourceName);
  const target = await this.createWorktree(targetName, source.branch);

  // 2. Copy volumes (with optional thinning)
  if (options.copyData) {
    await this.dataSync.copyVolumes(
      source,
      target,
      { thin: options.seedOnly }  // If true, copy schema but minimal data
    );
  }

  // 3. Start services
  await this.startServices(target);

  return target;
}
```

**UI Addition**:
- "Clone" button with options:
  - [ ] Copy data volumes
  - [ ] Seed only (minimal data)
  - [ ] Copy .env overrides

### 2.3 Worktree Profiles

**Use Case**: Run only necessary services (light vs full stack)

**Config**: `.vibe/config.json`
```json
{
  "profiles": {
    "light": {
      "services": ["api", "db"],
      "description": "Minimal for API work"
    },
    "full": {
      "services": ["api", "worker", "db", "redis", "temporal", "minio"],
      "description": "Everything"
    },
    "frontend-only": {
      "services": ["console", "api"],
      "description": "UI development"
    }
  }
}
```

**Usage**:
```javascript
await this.createWorktree('feature-ui', {
  branch: 'feature/ui',
  profile: 'frontend-only'  // Only start console + api
});
```

**Priority**: HIGH - Prevents resource saturation

---

## 3. Volume Namespacing (Phase 2.4)

**Problem**: Volume conflicts between worktrees

**Solution**: Automatic unique project names

```javascript
class WorktreeManager {
  getComposeProjectName(worktreeName) {
    // Ensures volumes get unique names: vibe-feature-auth_db-data
    return `vibe-${worktreeName}`;
  }

  async startServices(worktree) {
    await this.runtime.exec(
      `${this.runtime.getComposeCommand()} up -d`,
      {
        cwd: worktree.path,
        env: {
          ...process.env,
          COMPOSE_PROJECT_NAME: this.getComposeProjectName(worktree.name)
        }
      }
    );
  }
}
```

**Priority**: HIGH - Prevents data corruption

---

## 4. Resource Budgeting (Phase 2)

**Problem**: System saturation with many worktrees

**Solution**: Track and limit resource usage

```javascript
class ResourceManager {
  constructor() {
    this.limits = {
      maxWorktrees: 10,
      maxConcurrentAgents: 3,
      cpuPerWorktree: '2.0',  // 2 CPUs
      memPerWorktree: '4g'
    };
  }

  async canStartWorktree() {
    const active = await this.getActiveWorktrees();
    const systemResources = await this.getSystemResources();

    if (active.length >= this.limits.maxWorktrees) {
      return {
        allowed: false,
        reason: 'Maximum worktrees reached. Pause or delete existing worktrees.'
      };
    }

    if (systemResources.cpuUsage > 80) {
      return {
        allowed: false,
        reason: 'CPU usage too high. Consider pausing worktrees or using lighter profiles.'
      };
    }

    return { allowed: true };
  }

  async applyResourceLimits(worktree) {
    // Set compose resource limits
    return {
      ...worktree,
      resourceLimits: {
        cpus: this.limits.cpuPerWorktree,
        memory: this.limits.memPerWorktree
      }
    };
  }
}
```

**UI Addition**:
- System resource dashboard
- Warning when approaching limits
- Suggest pause/profile-down

**Priority**: MEDIUM - Quality of life

---

## 5. Enhanced Observability (Phase 6)

### 5.1 Service Health Status

```javascript
async getServiceHealth(worktree) {
  const services = await this.getServices(worktree);

  for (const service of services) {
    const health = await this.runtime.exec(
      `${this.runtime.getComposeCommand()} ps --format json ${service.name}`,
      { cwd: worktree.path }
    );

    service.health = this.parseHealthStatus(health);
    service.uptime = this.calculateUptime(health);
  }

  return services;
}
```

### 5.2 Aggregated Logs

**UI Feature**: View logs from multiple services in one stream

```javascript
async streamLogs(worktree, serviceNames, options = {}) {
  const stream = this.runtime.exec(
    `${this.runtime.getComposeCommand()} logs -f ${serviceNames.join(' ')}`,
    { cwd: worktree.path, stream: true }
  );

  // Optional filtering
  if (options.filter) {
    return stream.pipe(grep(options.filter));
  }

  return stream;
}
```

### 5.3 Container Stats

**UI Feature**: Real-time CPU/memory per service

```javascript
async getContainerStats(worktree) {
  const stats = await this.runtime.exec(
    `${this.runtime.getComposeCommand()} stats --no-stream --format json`,
    { cwd: worktree.path }
  );

  return stats.map(s => ({
    service: s.Name,
    cpu: s.CPUPerc,
    memory: s.MemPerc,
    netIO: s.NetIO,
    blockIO: s.BlockIO
  }));
}
```

**Priority**: MEDIUM - Developer productivity

---

## 6. Policy & Permissions (Phase 4 - Security)

### 6.1 Agent Directory Allowlist

**Config**: `.vibe/config.json`
```json
{
  "security": {
    "agents": {
      "allowedPaths": [
        "/src",
        "/tests",
        "/docs"
      ],
      "deniedPaths": [
        "/.env",
        "/secrets",
        "/node_modules"
      ],
      "requireConfirmation": [
        "delete",
        "write:docker-compose.yml",
        "write:package.json"
      ]
    }
  }
}
```

### 6.2 Command Restrictions

```javascript
class AgentSandbox {
  isCommandAllowed(command, worktree) {
    const dangerous = [
      'rm -rf /',
      'docker',  // Don't let agents control Docker
      'sudo',
      'chmod 777'
    ];

    for (const pattern of dangerous) {
      if (command.includes(pattern)) {
        return {
          allowed: false,
          reason: `Dangerous command blocked: ${pattern}`
        };
      }
    }

    return { allowed: true };
  }
}
```

**Priority**: HIGH - Security critical

---

## 7. Undo/Recovery (Phase 5)

### 7.1 Automatic Snapshots

**Before Risky Operations**:
- Sync & reload
- Schema migrations
- Volume resets

```javascript
class SnapshotManager {
  async createSnapshot(worktree, reason) {
    const snapshot = {
      id: generateId(),
      worktree: worktree.name,
      timestamp: Date.now(),
      reason,
      gitCommit: await this.getGitCommit(worktree),
      volumes: await this.snapshotVolumes(worktree)
    };

    await this.saveSnapshot(snapshot);
    return snapshot;
  }

  async restoreSnapshot(snapshotId) {
    const snapshot = await this.loadSnapshot(snapshotId);

    // Restore git state
    await this.gitSync.resetTo(snapshot.worktree, snapshot.gitCommit);

    // Restore volumes
    await this.restoreVolumes(snapshot.worktree, snapshot.volumes);

    // Restart services
    await this.restartServices(snapshot.worktree);
  }
}
```

### 7.2 Rollback UI

**Show in UI**:
- List of recent snapshots
- What changed since snapshot
- One-click restore

**Priority**: HIGH - Safety net

---

## 8. "Open in Browser" Shortcuts (Phase 6)

**UI Feature**: Quick links for mapped ports

```javascript
function renderServiceCard(service) {
  const links = service.ports.map(port => {
    const url = `http://localhost:${port}`;
    return `<a href="${url}" target="_blank">${service.name}:${port} ↗</a>`;
  });

  return `
    <div class="service-card">
      <h3>${service.name}</h3>
      <div class="quick-links">${links.join(' | ')}</div>
    </div>
  `;
}
```

**Priority**: LOW - Nice to have

---

## 9. Git Edge Cases (Phase 5)

### 9.1 Submodule Support

```javascript
async syncWithSubmodules(worktree) {
  // Update main repo
  await this.gitSync.fetchUpstream(worktree);
  await this.gitSync.mergeUpstream(worktree);

  // Update submodules
  await execSync('git submodule update --init --recursive', {
    cwd: worktree.path
  });
}
```

### 9.2 Git LFS Support

```javascript
async syncWithLFS(worktree) {
  // Check if LFS is used
  const hasLFS = await this.hasGitLFS(worktree);

  if (hasLFS) {
    await execSync('git lfs pull', { cwd: worktree.path });
  }

  await this.gitSync.mergeUpstream(worktree);

  if (hasLFS) {
    await execSync('git lfs pull', { cwd: worktree.path });
  }
}
```

### 9.3 Pre-flight Checks

```javascript
async preflightCheck(worktree) {
  const checks = {
    uncommittedChanges: await this.hasUncommittedChanges(worktree),
    unstagedChanges: await this.hasUnstagedChanges(worktree),
    diverged: await this.isDiverged(worktree),
    submodules: await this.hasSubmodules(worktree),
    lfs: await this.hasGitLFS(worktree)
  };

  if (checks.uncommittedChanges) {
    return {
      canProceed: false,
      message: 'You have uncommitted changes. Commit or stash them first.',
      suggestedAction: 'stash'
    };
  }

  return { canProceed: true, checks };
}
```

**Priority**: MEDIUM - Prevents data loss

---

## Implementation Priority

### Phase 2 (Immediate)
1. ✅ Compose config rendering (CRITICAL)
2. ✅ Volume namespacing (HIGH)
3. ✅ Worktree profiles (HIGH)
4. ✅ Resource budgeting basics (MEDIUM)

### Phase 4 (Security)
5. ✅ Agent directory allowlist (HIGH)
6. ✅ Command restrictions (HIGH)

### Phase 5 (Git)
7. ✅ Pre-flight checks (MEDIUM)
8. ✅ Submodule/LFS support (MEDIUM)
9. ✅ Undo/recovery (HIGH)

### Phase 6 (DX)
10. ✅ Pause/resume (MEDIUM)
11. ✅ Clone/snapshot (MEDIUM)
12. ✅ Observability features (MEDIUM)
13. ✅ Open in browser (LOW)

---

## Next Steps

1. **Update REFACTORING-PLAN.md** with these critical features
2. **Create SECURITY-DESIGN.md** for agent/MCP sandboxing
3. **Create TESTING-MATRIX.md** for engine/OS coverage
4. **Update Phase 2 tasks** to include compose rendering first
5. **Create VOLUME-STRATEGY.md** for snapshot/restore approach

---

**Document Version**: 1.0
**Last Updated**: 2025-10-26
**Status**: Ready for Review
