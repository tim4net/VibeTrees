#!/usr/bin/env node

/**
 * Vibe Worktrees CLI with PM2 Integration
 *
 * Global entry point for running Vibe with PM2 process management.
 * Usage:
 *   vibe               # Start with PM2
 *   vibe --stop        # Stop PM2 process
 *   vibe --restart     # Restart PM2 process
 *   vibe --status      # Show PM2 status
 *   vibe --logs        # Show PM2 logs
 *   vibe --listen      # Start with network access
 *   vibe --port 8080   # Start on custom port
 *   vibe --help        # Show help
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

// Help text
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Vibe Worktrees - Parallel development with AI agents and isolated containers

Usage:
  vibe               Start with PM2 (background process)
  vibe --stop        Stop the server
  vibe --restart     Restart the server
  vibe --status      Show server status
  vibe --logs        Show server logs (follow mode)
  vibe --update      Update to latest version
  vibe --listen      Start with network access (all interfaces)
  vibe --port 8080   Start on custom port (default: 3335)
  vibe --help        Show this help message
  vibe --version     Show version

Examples:
  # Start server in background
  vibe

  # Check if it's running
  vibe --status

  # Update to latest version
  vibe --update

  # View logs
  vibe --logs

  # Stop server
  vibe --stop

  # Allow network access (team collaboration)
  vibe --listen

  # Custom port
  vibe --port 3000

Documentation: https://github.com/tim4net/VibeTrees
  `);
  process.exit(0);
}

// Version
if (args.includes('--version') || args.includes('-v')) {
  const packageJson = await import('../package.json', { with: { type: 'json' } });
  console.log(`Vibe Worktrees v${packageJson.default.version}`);
  process.exit(0);
}

// Check if PM2 is installed
function checkPM2() {
  try {
    execSync('pm2 --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!checkPM2()) {
  console.error('❌ PM2 is not installed globally.');
  console.error('');
  console.error('Install it with:');
  console.error('  npm install -g pm2');
  console.error('');
  process.exit(1);
}

const ecosystemPath = join(__dirname, '..', 'ecosystem.config.cjs');
const PM2_NAME = 'vibe-worktrees';

// Update command
if (args.includes('--update')) {
  console.log('🔄 Updating Vibe Worktrees...');
  console.log('');

  try {
    // Stop server if running
    try {
      execSync(`pm2 stop ${PM2_NAME}`, { stdio: 'ignore' });
      console.log('⏸️  Server stopped');
    } catch {
      // Not running, that's fine
    }

    // Update via npm
    console.log('📦 Updating package...');
    execSync('npm install -g git+https://github.com/tim4net/VibeTrees.git', { stdio: 'inherit' });

    console.log('');
    console.log('✅ Update complete!');
    console.log('');
    console.log('Restart with: vibe');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ Update failed');
    console.error('');
    console.error('Try manually:');
    console.error('  npm install -g github:tim4net/VibeTrees@latest');
    console.error('');
    process.exit(1);
  }
  process.exit(0);
}

// PM2 Management Commands
if (args.includes('--stop')) {
  console.log('🛑 Stopping Vibe Worktrees...');
  try {
    execSync(`pm2 stop ${PM2_NAME}`, { stdio: 'inherit' });
    execSync(`pm2 delete ${PM2_NAME}`, { stdio: 'inherit' });
    console.log('✅ Server stopped');
  } catch (error) {
    console.error('❌ Failed to stop server');
    process.exit(1);
  }
  process.exit(0);
}

if (args.includes('--restart')) {
  console.log('🔄 Restarting Vibe Worktrees...');
  try {
    execSync(`pm2 restart ${PM2_NAME}`, { stdio: 'inherit' });
    console.log('✅ Server restarted');
  } catch (error) {
    console.error('❌ Failed to restart server');
    process.exit(1);
  }
  process.exit(0);
}

if (args.includes('--status')) {
  try {
    execSync(`pm2 status ${PM2_NAME}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Failed to get status');
    process.exit(1);
  }
  process.exit(0);
}

if (args.includes('--logs')) {
  console.log('📋 Showing logs (Ctrl+C to exit)...');
  console.log('');
  try {
    execSync(`pm2 logs ${PM2_NAME} --lines 50`, { stdio: 'inherit' });
  } catch (error) {
    // User pressed Ctrl+C, that's fine
    process.exit(0);
  }
  process.exit(0);
}

// Start with PM2
console.log('🚀 Starting Vibe Worktrees with PM2...');
console.log(`📁 Working directory: ${process.cwd()}`);
console.log('');

// Check if ecosystem.config.cjs exists
if (!existsSync(ecosystemPath)) {
  console.error(`❌ Ecosystem config not found: ${ecosystemPath}`);
  process.exit(1);
}

// Build PM2 start command with environment variables for custom settings
const envVars = [];

// Handle --listen flag
if (args.includes('--listen')) {
  envVars.push('VIBE_LISTEN=true');
}

// Handle --port flag
const portIndex = args.indexOf('--port');
if (portIndex !== -1 && args[portIndex + 1]) {
  const port = args[portIndex + 1];
  envVars.push(`PORT=${port}`);
}

// Set working directory
envVars.push(`VIBE_CWD=${process.cwd()}`);

// Build PM2 command (use startOrReload to prevent duplicates)
const envString = envVars.length > 0 ? envVars.join(' ') + ' ' : '';
const pm2Command = `${envString}pm2 startOrReload ${ecosystemPath}`;

try {
  // Start or reload with PM2 (handles both first start and updates)
  execSync(pm2Command, { stdio: 'inherit', shell: true });

  console.log('');
  console.log('✅ Vibe Worktrees started!');
  console.log('');
  console.log('🌐 Access at: http://localhost:3335');
  console.log('');
  console.log('Useful commands:');
  console.log('  vibe --status   Check status');
  console.log('  vibe --logs     View logs');
  console.log('  vibe --stop     Stop server');
  console.log('');

} catch (error) {
  console.error('');
  console.error('❌ Failed to start Vibe Worktrees');
  console.error('');
  console.error('Try:');
  console.error('  vibe --help     Show all commands');
  console.error('  vibe --logs     Check logs for errors');
  console.error('');
  process.exit(1);
}
