# Git Sync & Smart Reload Guide

**Complete guide to git synchronization, change detection, and automatic service management**

---

## Overview

Vibe's Git Sync & Smart Reload system eliminates manual steps after syncing with the main branch. When you sync a worktree, Vibe:

1. **Fetches and merges** updates from main branch
2. **Detects changes** in services, dependencies, and migrations
3. **Automatically reinstalls** dependencies when package files change
4. **Runs database migrations** when migration files are detected
5. **Restarts affected services** in correct dependency order
6. **Resolves simple conflicts** automatically
7. **Notifies AI agents** of important changes

---

## Quick Start

### Basic Sync

```javascript
// Check for updates from main
const response = await fetch(`/api/worktrees/${name}/check-updates`);
const updates = await response.json();
// { hasUpdates: true, commitCount: 5, commits: [...] }

// Sync with smart reload
if (updates.hasUpdates) {
  const syncResponse = await fetch(`/api/worktrees/${name}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy: 'merge',
      smartReload: true
    })
  });

  const result = await syncResponse.json();
  if (result.success) {
    console.log('Sync complete!');
    console.log('Actions taken:', result.smartReload.actions);
  }
}
```

---

## Git Sync Manager

### Components

The sync system consists of three main components:

1. **GitSyncManager** - Git operations (fetch, merge, rebase, rollback)
2. **ChangeDetector** - Analyzes changes to determine impacts
3. **SmartReloadManager** - Executes reload actions (install, migrate, restart)

### GitSyncManager API

#### `fetchUpstream()`

Fetch from origin and check for updates.

**Returns**:
```javascript
{
  hasUpdates: true,
  commitCount: 5,
  commits: [
    { sha: 'abc123', message: 'Add feature X', author: 'John' }
  ],
  baseBranch: 'main'
}
```

**Example**:
```javascript
import { GitSyncManager } from './scripts/git-sync-manager.mjs';

const syncManager = new GitSyncManager('/path/to/worktree', 'main');
const updates = await syncManager.fetchUpstream();

if (updates.hasUpdates) {
  console.log(`${updates.commitCount} commits behind main`);
}
```

#### `syncWithMain(strategy, options)`

Sync worktree with main branch.

**Parameters**:
- `strategy` (string): `'merge'` or `'rebase'`
- `options` (object):
  - `force` (boolean): Force sync even with uncommitted changes
  - `smartReload` (boolean): Enable smart reload after sync
  - `skipDependencies` (boolean): Skip dependency reinstall
  - `skipMigrations` (boolean): Skip migration execution
  - `skipRestart` (boolean): Skip service restart

**Returns**:
```javascript
{
  success: true,
  output: 'Merge successful',
  previousCommit: 'abc123',
  conflicts: null
}
```

**On conflict**:
```javascript
{
  success: false,
  conflicts: ['package.json', 'src/auth.js'],
  rollbackCommit: 'abc123',
  message: '2 file(s) have conflicts'
}
```

**Example**:
```javascript
const result = await syncManager.syncWithMain('merge', {
  smartReload: true,
  force: false
});

if (!result.success) {
  console.error('Conflicts detected:', result.conflicts);
  // Handle conflicts (see Conflict Resolution section)
}
```

#### `rollback(commitSha)`

Rollback to previous commit.

**Parameters**:
- `commitSha` (string): Commit to rollback to

**Example**:
```javascript
const syncResult = await syncManager.syncWithMain('merge');

