#!/usr/bin/env node

/**
 * Vibe Worktrees CLI
 *
 * Global entry point for running Vibe from any directory.
 * Usage:
 *   vibe               # Start web UI in current directory
 *   vibe --listen      # Start with network access
 *   vibe --port 8080   # Start on custom port
 *   vibe --help        # Show help
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

// Help text
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Vibe Worktrees - Parallel development with AI agents and isolated containers

Usage:
  vibe               Start web UI in current directory (localhost only)
  vibe --listen      Start with network access (all interfaces)
  vibe --port 8080   Start on custom port (default: 3335)
  vibe --help        Show this help message
  vibe --version     Show version

Examples:
  # Start in current project
  cd ~/my-project
  vibe

  # Allow network access (team collaboration)
  vibe --listen

  # Custom port
  vibe --port 3000

Documentation: https://github.com/your-org/vibe-worktrees
  `);
  process.exit(0);
}

// Version
if (args.includes('--version') || args.includes('-v')) {
  const packageJson = await import('../package.json', { with: { type: 'json' } });
  console.log(`Vibe Worktrees v${packageJson.default.version}`);
  process.exit(0);
}

// Start the web server
const serverPath = join(__dirname, '..', 'scripts', 'worktree-web', 'server.mjs');

console.log('🚀 Starting Vibe Worktrees...');
console.log(`📁 Working directory: ${process.cwd()}`);
console.log('');

// Pass through all arguments to the server
const child = spawn('node', [serverPath, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    VIBE_CWD: process.cwd() // Pass current working directory
  }
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down Vibe...');
  child.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
  process.exit(0);
});

child.on('exit', (code) => {
  process.exit(code);
});
