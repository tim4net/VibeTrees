#!/usr/bin/env node
/**
 * worktree-manager: Comprehensive git worktree + tmux + docker-compose orchestrator
 *
 * Features:
 * - Create/delete git worktrees interactively
 * - Each worktree gets a tmux window with Claude Code
 * - Each worktree gets isolated docker-compose services with unique ports
 * - Hot-add/remove worktrees without restarting session
 * - Multiple panes per window: Claude, logs, shell
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { basename, join } from 'path';
import readline from 'readline';
import { PortRegistry } from './port-registry.mjs';

const SESSION_NAME = 'claude-worktrees';
const WORKTREE_BASE = join(process.cwd(), '.worktrees');

/**
 * Worktree Manager
 */
class WorktreeManager {
  constructor() {
    this.portRegistry = new PortRegistry();
    this.sessionName = SESSION_NAME;
  }

  /**
   * Check if tmux is installed
   */
  checkTmux() {
    try {
      execSync('which tmux', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if session exists
   */
  sessionExists() {
    try {
      execSync(`tmux has-session -t ${this.sessionName} 2>/dev/null`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of existing worktrees
   */
  listWorktrees() {
    try {
      const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
      const worktrees = [];
      const lines = output.split('\n');
      let current = {};

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          current.path = line.substring('worktree '.length);
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring('branch '.length).replace('refs/heads/', '');
        } else if (line === '') {
          if (current.path) {
            current.name = basename(current.path);
            worktrees.push(current);
            current = {};
          }
        }
      }

      if (current.path) {
        current.name = basename(current.path);
        worktrees.push(current);
      }

      return worktrees;
    } catch {
      return [];
    }
  }

  /**
   * Create a new git worktree
   */
  async createWorktree(branchName, fromBranch = 'main') {
    const worktreeName = branchName.replace(/\//g, '-');
    const worktreePath = join(WORKTREE_BASE, worktreeName);

    console.log(`\nCreating worktree: ${worktreeName}`);
    console.log(`  Branch: ${branchName}`);
    console.log(`  Path: ${worktreePath}`);

    // Ensure base directory exists
    if (!existsSync(WORKTREE_BASE)) {
      mkdirSync(WORKTREE_BASE, { recursive: true });
    }

    try {
      // Create worktree
      execSync(`git worktree add -b ${branchName} ${worktreePath} ${fromBranch}`, {
        stdio: 'inherit'
      });

      console.log(`✓ Worktree created successfully\n`);

      return { name: worktreeName, path: worktreePath, branch: branchName };
    } catch (error) {
      console.error(`Failed to create worktree:`, error.message);
      return null;
    }
  }

  /**
   * Delete a git worktree
   */
  async deleteWorktree(worktreeName) {
    const worktrees = this.listWorktrees();
    const worktree = worktrees.find(w => w.name === worktreeName);

    if (!worktree) {
      console.error(`Worktree not found: ${worktreeName}`);
      return false;
    }

    // Don't allow deleting main worktree
    if (worktree.branch === 'main' || !worktree.path.includes(WORKTREE_BASE)) {
      console.error(`Cannot delete main worktree`);
      return false;
    }

    console.log(`\nDeleting worktree: ${worktreeName}`);

    try {
      // Stop docker services first
      this.stopDockerCompose(worktree.path);

      // Remove worktree
      execSync(`git worktree remove ${worktree.path} --force`, { stdio: 'inherit' });

      // Release ports
      this.portRegistry.release(worktreeName);

      console.log(`✓ Worktree deleted successfully\n`);
      return true;
    } catch (error) {
      console.error(`Failed to delete worktree:`, error.message);
      return false;
    }
  }

  /**
   * Check for orphaned containers and clean them up
   */
  cleanupOrphanedContainers(worktreePath) {
    try {
      const output = execSync('sudo docker compose ps -q', {
        cwd: worktreePath,
        encoding: 'utf-8'
      }).trim();

      if (output) {
        console.log(`  Found existing containers, stopping them first...`);
        execSync('sudo docker compose down -v', {
          cwd: worktreePath,
          stdio: 'inherit'  // Show cleanup progress
        });
        console.log(`  ✓ Cleaned up existing containers and volumes`);
      }
    } catch {
      // No containers found or error checking - continue
    }
  }

  /**
   * Wait for services to be healthy (non-blocking with timeout)
   */
  waitForServices(worktreePath, timeoutMs = 30000) {
    console.log(`  Services starting in background (may take up to 30s)...`);

    // Run in background so we don't block the UI
    const checkScript = `
      cd "${worktreePath}";
      start_time=$(date +%s);
      while [ $(($(date +%s) - start_time)) -lt ${Math.floor(timeoutMs / 1000)} ]; do
        if sudo docker compose ps --format json 2>/dev/null | grep -q "running"; then
          echo "Services ready";
          exit 0;
        fi;
        sleep 1;
      done;
      echo "Timeout waiting for services";
      exit 1;
    `;

    // Start the check in background
    spawn('bash', ['-c', checkScript], {
      detached: true,
      stdio: 'ignore'
    }).unref();

    return true;
  }

  /**
   * Start docker-compose for a worktree
   */
  startDockerCompose(worktreePath, ports) {
    const composefile = join(worktreePath, 'docker-compose.yml');

    if (!existsSync(composefile)) {
      console.log(`  No docker-compose.yml found, skipping services`);
      return false;
    }

    // Clean up any orphaned containers first
    this.cleanupOrphanedContainers(worktreePath);

    console.log(`  Starting docker-compose services...`);

    // Build environment variable exports for the command
    // Using explicit exports because sudo doesn't preserve env vars
    const envVars = [
      `POSTGRES_PORT=${ports.postgres}`,
      `API_PORT=${ports.api}`,
      `CONSOLE_PORT=${ports.console}`,
      `TEMPORAL_PORT=${ports.temporal}`,
      `TEMPORAL_UI_PORT=${ports.temporalui}`,
      `MINIO_PORT=${ports.minio}`,
      `MINIO_CONSOLE_PORT=${ports.minioconsole}`,
    ].join(' ');

    try {
      execSync(`sudo ${envVars} docker compose up -d`, {
        cwd: worktreePath,
        stdio: 'inherit'  // Show output so user can see progress and sudo prompts
      });
      console.log(`\n  ✓ Services started:`);
      console.log(`    - API: localhost:${ports.api}`);
      console.log(`    - Console: localhost:${ports.console}`);
      console.log(`    - Postgres: localhost:${ports.postgres}`);
      console.log(`    - Temporal: localhost:${ports.temporal}`);
      console.log(`    - Temporal UI: localhost:${ports.temporalui}`);
      console.log(`    - Minio: localhost:${ports.minio}`);
      console.log(`    - Minio Console: localhost:${ports.minioconsole}`);
      console.log(`    (Services may take ~30s to become fully ready)\n`);

      // Don't wait - let services start in background
      // User can monitor in the tmux logs pane

      return true;
    } catch (error) {
      console.error(`  Failed to start services:`, error.message);
      return false;
    }
  }

  /**
   * Stop docker-compose for a worktree
   */
  stopDockerCompose(worktreePath) {
    const composefile = join(worktreePath, 'docker-compose.yml');

    if (!existsSync(composefile)) {
      return;
    }

    try {
      execSync('sudo docker compose down -v', {
        cwd: worktreePath,
        stdio: 'pipe'
      });
      console.log(`  ✓ Services stopped and volumes removed`);
    } catch (error) {
      console.error(`  Failed to stop services:`, error.message);
    }
  }

  /**
   * Add a worktree to the tmux session
   */
  addWorktreeToSession(worktree, startServices = true) {
    const windowIndex = this.getNextWindowIndex();
    const ports = {
      postgres: this.portRegistry.allocate(worktree.name, 'postgres', 5432),
      api: this.portRegistry.allocate(worktree.name, 'api', 3000),
      console: this.portRegistry.allocate(worktree.name, 'console', 5173),
      temporal: this.portRegistry.allocate(worktree.name, 'temporal', 7233),
      temporalui: this.portRegistry.allocate(worktree.name, 'temporalui', 8233),
      minio: this.portRegistry.allocate(worktree.name, 'minio', 9000),
      minioconsole: this.portRegistry.allocate(worktree.name, 'minioconsole', 9001),
    };

    console.log(`\nAdding worktree to tmux session...`);

    // Start docker services only if requested (not for existing worktrees on session creation)
    if (startServices) {
      this.startDockerCompose(worktree.path, ports);
    }

    // Build window name
    const windowName = `${worktree.name} [api:${ports.api} ui:${ports.console}]`;

    // Create window
    execSync(
      `tmux new-window -t ${this.sessionName}:${windowIndex} -n "${windowName}" -c "${worktree.path}"`,
      { stdio: 'inherit' }
    );

    // Split window into panes: Claude (left), logs (top-right), shell (bottom-right)
    // Pane 0: Claude (full left side - 70%)
    // Pane 1: Logs (top right - 30% width, 50% height)
    // Pane 2: Shell (bottom right - 30% width, 50% height)

    // Split horizontally first (left/right)
    execSync(
      `tmux split-window -t ${this.sessionName}:${windowIndex}.0 -h -p 30 -c "${worktree.path}"`,
      { stdio: 'inherit' }
    );

    // Split right pane vertically (top/bottom)
    execSync(
      `tmux split-window -t ${this.sessionName}:${windowIndex}.1 -v -p 50 -c "${worktree.path}"`,
      { stdio: 'inherit' }
    );

    // Pane 0 (left): Start Claude
    execSync(
      `tmux send-keys -t ${this.sessionName}:${windowIndex}.0 "claude" C-m`,
      { stdio: 'inherit' }
    );

    // Pane 1 (top-right): Stream docker logs (all services)
    execSync(
      `tmux send-keys -t ${this.sessionName}:${windowIndex}.1 "sudo docker compose logs -f 2>&1 | grep -v 'Attaching to'" C-m`,
      { stdio: 'inherit' }
    );

    // Pane 2 (bottom-right): Just a shell
    execSync(
      `tmux send-keys -t ${this.sessionName}:${windowIndex}.2 "# Worktree: ${worktree.name} | Branch: ${worktree.branch}" C-m`,
      { stdio: 'inherit' }
    );

    // Focus on Claude pane
    execSync(
      `tmux select-pane -t ${this.sessionName}:${windowIndex}.0`,
      { stdio: 'inherit' }
    );

    console.log(`✓ Window created: ${windowName}`);
    console.log(`  Layout: Claude (left) | Logs (top-right) | Shell (bottom-right)\n`);

    return windowIndex;
  }

  /**
   * Remove a worktree from tmux session
   */
  removeWorktreeFromSession(worktreeName) {
    const windows = this.listSessionWindows();
    const window = windows.find(w => w.name.startsWith(worktreeName));

    if (!window) {
      console.log(`Window for ${worktreeName} not found in session`);
      return;
    }

    console.log(`Removing window: ${window.name}`);

    execSync(`tmux kill-window -t ${this.sessionName}:${window.index}`, { stdio: 'inherit' });
  }

  /**
   * Get next available window index
   */
  getNextWindowIndex() {
    try {
      const output = execSync(`tmux list-windows -t ${this.sessionName} -F "#{window_index}"`, {
        encoding: 'utf-8'
      });
      const indices = output.trim().split('\n').map(Number);
      return Math.max(...indices) + 1;
    } catch {
      return 0;
    }
  }

  /**
   * List windows in session
   */
  listSessionWindows() {
    try {
      const output = execSync(
        `tmux list-windows -t ${this.sessionName} -F "#{window_index}:#{window_name}"`,
        { encoding: 'utf-8' }
      );

      return output.trim().split('\n').map(line => {
        const [index, name] = line.split(':');
        return { index: Number(index), name };
      });
    } catch {
      return [];
    }
  }

  /**
   * Create initial tmux session
   */
  createSession() {
    console.log(`\nCreating tmux session: ${this.sessionName}\n`);

    // Get existing worktrees
    const worktrees = this.listWorktrees();

    if (worktrees.length === 0) {
      console.error('No worktrees found. Run this from a git repository.');
      process.exit(1);
    }

    const mainWorktree = worktrees[0];

    // Create session with first worktree
    execSync(
      `tmux new-session -d -s ${this.sessionName} -n "manager" -c "${process.cwd()}"`,
      { stdio: 'inherit' }
    );

    // Window 0: Manager (this script in interactive mode)
    execSync(
      `tmux send-keys -t ${this.sessionName}:0 "npm run worktree:manage" C-m`,
      { stdio: 'inherit' }
    );

    // Add all existing worktrees (don't restart their services - they're already running!)
    for (const worktree of worktrees) {
      this.addWorktreeToSession(worktree, false);  // false = don't start services
    }

    // Select first worktree window
    execSync(`tmux select-window -t ${this.sessionName}:1`, { stdio: 'inherit' });
  }

  /**
   * Attach to session
   */
  attach() {
    console.log(`\nAttaching to session: ${this.sessionName}`);
    console.log('\nTmux commands:');
    console.log('  Ctrl+b n       - Next window');
    console.log('  Ctrl+b p       - Previous window');
    console.log('  Ctrl+b 0       - Go to manager window');
    console.log('  Ctrl+b 1-9     - Jump to worktree window');
    console.log('  Ctrl+b w       - List all windows');
    console.log('  Ctrl+b o       - Cycle through panes in window');
    console.log('  Ctrl+b d       - Detach (keeps everything running)');
    console.log('  Ctrl+b x       - Kill current pane/window\n');

    const tmux = spawn('tmux', ['attach-session', '-t', this.sessionName], {
      stdio: 'inherit'
    });

    tmux.on('exit', (code) => {
      if (code === 0) {
        console.log('\nDetached from session.');
        console.log(`Reattach with: npm run worktree:attach`);
        console.log(`Manage with: npm run worktree:manage`);
        console.log(`Kill all with: npm run worktree:kill`);
      }
    });
  }

  /**
   * Interactive menu
   */
  async interactiveMenu() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

    while (true) {
      console.log('\n========================================');
      console.log('  Worktree Manager');
      console.log('========================================');
      console.log('1. List worktrees');
      console.log('2. Create new worktree');
      console.log('3. Delete worktree');
      console.log('4. Add worktree to session');
      console.log('5. Remove worktree from session');
      console.log('6. Attach to session');
      console.log('7. Exit');
      console.log('========================================\n');

      const choice = await question('Choose an option: ');

      switch (choice.trim()) {
        case '1': {
          const worktrees = this.listWorktrees();
          console.log(`\nWorktrees (${worktrees.length}):`);
          for (const wt of worktrees) {
            const ports = this.portRegistry.getWorktreePorts(wt.name);
            console.log(`  • ${wt.name} (${wt.branch})`);
            if (Object.keys(ports).length > 0) {
              console.log(`    Ports: ${JSON.stringify(ports)}`);
            }
          }
          break;
        }

        case '2': {
          const branchName = await question('Branch name (e.g. feature/my-feature): ');
          const fromBranch = await question('Create from branch (default: main): ') || 'main';

          const worktree = await this.createWorktree(branchName.trim(), fromBranch.trim());

          if (worktree && this.sessionExists()) {
            const addToSession = await question('Add to tmux session now? (y/n): ');
            if (addToSession.toLowerCase() === 'y') {
              this.addWorktreeToSession(worktree);
            }
          }
          break;
        }

        case '3': {
          const worktrees = this.listWorktrees().filter(w => w.path.includes(WORKTREE_BASE));
          if (worktrees.length === 0) {
            console.log('\nNo deletable worktrees found (not deleting main)');
            break;
          }

          console.log('\nDeletable worktrees:');
          worktrees.forEach((wt, i) => console.log(`  ${i + 1}. ${wt.name} (${wt.branch})`));

          const choice = await question('\nChoose worktree to delete (number): ');
          const index = parseInt(choice) - 1;

          if (index >= 0 && index < worktrees.length) {
            const worktree = worktrees[index];
            const confirm = await question(`Delete ${worktree.name}? (y/n): `);

            if (confirm.toLowerCase() === 'y') {
              if (this.sessionExists()) {
                this.removeWorktreeFromSession(worktree.name);
              }
              await this.deleteWorktree(worktree.name);
            }
          }
          break;
        }

        case '4': {
          const worktrees = this.listWorktrees();
          const windows = this.listSessionWindows();
          const inSession = new Set(windows.map(w => w.name.split(' [')[0]));
          const notInSession = worktrees.filter(wt => !inSession.has(wt.name));

          if (notInSession.length === 0) {
            console.log('\nAll worktrees are already in the session');
            break;
          }

          console.log('\nWorktrees not in session:');
          notInSession.forEach((wt, i) => console.log(`  ${i + 1}. ${wt.name} (${wt.branch})`));

          const choice = await question('\nChoose worktree to add (number): ');
          const index = parseInt(choice) - 1;

          if (index >= 0 && index < notInSession.length) {
            this.addWorktreeToSession(notInSession[index]);
          }
          break;
        }

        case '5': {
          const windows = this.listSessionWindows().filter(w => w.index > 0); // Skip manager window

          if (windows.length === 0) {
            console.log('\nNo worktree windows in session');
            break;
          }

          console.log('\nWorktrees in session:');
          windows.forEach((w, i) => console.log(`  ${i + 1}. ${w.name}`));

          const choice = await question('\nChoose worktree to remove (number): ');
          const index = parseInt(choice) - 1;

          if (index >= 0 && index < windows.length) {
            const name = windows[index].name.split(' [')[0];
            this.removeWorktreeFromSession(name);
          }
          break;
        }

        case '6':
          rl.close();
          this.attach();
          return;

        case '7':
          rl.close();
          console.log('\nExiting...');
          return;

        default:
          console.log('\nInvalid option');
      }
    }
  }

  /**
   * Start the manager
   */
  async start() {
    if (!this.checkTmux()) {
      console.error('Error: tmux is not installed');
      console.error('Install with: brew install tmux');
      process.exit(1);
    }

    const command = process.argv[2];

    if (command === 'attach') {
      if (!this.sessionExists()) {
        console.error(`Session ${this.sessionName} does not exist`);
        console.error('Create it first with: npm run worktree:start');
        process.exit(1);
      }
      this.attach();
      return;
    }

    if (command === 'kill') {
      if (this.sessionExists()) {
        console.log('Killing session...');
        execSync(`tmux kill-session -t ${this.sessionName}`, { stdio: 'inherit' });
        console.log('Session killed.');
      } else {
        console.log('No session to kill');
      }
      return;
    }

    if (command === 'manage') {
      await this.interactiveMenu();
      return;
    }

    // Default: create session and attach
    if (this.sessionExists()) {
      console.log(`Session ${this.sessionName} already exists`);
      this.attach();
    } else {
      this.createSession();
      this.attach();
    }
  }
}

// Run
const manager = new WorktreeManager();
manager.start().catch(console.error);
