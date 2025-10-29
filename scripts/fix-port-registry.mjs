#!/usr/bin/env node

/**
 * Manual script to fix port registry by syncing with existing worktrees
 * This is useful when:
 * 1. A new project is created with worktrees that conflict with existing ports
 * 2. Port registry gets out of sync with actual worktree state
 * 3. You need to manually fix port conflicts
 */

import { PortRegistry } from './port-registry.mjs';
import { execSync } from 'child_process';

const projectRoot = process.argv[2] || process.cwd();

console.log(`\n🔧 Fixing port registry for: ${projectRoot}\n`);

// Create port registry instance
const registry = new PortRegistry(projectRoot);

console.log('📊 Current port allocations:');
console.log(JSON.stringify(registry.ports, null, 2));

// Get existing worktrees
const output = execSync('git worktree list --porcelain', {
  cwd: projectRoot,
  encoding: 'utf-8'
});

const worktrees = [];
const lines = output.split('\n');
let current = {};

for (const line of lines) {
  if (line.startsWith('worktree ')) {
    current.path = line.substring('worktree '.length);
  } else if (line.startsWith('branch ')) {
    current.branch = line.substring('branch '.length).replace('refs/heads/', '');
  } else if (line === '') {
    if (current.path && current.branch) {
      current.name = current.branch;
      worktrees.push(current);
      current = {};
    }
  }
}

console.log(`\n📁 Found ${worktrees.length} worktrees:`);
worktrees.forEach(wt => console.log(`  - ${wt.name} (${wt.path})`));

// Sync ports from worktrees
console.log('\n🔄 Syncing port allocations from .env files...');
const synced = registry.syncFromWorktrees(worktrees);

console.log(`\n✅ Synced ${synced} port allocations`);

console.log('\n📊 Updated port allocations:');
console.log(JSON.stringify(registry.ports, null, 2));

console.log('\n✨ Done!\n');