if (!syncResult.success) {
  // Rollback on failure
  await syncManager.rollback(syncResult.rollbackCommit);
}
```

---

## Change Detection

The **ChangeDetector** analyzes commits to determine what changed and what actions are needed.

### Detection Categories

#### 1. Service Changes

Detects changes to service configuration files:
- `docker-compose.yml`
- `docker-compose.yaml`
- `Dockerfile`
- `.env`
- `.env.local`
- `.env.production`

**Impact**: Services need restart

#### 2. Dependency Changes

Detects changes to dependency files by language:

| Language | Files Detected |
|----------|----------------|
| **Node.js** | `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` |
| **Python** | `requirements.txt`, `Pipfile`, `Pipfile.lock`, `pyproject.toml` |
| **Ruby** | `Gemfile`, `Gemfile.lock` |
| **Go** | `go.mod`, `go.sum` |
| **Rust** | `Cargo.toml`, `Cargo.lock` |
| **PHP** | `composer.json`, `composer.lock` |

**Impact**: Dependencies need reinstall

#### 3. Database Migrations

Detects migration files by framework:

| Framework | Migration Pattern |
|-----------|------------------|
| **Prisma** | `prisma/migrations/**/*.sql` |
| **Sequelize** | `migrations/**/*.js`, `**/migrations/**/*.js` |
| **TypeORM** | `migrations/**/*.ts`, `**/migrations/**/*.ts` |
| **Django** | `**/migrations/*.py` |
| **Flask/Alembic** | `migrations/versions/*.py` |
| **Rails** | `db/migrate/*.rb` |
| **Laravel** | `database/migrations/*.php` |
| **golang-migrate** | `migrations/*.sql` |

**Impact**: Migrations need execution

#### 4. Service Mapping

Maps changed files to affected services using docker-compose.yml context:
- Files in service build context
- Files in service volumes
- Files in service working directory

**Example**:
```yaml
services:
  api:
    build: ./api
    volumes:
      - ./api:/app
```

Files in `./api/` affect `api` service.

### ChangeDetector API

#### `analyzeChanges(commits)`

Analyze changes from commit list.

**Parameters**:
- `commits` (array): Array of commit SHAs

**Returns**:
```javascript
{
  needsServiceRestart: true,
  needsDependencyInstall: true,
  needsMigration: {
    hasMigrations: true,
    count: 2,
    files: [
      'prisma/migrations/20231028_add_users.sql',
      'prisma/migrations/20231028_add_posts.sql'
    ]
  },
  affectedServices: ['api', 'worker'],
  changedFiles: [
    'package.json',
    'docker-compose.yml',
    'prisma/migrations/20231028_add_users.sql',
    'src/api.js'
  ],
  summary: {
    total: 15,
    services: ['docker-compose.yml'],
    dependencies: ['package.json'],
    migrations: ['prisma/migrations/...'],
    code: ['src/api.js']
  }
}
```

**Example**:
```javascript
import { ChangeDetector } from './scripts/git-sync-manager.mjs';

const detector = new ChangeDetector('/path/to/worktree');
const analysis = await detector.analyzeChanges(['abc123', 'def456']);

console.log('Service restart needed:', analysis.needsServiceRestart);
console.log('Dependency install needed:', analysis.needsDependencyInstall);
console.log('Migrations:', analysis.needsMigration.count);
console.log('Affected services:', analysis.affectedServices);
```

#### `buildServiceDependencyGraph()`

Build service dependency graph from docker-compose.yml.

**Returns**: `Map<serviceName, dependencies[]>`

**Example**:
```javascript
const graph = detector.buildServiceDependencyGraph();
// Map {
//   'api' => ['postgres', 'redis'],
//   'worker' => ['postgres', 'redis'],
//   'postgres' => [],
//   'redis' => []
// }
```

#### `getRestartOrder(services)`

Get service restart order (topological sort).

**Parameters**:
- `services` (array): Services to restart

**Returns**: `Array<Array<string>>` - Groups of services that can restart in parallel

**Example**:
```javascript
const order = detector.getRestartOrder(['api', 'worker']);
// [
//   ['postgres', 'redis'],  // Restart these first (in parallel)
//   ['api', 'worker']       // Then restart these (in parallel)
// ]
```

---

## Smart Reload

The **SmartReloadManager** executes actions based on change analysis.

### Reload Actions

#### 1. Reinstall Dependencies

Automatically detects package manager and runs install:

| Package Manager | Detection | Command |
|----------------|-----------|---------|
| **npm** | `package-lock.json` exists | `npm install` |
| **yarn** | `yarn.lock` exists | `yarn install` |
| **pnpm** | `pnpm-lock.yaml` exists | `pnpm install` |
| **pip** | `requirements.txt` exists | `pip install -r requirements.txt` |
| **pipenv** | `Pipfile` exists | `pipenv install` |
| **poetry** | `pyproject.toml` + `poetry.lock` exist | `poetry install` |
| **bundle** | `Gemfile` exists | `bundle install` |
| **go mod** | `go.mod` exists | `go mod download` |
| **cargo** | `Cargo.toml` exists | `cargo build` |
| **composer** | `composer.json` exists | `composer install` |

**Progress tracking**:
```javascript
{
  action: 'reinstall_dependencies',
  success: true,
  installed: ['npm'],
  output: 'added 42 packages...',
  duration: 5234
}
```

#### 2. Run Migrations

Automatically detects migration framework and runs migrations:

| Framework | Detection | Command |
|-----------|-----------|---------|
| **Prisma** | `prisma/schema.prisma` exists | `npx prisma migrate deploy` |
| **Sequelize** | `**/migrations/**/*.js` exists | `npx sequelize-cli db:migrate` |
| **TypeORM** | `**/migrations/**/*.ts` exists | `npx typeorm migration:run` |
| **Django** | `**/migrations/*.py` exists | `python manage.py migrate` |
| **Flask/Alembic** | `migrations/versions/*.py` exists | `flask db upgrade` |
| **Rails** | `db/migrate/*.rb` exists | `bundle exec rake db:migrate` |
| **Laravel** | `database/migrations/*.php` exists | `php artisan migrate` |
| **golang-migrate** | `migrations/*.sql` exists | `migrate -path ./migrations up` |

**Progress tracking**:
```javascript
{
  action: 'run_migrations',
  success: true,
  migrations: [
    { file: 'prisma/migrations/20231028_add_users.sql', applied: true },
    { file: 'prisma/migrations/20231028_add_posts.sql', applied: true }
  ],
  output: 'Applied 2 migrations',
  duration: 1523
}
```

#### 3. Restart Services

Restarts only affected services in correct order:

1. **Stop services** in reverse dependency order
2. **Start services** in dependency order
3. **Health check** each service after start
4. **Report status** (running, failed, timeout)

**Progress tracking**:
```javascript
{
  action: 'restart_services',
  success: true,
  services: ['postgres', 'redis', 'api', 'worker'],
  restartOrder: [
    ['postgres', 'redis'],
    ['api', 'worker']
  ],
  status: {
    postgres: 'running',
    redis: 'running',
    api: 'running',
    worker: 'running'
  },
  duration: 15234
}
```

#### 4. Notify Agent

Sends formatted notification to AI agent's terminal:

**Example notification**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  GIT SYNC COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Synced with main (5 commits merged)
✓ Reinstalled dependencies (npm)
✓ Ran 2 database migrations
✓ Restarted services: api, worker

Changed files (15 total):
  • package.json
  • docker-compose.yml
  • prisma/migrations/20231028_add_users.sql
  • src/api.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### SmartReloadManager API

#### `performSmartReload(analysis, options)`

Perform complete smart reload.

**Parameters**:
- `analysis` (object): Output from `ChangeDetector.analyzeChanges()`
- `options` (object):
  - `skipDependencies` (boolean): Skip dependency reinstall
  - `skipMigrations` (boolean): Skip migration execution
  - `skipRestart` (boolean): Skip service restart
  - `continueOnError` (boolean): Continue even if step fails

**Returns**:
```javascript
{
  success: true,
  actions: [
    { action: 'reinstall_dependencies', success: true, ... },
    { action: 'run_migrations', success: true, ... },
    { action: 'restart_services', success: true, ... }
  ],
  errors: []
}
```

**Example**:
```javascript
import { SmartReloadManager } from './scripts/smart-reload-manager.mjs';

const reloadManager = new SmartReloadManager('/path/to/worktree', 'docker');

const result = await reloadManager.performSmartReload(analysis, {
  skipDependencies: false,
  skipMigrations: false,
  skipRestart: false,
  continueOnError: false
});

if (!result.success) {
  console.error('Smart reload failed:', result.errors);
}
```

---

## Conflict Resolution

The **AIConflictResolver** handles git merge conflicts.

### Conflict Detection

Automatically detects conflicts after sync:

```javascript
const conflicts = resolver.getConflicts();
// [
//   {
//     file: 'package.json',
//     category: 'dependency',
//     content: { conflictCount: 1, conflicts: [...] },
//     resolvable: 'dependency_version'
//   },
//   {
//     file: 'src/auth.js',
//     category: 'code',
//     content: { conflictCount: 2, conflicts: [...] },
//     resolvable: false
//   }
// ]
```

### Conflict Categories

| Category | File Types | Auto-Resolvable |
|----------|-----------|----------------|
| **code** | `.js`, `.ts`, `.py`, `.go`, `.rb`, `.php`, `.rs` | No (requires review) |
| **config** | `.yml`, `.yaml`, `.json`, `.toml` | Sometimes (non-overlapping) |
| **dependency** | `package.json`, `requirements.txt`, etc. | Yes (version bumps) |
| **documentation** | `.md`, `.txt`, `.html`, `.css` | Sometimes (whitespace) |

### Auto-Resolution Strategies

#### 1. Whitespace Conflicts

Conflicts with only whitespace differences.

**Example**:
```diff
<<<<<<< HEAD
function hello() {
  console.log('hello');
}
=======
function hello() {
    console.log('hello');
}
>>>>>>> main
```

**Resolution**: Keep indentation from main branch.

#### 2. Dependency Version Conflicts

Version bumps in dependency files.

**Example**:
```diff
<<<<<<< HEAD
  "react": "^18.2.0"
=======
  "react": "^18.3.0"
>>>>>>> main
```

**Resolution**: Keep newer version (`18.3.0`).

#### 3. Non-Overlapping Config Conflicts

Different keys changed in config files.

**Example**:
```diff
{
<<<<<<< HEAD
  "port": 3000,
  "host": "localhost"
=======
  "database": "postgres://localhost/db"
>>>>>>> main
}
```

**Resolution**: Merge both changes.

### AIConflictResolver API

#### `getConflicts()`

Get all conflicts in worktree.

**Returns**: Array of conflict objects

**Example**:
```javascript
import { AIConflictResolver } from './scripts/ai-conflict-resolver.mjs';

const resolver = new AIConflictResolver('/path/to/worktree');
const conflicts = resolver.getConflicts();

console.log(`${conflicts.length} conflicts detected`);
```

#### `analyzeConflicts()`

Analyze conflicts with resolution suggestions.

**Returns**:
```javascript
{
  total: 3,
  autoResolvable: 1,
  manual: 2,
  byCategory: {
    code: 2,
    dependency: 1
  },
  conflicts: [
    {
      file: 'package.json',
      category: 'dependency',
      resolvable: 'dependency_version',
      suggestion: 'Auto-resolve: Accept newer dependency versions'
    },
    {
      file: 'src/auth.js',
      category: 'code',
      resolvable: false,
      suggestion: 'Manual: Review code changes carefully'
    }
  ]
}
```

**Example**:
```javascript
const analysis = await resolver.analyzeConflicts();

console.log(`Auto-resolvable: ${analysis.autoResolvable}`);
console.log(`Manual review: ${analysis.manual}`);

// Auto-resolve what we can
for (const conflict of analysis.conflicts) {
  if (conflict.resolvable) {
    await resolver.autoResolve(conflict.file, 'auto');
  }
}
```

#### `autoResolve(file, strategy)`

Auto-resolve conflict in file.

**Parameters**:
- `file` (string): Conflicted file path
- `strategy` (string): Resolution strategy
  - `'auto'`: Detect and apply best strategy
  - `'ours'`: Keep our changes
  - `'theirs'`: Keep their changes
  - `'both'`: Merge both (config only)

**Example**:
```javascript
await resolver.autoResolve('package.json', 'auto');
// Resolves version conflicts by keeping newer versions
```

#### `requestAIAssistance(conflict, ptyManager, worktreeName)`

Send conflict info to AI agent's terminal.

**Parameters**:
- `conflict` (object): Conflict object from `getConflicts()`
- `ptyManager` (PTYManager): Active PTY manager
- `worktreeName` (string): Worktree name

**Example**:
```javascript
const conflicts = resolver.getConflicts();
const codeConflicts = conflicts.filter(c => c.category === 'code');

for (const conflict of codeConflicts) {
  await resolver.requestAIAssistance(conflict, ptyManager, 'feature-auth');
}
```

**Agent sees**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CONFLICT DETECTED: src/auth.js
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Category: code
Lines: 42-56

<<<<<<< HEAD
function authenticate(user) {
  return jwt.sign({ id: user.id }, SECRET);
}
=======
function authenticate(user, options = {}) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET, options);
}
>>>>>>> main

Suggestion: Manual review required
- Both sides modified function signature
- Main branch added role and options parameter
- Your branch may need similar changes

To resolve:
1. git diff to see full context
2. Edit src/auth.js manually
3. git add src/auth.js
4. git commit (or continue merge/rebase)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Complete Workflow Example

### Scenario: Feature Branch Needs Main Updates

```javascript
// 1. Check for updates
const updatesResponse = await fetch('/api/worktrees/feature-auth/check-updates');
const updates = await updatesResponse.json();

if (!updates.hasUpdates) {
  console.log('Already up to date');
  return;
}

console.log(`${updates.commitCount} commits behind main`);

// 2. Analyze what will change
const commitsParam = updates.commits.map(c => c.sha).join(',');
const analysisResponse = await fetch(
  `/api/worktrees/feature-auth/analyze-changes?commits=${commitsParam}`
);
const analysis = await analysisResponse.json();

console.log('Impact analysis:');
console.log(`- Services to restart: ${analysis.affectedServices.length}`);
console.log(`- Dependencies: ${analysis.needsDependencyInstall ? 'Yes' : 'No'}`);
console.log(`- Migrations: ${analysis.needsMigration.count || 0}`);

// 3. Show preview to user
const proceed = confirm(`
  This sync will:
  - Merge ${updates.commitCount} commits from main
  - Reinstall dependencies (npm)
  - Run ${analysis.needsMigration.count} migrations
  - Restart services: ${analysis.affectedServices.join(', ')}

  Continue?
`);

if (!proceed) return;

// 4. Perform sync with smart reload
const syncResponse = await fetch('/api/worktrees/feature-auth/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    strategy: 'merge',
    smartReload: true
  })
});

const result = await syncResponse.json();

// 5. Handle result
if (result.success) {
  console.log('✓ Sync complete');
  console.log('Actions taken:');
  result.smartReload.actions.forEach(action => {
    console.log(`  ${action.action}: ${action.success ? '✓' : '✗'}`);
  });
} else if (result.conflicts) {
  // 6. Handle conflicts
  console.error(`✗ Conflicts in ${result.conflicts.length} files`);

  const conflictsResponse = await fetch('/api/worktrees/feature-auth/conflicts/analyze');
  const conflicts = await conflictsResponse.json();

  console.log(`Auto-resolvable: ${conflicts.autoResolvable}`);
  console.log(`Manual review: ${conflicts.manual}`);

  // Auto-resolve simple conflicts
  for (const conflict of conflicts.conflicts) {
    if (conflict.resolvable) {
      await fetch('/api/worktrees/feature-auth/conflicts/resolve', {
        method: 'POST',
        body: JSON.stringify({ file: conflict.file, strategy: 'auto' })
      });
      console.log(`✓ Auto-resolved ${conflict.file}`);
    }
  }

  // Request AI help for complex conflicts
  for (const conflict of conflicts.conflicts) {
    if (!conflict.resolvable && conflict.category === 'code') {
      await fetch('/api/worktrees/feature-auth/conflicts/ai-assist', {
        method: 'POST',
        body: JSON.stringify({ file: conflict.file })
      });
      console.log(`→ Sent ${conflict.file} to AI agent for review`);
    }
  }
} else {
  console.error('✗ Sync failed:', result.message);
}
```

---

## Best Practices

### 1. Check Before Syncing

Always check for updates before syncing:

```javascript
const updates = await checkUpdates();
if (!updates.hasUpdates) return; // Nothing to do
```

### 2. Analyze Impact

Preview changes before applying:

```javascript
const analysis = await analyzeChanges(updates.commits);
// Show user what will happen
```

### 3. Enable Smart Reload

Let Vibe handle post-sync actions:

```json
{
  "smartReload": true
}
```

### 4. Handle Conflicts Gracefully

Auto-resolve what you can, request AI help for the rest:

```javascript
const conflicts = await analyzeConflicts();

// Auto-resolve
for (const conflict of conflicts.conflicts.filter(c => c.resolvable)) {
  await autoResolve(conflict.file);
}

// AI assistance for complex conflicts
for (const conflict of conflicts.conflicts.filter(c => !c.resolvable)) {
  await requestAIAssistance(conflict);
}
```

### 5. Sync Frequently

Sync often to minimize conflict likelihood:
- Daily for active features
- Before starting new work
- Before creating pull requests

---

## Configuration

### Enable/Disable Smart Reload

In `~/.vibetrees/config.json`:

```json
{
  "enableSmartReload": true,
  "autoResolveConflicts": true
}
```

### Customize Sync Strategy

```json
{
  "syncStrategy": "rebase"  // or "merge"
}
```

### Skip Specific Actions

Per-sync via API:

```json
{
  "smartReload": true,
  "skipDependencies": false,
  "skipMigrations": false,
  "skipRestart": false
}
```

---

## Troubleshooting

### Sync Fails: Uncommitted Changes

**Error**: "Cannot sync with uncommitted changes"

**Solution**:
1. Commit your changes: `git commit -am "WIP"`
2. Or force sync: `{ "force": true }`
3. Or stash changes first

### Smart Reload Fails: Package Install

**Error**: "npm install failed"

**Solution**:
1. Check internet connection
2. Verify package.json syntax
3. Try manual install: `cd worktree && npm install`
4. Check for conflicting peer dependencies

### Smart Reload Fails: Migration

**Error**: "Migration failed"

**Solution**:
1. Check database is running: `docker compose ps`
2. Verify migration file syntax
3. Try manual migration: `cd worktree && npx prisma migrate deploy`
4. Check database permissions

### Conflict Auto-Resolution Fails

**Error**: "Cannot auto-resolve conflict in file"

**Solution**:
1. File has complex conflicts requiring manual review
2. Request AI assistance: `POST /api/worktrees/:name/conflicts/ai-assist`
3. Manual resolution:
   ```bash
   cd worktree
   # Edit conflicted files
   git add .
   git commit -m "Resolve conflicts"
   ```

---

## Advanced Topics

### Custom Migration Commands

Add custom migration support:

```javascript
// In config
{
  "migrations": {
    "custom": {
      "pattern": "db/migrations/*.custom",
      "command": "npm run migrate:custom"
    }
  }
}
```

### Service Dependency Override

Override service dependencies:

```javascript
// In docker-compose.yml
services:
  api:
    depends_on:
      - postgres
      - redis
    labels:
      - "vibe.restart.priority=high"
```

### Background Polling

Auto-check for updates:

```javascript
// In config
{
  "pollInterval": 300000  // 5 minutes
}
```

Vibe will check for updates in background and notify when available.

---

## References

- [Configuration Guide](configuration.md) - Sync configuration options
- [API Reference](api.md) - Complete API documentation
- [Architecture Guide](architecture.md) - System design
- [CLAUDE.md](../CLAUDE.md) - Implementation details

---

**Last Updated**: 2025-10-28
**Version**: 1.0
