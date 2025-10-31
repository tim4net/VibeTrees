#!/usr/bin/env node
/**
 * Worktree Manager Web Server
 *
 * Provides a web UI for managing git worktrees, docker containers, and Claude Code sessions
 */

import { execSync, spawn } from 'child_process';
import { Worker } from 'worker_threads';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { basename, join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { createServer as createNetServer } from 'net';
import { Profiler } from '../profiler.mjs';
import { PerformanceOptimizer } from '../performance-optimizer.mjs';
import { CacheManager } from '../cache-manager.mjs';
import { FirewallHelper } from '../firewall-helper.mjs';
import { ServiceConfig } from '../service-config.mjs';
import { InitializationManager } from '../initialization-manager.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..', '..');
// Use current working directory as project root (supports multiple instances)
const rootDir = process.cwd();

const args = process.argv.slice(2);
const listenAll = args.includes('--listen');
const ENABLE_PROFILING = args.includes('--profile');
const HOST = listenAll ? '0.0.0.0' : '127.0.0.1';

const portArg = args.find(arg => arg.startsWith('--port='));
const requestedPort = portArg ? parseInt(portArg.split('=')[1], 10) : 3335;
const PORT_RANGE_START = requestedPort;
const PORT_RANGE_END = requestedPort + 10; // Try 10 ports

/**
 * Check if a port is available
 */
function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = createNetServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, host);
  });
}

/**
 * Find an available port in the range
 */
async function findAvailablePort(startPort, endPort, host = '127.0.0.1') {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  throw new Error(`No available ports found in range ${startPort}-${endPort}`);
}

/**
 * Check if main branch is behind remote
 * @param {Function} execFn - Function to execute git commands (for testing)
 * @returns {{ behind: number }} Object with commits behind count
 */
export function checkMainStaleness(execFn = execSync) {
  // Wrapper to handle both test mock (string only) and real execSync (string + options)
  const exec = (cmd) => {
    if (execFn === execSync) {
      return execFn(cmd, { cwd: rootDir, encoding: 'utf8' });
    }
    return execFn(cmd);
  };

  try {
    exec('git fetch origin main');

    const output = exec('git rev-list --count main..origin/main');

    const behind = parseInt(output.trim(), 10);
    return { behind: isNaN(behind) ? 0 : behind };
  } catch (error) {
    console.error('Error checking main staleness:', error.message);
    return { behind: 0, error: error.message };
  }
}

/**
 * Check if main worktree has uncommitted changes
 * @param {Function} execFn - Function to execute git commands (for testing)
 * @returns {{ isDirty: boolean }} Object indicating if main has uncommitted changes
 */
export function checkMainDirtyState(execFn = execSync) {
  try {
    const output = execFn('git status --porcelain', {
      cwd: rootDir,
      encoding: 'utf8'
    });

    const isDirty = output.trim().length > 0;
    return { isDirty };
  } catch (error) {
    console.error('Error checking main dirty state:', error.message);
    return { isDirty: false, error: error.message };
  }
}

/**
 * Check if required dependencies are installed
 * Checks both package root (global install) and current directory (local dev)
 */
function checkDependencies() {
  const requiredDeps = ['express', 'ws', 'node-pty'];

  // Try package root first (global installation)
  const packageNodeModules = join(packageRoot, 'node_modules');
  let allDepsFound = true;

  for (const dep of requiredDeps) {
    const depPath = join(packageNodeModules, dep);
    if (!existsSync(depPath)) {
      allDepsFound = false;
      break;
    }
  }

  if (allDepsFound) return true;

  // Try current directory (local development)
  const localNodeModules = join(rootDir, 'node_modules');
  for (const dep of requiredDeps) {
    const depPath = join(localNodeModules, dep);
    if (!existsSync(depPath)) {
      return false;
    }
  }

  return true;
}

/**
 * Install dependencies if missing
 */
function ensureDependencies() {
  if (!checkDependencies()) {
    console.log('📦 Installing web server dependencies...');
    try {
      // Determine install location: package root if it has package.json, else current dir
      const installDir = existsSync(join(packageRoot, 'package.json')) ? packageRoot : rootDir;

      execSync('npm install', {
        cwd: installDir,
        stdio: 'inherit',
        encoding: 'utf-8'
      });
      console.log('✓ Dependencies installed\n');
    } catch (error) {
      console.error('Failed to install dependencies:', error.message);
      console.error('Try running: npm install -g vibetrees');
      process.exit(1);
    }
  }
}

// Ensure dependencies before importing modules
ensureDependencies();

// Dynamic imports after ensuring dependencies
const express = (await import('express')).default;
const multer = (await import('multer')).default;
const { createServer } = await import('http');
const { WebSocketServer } = await import('ws');
const pty = await import('node-pty');
const { PortRegistry } = await import('../port-registry.mjs');
const { FirstRunWizard } = await import('../first-run-wizard.mjs');
const { ContainerRuntime } = await import('../container-runtime.mjs');
const { ComposeInspector } = await import('../compose-inspector.mjs');
const { ConfigManager } = await import('../config-manager.mjs');
const { DataSync } = await import('../data-sync.mjs');
const { McpManager } = await import('../mcp-manager.mjs');
const { agentRegistry } = await import('../agents/index.mjs');
const { GitSyncManager } = await import('../git-sync-manager.mjs');
const { SmartReloadManager } = await import('../smart-reload-manager.mjs');
const { AIConflictResolver } = await import('../ai-conflict-resolver.mjs');
const { DatabaseManager} = await import('../database-manager.mjs');
const { DatabaseValidator } = await import('../database-validator.mjs');
const { BranchManager } = await import('../branch-manager.mjs');
const { BranchCleanupManager } = await import('../branch-cleanup-manager.mjs');
const { WorktreeImporter } = await import('../worktree-importer.mjs');
const { DiagnosticRunner } = await import('../diagnostic-runner.mjs');
const { PTYSessionManager } = await import('../pty-session-manager.mjs');
const { WorktreeManager } = await import('./worktree-manager.mjs');

const WORKTREE_BASE = join(process.cwd(), '.worktrees');

const runtime = new ContainerRuntime();
const config = new ConfigManager(process.cwd());
config.load(); // Load or create default config
const mcpManager = new McpManager(process.cwd(), runtime);

console.log(`🐳 Container runtime: ${runtime.getRuntime()} (${runtime.getComposeCommand()})`);
console.log(`🔌 MCP servers discovered: ${mcpManager.discoverServers().length}`);
console.log(`🤖 AI agents available: ${agentRegistry.list().join(', ')}`);
// Initialize WorktreeManager with all dependencies
const worktreeManager = new WorktreeManager({
  rootDir,
  config,
  runtime,
  mcpManager,
  worktreeBase: WORKTREE_BASE,
  modules: {
    PortRegistry,
    PTYSessionManager,
    Profiler,
    PerformanceOptimizer,
    CacheManager,
    WorktreeImporter,
    DiagnosticRunner,
    InitializationManager,
    ComposeInspector,
    ServiceConfig,
    GitSyncManager,
    SmartReloadManager,
    AIConflictResolver
  }
});

/**
 * Format log line by adding color and structure
 */
function formatLogLine(line, serviceName) {
  const cleanLine = line.replace(/^[\w-]+-\d+\s+\|\s+/, '');

  const timestampMatch = cleanLine.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/);
  if (timestampMatch) {
    const timestamp = timestampMatch[1];
    const message = cleanLine.substring(timestamp.length).trim();

    let color = '37'; // default white
    if (message.match(/\b(ERROR|FATAL|CRITICAL)\b/i)) {
      color = '31'; // red
    } else if (message.match(/\b(WARN|WARNING)\b/i)) {
      color = '33'; // yellow
    } else if (message.match(/\b(INFO)\b/i)) {
      color = '36'; // cyan
    } else if (message.match(/\b(DEBUG|TRACE)\b/i)) {
      color = '90'; // gray
    }

    return `\x1b[90m${timestamp}\x1b[0m \x1b[${color}m${message}\x1b[0m`;
  }

  return cleanLine;
}

/**
 * Handle logs WebSocket connection
 */
function handleLogsConnection(ws, worktreeName, serviceName, manager) {

  const worktrees = manager.listWorktrees();
  const worktree = worktrees.find(w => w.name === worktreeName);

  if (!worktree) {
    ws.send('\x1b[31mError: Worktree not found\x1b[0m\r\n');
    ws.close();
    return;
  }

  const composeCmd = runtime.getComposeCommand().split(' ');
  const args = [...composeCmd.slice(1), 'logs', '-f', '--tail=100', '--no-log-prefix', serviceName];
  const cmd = runtime.needsElevation() ? 'sudo' : composeCmd[0];
  const fullArgs = runtime.needsElevation() ? [composeCmd[0], ...args] : args;

  const logsProcess = spawn(cmd, fullArgs, {
    cwd: worktree.path,
    env: process.env
  });

  let buffer = '';

  logsProcess.stdout.on('data', (data) => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          ws.send(formatLogLine(line, serviceName) + '\r\n');
        }
      }
    }
  });

  logsProcess.stderr.on('data', (data) => {
    if (ws.readyState === 1) {
      ws.send(`\x1b[31m${data.toString()}\x1b[0m`);
    }
  });

  logsProcess.on('error', (error) => {
    console.error(`\x1b[31mLogs process error for ${serviceName}: ${error.message}\x1b[0m`);
    if (ws.readyState === 1) {
      ws.send(`\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    }
  });

  ws.on('close', () => {
    logsProcess.kill();
  });

  ws.send(`\x1b[1;36m╔═══ Logs for ${serviceName} (${worktreeName}) ═══╗\x1b[0m\r\n\r\n`);
}

/**
 * Handle combined logs WebSocket connection (all services)
 */
function handleCombinedLogsConnection(ws, worktreeName, manager) {

  const worktrees = manager.listWorktrees();
  const worktree = worktrees.find(w => w.name === worktreeName);

  if (!worktree) {
    ws.send('\x1b[31mError: Worktree not found\x1b[0m\r\n');
    ws.close();
    return;
  }

  const composeCmd = runtime.getComposeCommand().split(' ');
  const args = [...composeCmd.slice(1), 'logs', '-f', '--tail=100'];
  const cmd = runtime.needsElevation() ? 'sudo' : composeCmd[0];
  const fullArgs = runtime.needsElevation() ? [composeCmd[0], ...args] : args;

  const logsProcess = spawn(cmd, fullArgs, {
    cwd: worktree.path,
    env: process.env
  });

  let buffer = '';

  logsProcess.stdout.on('data', (data) => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          // For combined logs, don't strip service prefix - it's useful to see which service
          ws.send(line + '\r\n');
        }
      }
    }
  });

  logsProcess.stderr.on('data', (data) => {
    if (ws.readyState === 1) {
      ws.send(`\x1b[31m${data.toString()}\x1b[0m`);
    }
  });

  logsProcess.on('error', (error) => {
    console.error(`\x1b[31mCombined logs process error: ${error.message}\x1b[0m`);
    if (ws.readyState === 1) {
      ws.send(`\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    }
  });

  ws.on('close', () => {
    logsProcess.kill();
  });

  ws.send(`\x1b[1;36m╔═══ Combined Logs for All Services (${worktreeName}) ═══╗\x1b[0m\r\n\r\n`);
}

/**
 * Handle terminal WebSocket connection
 */
function handleTerminalConnection(ws, worktreeName, command, manager) {

  const worktrees = manager.listWorktrees();
  const worktree = worktrees.find(w => w.name === worktreeName);

  if (!worktree) {
    ws.send('\r\n\x1b[31mError: Worktree not found\x1b[0m\r\n');
    ws.close();
    return;
  }

  const sessionKey = `${worktreeName}:${command}`;
  let sessionId;
  let session;

  // Try to find existing session
  for (const [sid, sess] of manager.ptyManager._sessions) {
    if (sess.worktreeName === worktreeName && sess.agent === command) {
      sessionId = sid;
      session = sess;
      break;
    }
  }

  if (!sessionId) {
    sessionId = manager.ptyManager.createSession(worktreeName, command, worktree.path);
    session = manager.ptyManager.getSession(sessionId);
  }

  // Generate unique client ID for this WebSocket connection
  const clientId = `${sessionId}-${Date.now()}`;

  // Attach client to session (returns previous WebSocket if takeover)
  const previousWs = manager.ptyManager.attachClient(sessionId, clientId, ws);
  const isTakeover = !!previousWs;

  // If this is a takeover, notify the previous client
  if (isTakeover && previousWs.readyState === 1) { // WebSocket.OPEN
    try {
      previousWs.send(JSON.stringify({
        type: 'takeover',
        message: 'Session taken over by another client'
      }));
    } catch (e) {
      console.error(`[TAKEOVER] Failed to notify previous client: ${e.message}`);
    }
  }

  let terminal;
  if (!session.pty) {
    // Determine command and args based on agent type
    let commandStr, args;
    if (command === 'shell') {
      commandStr = process.env.SHELL || '/bin/bash';
      args = [];
    } else if (command === 'codex') {
      commandStr = 'npx';
      args = ['-y', '@openai/codex@latest', '--dangerously-bypass-approvals-and-sandbox'];
    } else {
      // npx handles caching intelligently - no need to clear cache
      commandStr = 'npx';
      args = ['-y', '@anthropic-ai/claude-code@latest', '--dangerously-skip-permissions'];
    }

    terminal = manager.ptyManager.spawnPTY(sessionId, {
      command: commandStr,
      args,
      cols: 120,
      rows: 30
    });

  } else {
    terminal = session.pty;

    // Clean up any existing listeners for this session to prevent memory leaks
    if (session.activeListener) {
      terminal.removeListener('data', session.activeListener);
      session.activeListener = null;
    }

    // Clean up old WebSocket message handler to prevent duplicates
    if (session.activeMessageHandler && session.activeWs) {
      session.activeWs.removeListener('message', session.activeMessageHandler);
      session.activeMessageHandler = null;
      session.activeWs = null;
    }
  }

  const BACKPRESSURE_THRESHOLD = 1024 * 1024; // 1MB buffer threshold
  const BACKPRESSURE_TIMEOUT = 30000; // 30 seconds max pause
  const BACKPRESSURE_CHECK_INTERVAL = 100; // Check every 100ms
  let draining = false;
  let isPaused = false; // Server-side backpressure pause state
  let clientPaused = false; // Client-side flow control pause state

  // Smart output buffering: batch small outputs, send large ones immediately
  let outputBuffer = '';
  let outputTimer = null;
  const OUTPUT_BATCH_MS = 4; // Quarter frame at 60fps for lower latency
  const LARGE_OUTPUT_THRESHOLD = 512; // 512 bytes - send immediately if larger

  const flushOutput = () => {
    if (outputBuffer && ws.readyState === 1) {
      ws.send(outputBuffer);
      outputBuffer = '';
    }
    outputTimer = null;
  };

  const onData = (data) => {
    if (ws.readyState !== 1) { // Not WebSocket.OPEN
      return;
    }

    // Check backpressure only for large outputs (>10KB)
    // Use event-driven approach instead of polling to avoid blocking event loop
    if (data.length > 10000 && ws.bufferedAmount > BACKPRESSURE_THRESHOLD) {
      if (!draining) {
        draining = true;
        isPaused = true;
        terminal.pause();
        console.warn(`[BACKPRESSURE] Pausing PTY for ${worktreeName} (buffer: ${ws.bufferedAmount} bytes)`);

        try {
          ws.send(JSON.stringify({
            type: 'status',
            message: 'Output paused (slow connection)',
            paused: true
          }));
        } catch (e) {
          console.error('[BACKPRESSURE] Failed to send pause notification:', e.message);
        }

        // Event-driven drain handling - no polling!
        const pauseStart = Date.now();
        const drainTimeout = setTimeout(() => {
          // Safety timeout after 30s
          console.warn(`[BACKPRESSURE] Timeout after ${BACKPRESSURE_TIMEOUT}ms - force resuming PTY for session ${sessionId}`);
          draining = false;
          isPaused = false;
          terminal.resume();
          try {
            ws.send(JSON.stringify({ type: 'status', message: '', paused: false }));
          } catch (e) {}
        }, BACKPRESSURE_TIMEOUT);

        // Use 'drain' event instead of polling
        const drainHandler = () => {
          if (ws.bufferedAmount < BACKPRESSURE_THRESHOLD / 2) {
            clearTimeout(drainTimeout);
            ws.off('drain', drainHandler);
            draining = false;
            isPaused = false;
            terminal.resume();
            try {
              ws.send(JSON.stringify({ type: 'status', message: '', paused: false }));
            } catch (e) {}
          }
        };
        ws.on('drain', drainHandler);
      }
      return; // Don't send during backpressure
    }

    // Fast path: Send large outputs immediately
    if (data.length > LARGE_OUTPUT_THRESHOLD) {
      // Flush any pending buffer first
      if (outputBuffer) {
        ws.send(outputBuffer);
        outputBuffer = '';
        if (outputTimer) {
          clearTimeout(outputTimer);
          outputTimer = null;
        }
      }
      ws.send(data);
    } else {
      // Batch small outputs (typical terminal output)
      outputBuffer += data;
      if (!outputTimer) {
        outputTimer = setTimeout(flushOutput, OUTPUT_BATCH_MS);
      }
    }
  };

  terminal.onData(onData);

  // Store listener reference for cleanup
  session.activeListener = onData;



  // OPTIMIZED: Minimal overhead message handler
  const messageHandler = (data) => {
    // Convert Buffer to string for unified processing
    const dataStr = Buffer.isBuffer(data) ? data.toString() : data.toString();

    // OPTIMIZED: Detect control messages by prefix (avoids full JSON parse for normal input)
    if (dataStr.length > 8 && dataStr[0] === '{' && dataStr.slice(0, 8) === '{"type":') {
      // Anything starting with {"type": is a control message - parse and handle it
      try {
        const msg = JSON.parse(dataStr);

        // Handle resize control message
        if (msg.type === 'resize' && msg.cols && msg.rows) {
          terminal.resize(msg.cols, msg.rows);
          return;
        }

        // Handle client-side flow control: pause
        if (msg.type === 'pause') {
          if (!clientPaused && terminal && typeof terminal.pause === 'function') {
            const wasFullyResumed = !isPaused && !clientPaused;
            clientPaused = true;
            // Only pause PTY if neither system has it paused
            if (wasFullyResumed) {
              terminal.pause();
              console.log(`[PTY Flow Control] Client requested pause for ${worktreeName}`);
            }
          }
          return;
        }

        // Handle client-side flow control: resume
        if (msg.type === 'resume') {
          if (clientPaused && terminal && typeof terminal.resume === 'function') {
            clientPaused = false;
            // Only resume PTY if server backpressure is also not active
            if (!isPaused) {
              terminal.resume();
              console.log(`[PTY Flow Control] Client requested resume for ${worktreeName}`);
            }
          }
          return;
        }

        // Unknown/unsupported control message - ignore it
        return;
      } catch (e) {
        // Malformed JSON that looks like control message - ignore it
        return;
      }
    }

    // Default: terminal input - check both pause states
    if (!isPaused && !clientPaused) {
      terminal.write(dataStr);
    }
  };

  ws.on('message', messageHandler);

  // Store handler reference for cleanup on reconnect
  session.activeMessageHandler = messageHandler;
  session.activeWs = ws;

  // Handle WebSocket errors
  ws.on('error', (error) => {
    console.error(`[TERMINAL] WebSocket error for ${worktreeName} (session: ${sessionId}):`, error.message);

    // Clean up drain interval if exists
    if (session && session.drainInterval) {
      clearInterval(session.drainInterval);
      session.drainInterval = null;
    }

    // Ensure PTY is resumed
    if (session && session.terminal) {
      session.terminal.resume();
    }

    // Don't destroy the session - allow reconnection
  });

  ws.on('close', () => {

    // Clean up drain interval if exists
    if (session && session.drainInterval) {
      clearInterval(session.drainInterval);
      session.drainInterval = null;
    }

    // Ensure PTY is resumed if it was paused
    if (session && session.terminal) {
      session.terminal.resume();
    }

    if (session && session.activeListener) {
      terminal.removeListener('data', session.activeListener);
      session.activeListener = null;
    }

    // Detach client but keep session alive for reconnection
    manager.ptyManager.detachClient(sessionId);
  });

  const sessionName = command === 'codex' ? 'Codex' : command === 'shell' ? 'Shell' : 'Claude Code';

  ws.send(JSON.stringify({
    type: 'session',
    sessionId: sessionId,
    sessionName: sessionName,
    tookOver: isTakeover,
    profiling: ENABLE_PROFILING
  }));

  if (isTakeover) {
    ws.send(`\r\n\x1b[33mConnected to ${sessionName} session (ID: ${sessionId.slice(0, 8)}) - took over from previous client\x1b[0m\r\n`);
  } else {
    ws.send(`\r\n\x1b[32mConnected to ${sessionName} session (ID: ${sessionId.slice(0, 8)})\x1b[0m\r\n`);
  }
}

/**
 * Setup Express app
 */
function createApp() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const manager = worktreeManager; // Use module-level instance

  app.use(express.json());
  app.use(express.static(join(__dirname, 'public')));

  // Multer configuration for file uploads
  const upload = multer({ dest: join(homedir(), '.vibetrees', 'uploads') });

  /**
   * Helper: Get worktree by name or send 404
   * @returns {Object|null} Worktree object or null if response was sent
   */
  function getWorktreeOrError(name, res) {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === name);

    if (!worktree) {
      res.status(404).json({ error: 'Worktree not found' });
      return null;
    }

    return worktree;
  }

  /**
   * Helper: Standardized error response
   */
  function sendError(res, error, statusCode = 500) {
    console.error(error.message || error);
    res.status(statusCode).json({ error: error.message || String(error) });
  }

  // WebSocket for UI updates
  wss.on('connection', (ws, req) => {
    // Format: /terminal/{worktreeName}?command={claude|codex}
    const terminalMatch = req.url.match(/^\/terminal\/([^?]+)(\?(.+))?$/);
    if (terminalMatch) {
      const worktreeName = decodeURIComponent(terminalMatch[1]);
      const queryString = terminalMatch[3] || '';
      const params = new URLSearchParams(queryString);
      const command = params.get('command') || 'claude';

      handleTerminalConnection(ws, worktreeName, command, manager);
      return;
    }

    // Check if this is a combined logs connection (all services)
    // Format: /logs/{worktreeName}
    const combinedLogsMatch = req.url.match(/^\/logs\/([^/]+)$/);
    if (combinedLogsMatch) {
      const worktreeName = decodeURIComponent(combinedLogsMatch[1]);

      handleCombinedLogsConnection(ws, worktreeName, manager);
      return;
    }

    // Format: /logs/{worktreeName}/{service}
    const logsMatch = req.url.match(/^\/logs\/([^/]+)\/([^/]+)$/);
    if (logsMatch) {
      const worktreeName = decodeURIComponent(logsMatch[1]);
      const serviceName = decodeURIComponent(logsMatch[2]);

      handleLogsConnection(ws, worktreeName, serviceName, manager);
      return;
    }

    // Regular UI WebSocket
    manager.clients.add(ws);
    ws.on('close', () => manager.clients.delete(ws));
  });

  // API Routes
  app.get('/api/initialization/status', (req, res) => {
    res.json(manager.initializationManager?.getStatus() || {
      initialized: true,
      overallProgress: 100,
      totalTasks: 0,
      completedTasks: 0,
      tasks: []
    });
  });

  app.get('/api/version', (req, res) => {
    try {
      const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'));
      const projectName = basename(process.cwd());
      res.json({
        version: packageJson.version,
        name: packageJson.name,
        projectName
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to read version' });
    }
  });

  app.get('/api/worktrees', async (req, res) => {
    // Use async worker thread version to avoid blocking event loop
    const worktrees = await manager.listWorktreesAsync();
    res.json(worktrees);
  });

  app.post('/api/worktrees', async (req, res) => {
    const { branchName, fromBranch, agent } = req.body;
    const force = req.query.force === 'true';
    const baseBranch = fromBranch || 'main';

    // Only check staleness for 'main' branch
    if (baseBranch === 'main' && !force) {
      const dirtyCheck = checkMainDirtyState();
      if (dirtyCheck.isDirty) {
        return res.status(409).json({
          needsSync: false,
          hasDirtyState: true,
          commitsBehind: 0,
          message: 'Cannot sync: main has uncommitted changes. Please commit or stash changes first.'
        });
      }

      const stalenessCheck = checkMainStaleness();
      if (stalenessCheck.behind > 0) {
        return res.status(409).json({
          needsSync: true,
          hasDirtyState: false,
          commitsBehind: stalenessCheck.behind,
          message: `main is ${stalenessCheck.behind} commit${stalenessCheck.behind > 1 ? 's' : ''} behind origin/main`
        });
      }
    }

    // Calculate worktree name using same logic as manager
    const slugifiedBranch = branchName
      .toLowerCase()
      .replace(/[^a-z0-9\/._-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/\//g, '-');
    const worktreeName = slugifiedBranch;

    // Return immediately with 202 Accepted
    res.status(202).json({
      success: true,
      name: worktreeName,
      branch: branchName,
      status: 'creating',
      message: 'Worktree creation started'
    });

    // Broadcast initial creating state
    manager.broadcast('worktree:creating', {
      name: worktreeName,
      branch: branchName,
      agent: agent || 'claude'
    });

    // Create worktree in background (don't await)
    manager.createWorktree(branchName, baseBranch)
      .then(result => {
        // Broadcast completion
        manager.broadcast('worktree:created', {
          name: worktreeName,
          ...result
        });
      })
      .catch(error => {
        // Broadcast error
        manager.broadcast('worktree:error', {
          name: worktreeName,
          error: error.message
        });
      });
  });

  app.delete('/api/worktrees/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const { deleteBranch, deleteLocal, deleteRemote, force } = req.body || {};

      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

      // Delete worktree (existing logic)
      const result = await manager.deleteWorktree(name);

      // Optionally delete branch
      let branchDeletion = null;
      if (deleteBranch && worktree.branch) {
        const branchManager = new BranchCleanupManager(process.cwd());
        branchDeletion = await branchManager.deleteBranch(worktree.branch, {
          deleteLocal: deleteLocal !== false, // Default true
          deleteRemote: deleteRemote !== false, // Default true
          force: force || false
        });
      }

      res.json({
        ...result,
        branchDeletion
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Get branch status before deletion (Phase 2.8)
  app.get('/api/worktrees/:name/branch-status', async (req, res) => {
    try {
      const { name } = req.params;
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

      if (!worktree.branch) {
        return res.status(400).json({ error: 'Worktree has no associated branch' });
      }

      const branchManager = new BranchCleanupManager(process.cwd());
      const status = await branchManager.getBranchStatus(worktree.branch);

      res.json(status);
    } catch (error) {
      sendError(res, error);
    }
  });

  // Get detailed list of changed files (respects .gitignore)
  app.get('/api/worktrees/:name/files', (req, res) => {
    try {
      const { name } = req.params;
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

      const files = manager.getDetailedFileChanges(worktree.path);
      res.json(files);
    } catch (error) {
      sendError(res, error);
    }
  });

  // List all available branches (Phase 2.7)
  app.get('/api/branches', async (req, res) => {
    try {
      const branchManager = new BranchManager(process.cwd());
      const branches = await branchManager.listAvailableBranches();
      res.json(branches);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/worktrees/:name/close-info', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.json({ success: false, error: 'Worktree not found' });
    }

    try {
      const mergeStatus = await manager.checkPRMergeStatus(
        req.params.name,
        worktree.path
      );

      const dbStats = await manager.getWorktreeDatabaseStats(worktree.path);

      const mainStatus = await manager.checkMainWorktreeClean();

      res.json({
        success: true,
        worktree: req.params.name,
        branch: mergeStatus.branch || 'unknown',
        isMerged: mergeStatus.isMerged || false,
        mergeMessage: mergeStatus.message || mergeStatus.error || 'Unknown status',
        mainIsClean: mainStatus.clean || false,
        mainStatus: mainStatus.status || mainStatus.error || 'Unknown',
        databaseTables: dbStats.tables || []
      });
    } catch (error) {
      console.error('Error getting close info:', error);
      res.json({
        success: false,
        error: error.message
      });
    }
  });

  // Git Sync API Routes (Phase 2.9 + Phase 5)
  app.get('/api/worktrees/:name/check-updates', async (req, res) => {
      const { name } = req.params;
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

    try {
      const result = await manager.checkUpdates(req.params.name, worktree.path);
      res.json(result);
    } catch (error) {
      console.error('Error checking updates:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/worktrees/:name/sync', async (req, res) => {
      const { name } = req.params;
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

    try {
      const { strategy = 'merge', force = false } = req.body;
      const result = await manager.syncWorktree(
        req.params.name,
        worktree.path,
        { strategy, force }
      );
      res.json(result);
    } catch (error) {
      console.error('Error syncing worktree:', error);

      if (error.message.includes('CONFLICT') || error.message.includes('conflict')) {
        try {
          console.log('Attempting AI conflict resolution...');
          const { AIConflictResolver } = await import('../ai-conflict-resolver.mjs');
          const resolver = new AIConflictResolver(worktree.path);
          const analysis = await resolver.analyzeConflicts();

          if (analysis.autoResolvable > 0) {
            return res.json({
              success: true,
              message: 'Conflicts analyzed - auto-resolvable conflicts found',
              analysis
            });
          } else {
            return res.status(409).json({
              success: false,
              error: 'Could not auto-resolve conflicts',
              conflicts: analysis.conflicts,
              needsManualResolution: true
            });
          }
        } catch (resolveError) {
          console.error('AI conflict resolution failed:', resolveError);
          return res.status(409).json({
            success: false,
            error: 'Conflict resolution failed: ' + resolveError.message,
            needsManualResolution: true
          });
        }
      }

      // Other errors
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/worktrees/:name/analyze-changes', async (req, res) => {
      const { name } = req.params;
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

    try {
      const { commits } = req.query;
      const commitList = commits ? commits.split(',') : [];

      const result = await manager.analyzeChanges(
        req.params.name,
        worktree.path,
        commitList
      );
      res.json(result);
    } catch (error) {
      console.error('Error analyzing changes:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/worktrees/:name/rollback', async (req, res) => {
      const { name } = req.params;
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

    try {
      const { commitSha } = req.body;
      if (!commitSha) {
        return res.status(400).json({
          success: false,
          error: 'commitSha is required'
        });
      }

      const result = await manager.rollbackWorktree(
        req.params.name,
        worktree.path,
        commitSha
      );
      res.json(result);
    } catch (error) {
      console.error('Error rolling back worktree:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/worktrees/:name/smart-reload', async (req, res) => {
      const { name } = req.params;
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

    try {
      const { commits, options = {} } = req.body;
      if (!commits || !Array.isArray(commits)) {
        return res.status(400).json({
          success: false,
          error: 'commits array is required'
        });
      }

      const result = await manager.performSmartReload(
        req.params.name,
        worktree.path,
        commits,
        options
      );
      res.json(result);
    } catch (error) {
      console.error('Error performing smart reload:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Conflict Resolution API Routes (Phase 5.3)
  app.get('/api/worktrees/:name/conflicts', async (req, res) => {
      const { name } = req.params;
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

    try {
      const result = await manager.getConflicts(req.params.name, worktree.path);
      res.json(result);
    } catch (error) {
      console.error('Error getting conflicts:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/worktrees/:name/conflicts/analyze', async (req, res) => {
      const { name } = req.params;
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

    try {
      const result = await manager.analyzeConflicts(req.params.name, worktree.path);
      res.json(result);
    } catch (error) {
      console.error('Error analyzing conflicts:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/worktrees/:name/conflicts/resolve', async (req, res) => {
      const { name } = req.params;
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

    try {
      const { file, strategy = 'auto' } = req.body;
      if (!file) {
        return res.status(400).json({
          success: false,
          error: 'file is required'
        });
      }

      const result = await manager.resolveConflict(
        req.params.name,
        worktree.path,
        file,
        strategy
      );
      res.json(result);
    } catch (error) {
      console.error('Error resolving conflict:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/worktrees/:name/conflicts/ai-assist', async (req, res) => {
      const { name } = req.params;
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

    try {
      const { file } = req.body;
      if (!file) {
        return res.status(400).json({
          success: false,
          error: 'file is required'
        });
      }

      const result = await manager.requestAIAssistance(
        req.params.name,
        worktree.path,
        file
      );
      res.json(result);
    } catch (error) {
      console.error('Error requesting AI assistance:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Disk space check endpoint
  app.get('/api/disk-space', async (req, res) => {
    const { path: checkPath, requiredBytes } = req.query;

    if (!checkPath || !requiredBytes) {
      return res.status(400).json({
        success: false,
        error: 'path and requiredBytes query parameters are required'
      });
    }

    try {
      const { SafetyChecks } = await import('../safety-checks.mjs');
      const result = await SafetyChecks.checkDiskSpace(
        checkPath,
        parseInt(requiredBytes, 10)
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error checking disk space:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Database dry-run export endpoint
  app.post('/api/worktrees/:name/database/dry-run-export', async (req, res) => {
    const { name } = req.params;
    const { type = 'full' } = req.body;

    try {
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

      const ports = manager.portRegistry.getWorktreePorts(name);
      const dbPort = manager._findDatabasePort(ports);

      if (!dbPort) {
        return res.status(400).json({ error: 'No database service found for this worktree' });
      }

      const dbConfig = {
        host: 'localhost',
        port: dbPort,
        database: 'vibe',
        user: 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      };

      const dbManager = new DatabaseManager(dbConfig);
      const tempOutputPath = `/tmp/vibe-export-${name}-${Date.now()}.sql`;

      let result;
      if (type === 'schema') {
        result = await dbManager.exportSchema(tempOutputPath, { dryRun: true });
      } else if (type === 'data') {
        result = await dbManager.exportData(tempOutputPath, { dryRun: true });
      } else {
        result = await dbManager.exportFull(tempOutputPath, { dryRun: true });
      }

      res.json(result);
    } catch (error) {
      console.error('Error performing dry-run export:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Database dry-run import endpoint
  app.post('/api/worktrees/:name/database/dry-run-import', upload.single('file'), async (req, res) => {
    const { name } = req.params;

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

      const ports = manager.portRegistry.getWorktreePorts(name);
      const dbPort = manager._findDatabasePort(ports);

      if (!dbPort) {
        return res.status(400).json({ error: 'No database service found for this worktree' });
      }

      const dbConfig = {
        host: 'localhost',
        port: dbPort,
        database: 'vibe',
        user: 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      };

      const dbManager = new DatabaseManager(dbConfig);
      const result = await dbManager.importWithTransaction(req.file.path, { dryRun: true });

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      res.json(result);
    } catch (error) {
      console.error('Error performing dry-run import:', error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Database export endpoint
  app.post('/api/worktrees/:name/database/export', async (req, res) => {
    const { name } = req.params;
    const { type = 'full', format = 'sql' } = req.body;

    try {
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

      const ports = manager.portRegistry.getWorktreePorts(name);
      const dbPort = manager._findDatabasePort(ports);

      if (!dbPort) {
        return res.status(400).json({ error: 'No database service found for this worktree' });
      }

      const dbConfig = {
        host: 'localhost',
        port: dbPort,
        database: 'vibe',
        user: 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      };

      const dbManager = new DatabaseManager(dbConfig);
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = `${name}-${type}-${timestamp}.sql`;
      const outputPath = join(homedir(), '.vibetrees', 'exports', filename);

      // Ensure export directory exists
      const exportDir = dirname(outputPath);
      if (!existsSync(exportDir)) {
        mkdirSync(exportDir, { recursive: true });
      }

      let result;
      if (type === 'schema') {
        result = await dbManager.exportSchema(outputPath);
      } else if (type === 'data') {
        result = await dbManager.exportData(outputPath);
      } else {
        result = await dbManager.exportFull(outputPath);
      }

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.download(outputPath, filename, (err) => {
        // Clean up temp file after download
        if (existsSync(outputPath)) {
          try {
            execSync(`rm -f "${outputPath}"`);
          } catch (cleanupError) {
            console.error('Error cleaning up export file:', cleanupError);
          }
        }
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Database import endpoint
  app.post('/api/worktrees/:name/database/import', upload.single('file'), async (req, res) => {
    const { name } = req.params;
    const { validate = 'true', mode = 'replace' } = req.body;

    try {
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const ports = manager.portRegistry.getWorktreePorts(name);
      const dbPort = manager._findDatabasePort(ports);

      if (!dbPort) {
        return res.status(400).json({ error: 'No database service found for this worktree' });
      }

      const dbConfig = {
        host: 'localhost',
        port: dbPort,
        database: 'vibe',
        user: 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      };

      // Validate schema compatibility if requested
      if (validate === 'true') {
        const validator = new DatabaseValidator(dbConfig);
        // TODO: Parse SQL file to extract schema
        // const importSchema = parseSQLSchema(req.file.path);
        // const validation = await validator.validateCompatibility(importSchema);
        // if (!validation.compatible) {
        //   return res.status(400).json({ error: 'Incompatible schema', issues: validation.issues });
        // }
      }

      const dbManager = new DatabaseManager(dbConfig);
      const result = await dbManager.importWithTransaction(req.file.path);

      // Clean up uploaded file
      if (existsSync(req.file.path)) {
        try {
          execSync(`rm -f "${req.file.path}"`);
        } catch (cleanupError) {
          console.error('Error cleaning up upload file:', cleanupError);
        }
      }

      if (!result.success) {
        return res.status(500).json({
          error: result.error,
          rollback: result.rollback
        });
      }

      res.json({ success: true, message: 'Import complete' });
    } catch (error) {
      console.error('Database import error:', error);
      // Clean up uploaded file on error
      if (req.file && existsSync(req.file.path)) {
        try {
          execSync(`rm -f "${req.file.path}"`);
        } catch (cleanupError) {
          console.error('Error cleaning up upload file:', cleanupError);
        }
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Database schema endpoint
  app.get('/api/worktrees/:name/database/schema', async (req, res) => {
    const { name } = req.params;

    try {
      const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

      const ports = manager.portRegistry.getWorktreePorts(name);
      const dbPort = manager._findDatabasePort(ports);

      if (!dbPort) {
        return res.status(400).json({ error: 'No database service found for this worktree' });
      }

      const dbConfig = {
        host: 'localhost',
        port: dbPort,
        database: 'vibe',
        user: 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      };

      const validator = new DatabaseValidator(dbConfig);
      const tables = await validator.getTables();

      const schema = {};
      for (const table of tables) {
        schema[table] = await validator.getTableSchema(table);
      }

      res.json({ tables, schema });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/worktrees/:name/services/start', async (req, res) => {
    const result = await manager.startServices(req.params.name);
    res.json(result);
  });

  app.post('/api/worktrees/:name/services/stop', async (req, res) => {
    const result = await manager.stopServices(req.params.name);
    res.json(result);
  });

  app.post('/api/worktrees/:name/dependencies/install', async (req, res) => {
    const { name } = req.params;
    const worktree = getWorktreeOrError(name, res);
      if (!worktree) return;

    const result = await manager.installDependencies(name, worktree.path);
    res.json(result);
  });

  app.post('/api/worktrees/:name/services/restart', async (req, res) => {
    const stopResult = await manager.stopServices(req.params.name);
    if (!stopResult.success) {
      res.json(stopResult);
      return;
    }
    const startResult = await manager.startServices(req.params.name);
    res.json(startResult);
  });

  app.post('/api/worktrees/:name/services/:service/restart', async (req, res) => {
    const { name, service } = req.params;
    const worktree = getWorktreeOrError(name, res);

    if (!worktree) {
      res.json({ success: false, error: 'Worktree not found' });
      return;
    }

    try {

      // All services managed by docker compose
      runtime.execCompose(`restart ${service}`, {
        cwd: worktree.path,
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      res.json({ success: true });
    } catch (error) {
      console.error(`Failed to restart service ${service}:`, error.message);
      res.json({ success: false, error: error.message });
    }
  });

  app.post('/api/worktrees/:name/services/:service/rebuild', async (req, res) => {
    const { name, service } = req.params;
    const worktree = getWorktreeOrError(name, res);

    if (!worktree) {
      res.json({ success: false, error: 'Worktree not found' });
      return;
    }

    try {

      // All services managed by docker compose
      runtime.execCompose(`stop ${service}`, {
        cwd: worktree.path,
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      // Rebuild and start
      runtime.execCompose(`up -d --build ${service}`, {
        cwd: worktree.path,
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      res.json({ success: true });
    } catch (error) {
      console.error(`Failed to rebuild service ${service}:`, error.message);
      res.json({ success: false, error: error.message });
    }
  });

  // Kill Terminal API Route
  app.post('/api/kill-terminal', async (req, res) => {
    const { worktreeName, command } = req.body;

    if (!worktreeName || !command) {
      res.json({ success: false, error: 'worktreeName and command are required' });
      return;
    }

    try {
      let sessionId = null;
      for (const [sid, session] of manager.ptyManager._sessions) {
        if (session.worktreeName === worktreeName && session.agent === command) {
          sessionId = sid;
          break;
        }
      }

      if (!sessionId) {
        res.json({ success: false, error: 'Terminal not found' });
        return;
      }

      // Destroy the session
      await manager.ptyManager.destroySession(sessionId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error killing terminal:', error.message);
      res.json({ success: false, error: error.message });
    }
  });

  // Agent API Routes
  app.get('/api/agents', async (req, res) => {
    try {
      const agents = await agentRegistry.getAll();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/agents/:name', async (req, res) => {
    try {
      const { name } = req.params;

      if (!agentRegistry.has(name)) {
        res.status(404).json({ error: `Agent not found: ${name}` });
        return;
      }

      const metadata = await agentRegistry.getMetadata(name);
      res.json(metadata);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/agents/availability', async (req, res) => {
    try {
      const availability = await agentRegistry.checkAvailability();
      res.json(availability);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/worktrees/:name/agent - Switch agent for a worktree
  app.put('/api/worktrees/:name/agent', async (req, res) => {
    try {
      const { name } = req.params;
      const { agent } = req.body;

      if (!agent) {
        return res.status(400).json({ error: 'Agent name is required' });
      }

      // Validate agent exists and is available
      if (!agentRegistry.has(agent)) {
        return res.status(400).json({ error: `Agent "${agent}" not found` });
      }

      const agentMetadata = await agentRegistry.getMetadata(agent);
      if (!agentMetadata.installed && agent !== 'shell') {
        return res.status(400).json({ error: `Agent "${agent}" is not installed` });
      }

      // Kill existing PTY sessions for this worktree
      const sessionsToKill = [];
      for (const [sessionId, session] of ptyManager.sessions.entries()) {
        if (session.worktreeName === name) {
          sessionsToKill.push(sessionId);
        }
      }

      for (const sessionId of sessionsToKill) {
        const session = ptyManager.sessions.get(sessionId);
        if (session && session.pty) {
          session.pty.kill();
        }
        ptyManager.sessions.delete(sessionId);
      }

      // Store agent preference in worktree config
      // This will be picked up when new PTY spawns
      const worktree = getWorktreeOrError(name, res);
      if (worktree) {
        worktree.agent = agent;

        // TODO: Persist to config file via config manager
      }

      res.json({ success: true, agent, killedSessions: sessionsToKill.length });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Worktree discovery and import endpoints
  app.get('/api/worktrees/discover', async (req, res) => {
    try {
      const unmanaged = manager.discoverUnmanagedWorktrees();
      res.json(unmanaged);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/worktrees/import', async (req, res) => {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Worktree name required' });
      }

      const result = await manager.importWorktree(name);
      res.json(result);

      // Broadcast update to all clients
      manager.broadcast('worktree:imported', result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Diagnostic endpoints
  app.get('/api/diagnostics', async (req, res) => {
    try {
      const report = await manager.runDiagnostics();
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/diagnostics/:worktreeName', async (req, res) => {
    try {
      const { worktreeName } = req.params;
      const report = await manager.runDiagnostics(worktreeName);
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/diagnostics/fix/:fixType', async (req, res) => {
    try {
      const { fixType } = req.params;
      const context = req.body || {};

      const result = await manager.autoFixIssue(fixType, context);
      res.json(result);

      // Broadcast update to all clients if fix was successful
      if (result.success) {
        manager.broadcast('diagnostics:fixed', { fixType, result });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Performance metrics endpoint
  app.get('/api/performance/metrics', (req, res) => {
    try {
      const report = manager.profiler.generateReport();

      res.json({
        operations: report.operations,
        totalTime: report.totalDuration,
        avgWorktreeCreation: report.operations.find(op => op.name === 'create-worktree-total')?.avg || null
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return { server, manager };
}

/**
 * Background initialization of heavy operations
 * Runs after server is listening to make startup feel instant
 */
async function initializeInBackground(manager) {
  const initManager = manager.initializationManager;

  // Listen to initialization events for logging
  initManager.on('task:started', ({ id, description }) => {
    console.log(`🔄 ${description}...`);
  });

  initManager.on('task:completed', ({ id, description, duration }) => {
    console.log(`✓ ${description} (${duration}ms)`);
  });

  initManager.on('task:failed', ({ id, description, error }) => {
    console.error(`✗ ${description}: ${error}`);
  });

  initManager.on('initialized', ({ totalTime, successfulTasks, failedTasks }) => {
    console.log('\n✅ Background initialization complete!');
    console.log(`   Total time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`   Successful: ${successfulTasks}, Failed: ${failedTasks}\n`);

    // Notify all connected clients that initialization is complete
    const status = initManager.getStatus();
    manager.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'initialization:complete',
          status
        }));
      }
    });
  });

  // Execute tasks in parallel where possible
  await Promise.all([
    // Task 1: Sync GitHub branches
    initManager.executeTask(
      'github-sync',
      'Syncing GitHub branches',
      async (updateProgress) => {
        updateProgress(10, 'Fetching worktree list');
        const worktrees = manager.listWorktrees();

        updateProgress(20, 'Checking remote branches');
        let pushedCount = 0;
        const totalWorktrees = worktrees.filter(w => w.branch !== 'main').length;

        // Process worktrees in parallel for speed
        await Promise.all(worktrees.map(async (worktree, index) => {
          if (worktree.branch === 'main') return;

          try {
            const remoteBranches = execSync('git branch -r', {
              cwd: worktree.path,
              encoding: 'utf-8'
            });

            const remoteBranchExists = remoteBranches.includes(`origin/${worktree.branch}`);
            if (!remoteBranchExists) {
              updateProgress(
                20 + (60 * (index + 1) / totalWorktrees),
                `Pushing ${worktree.name} to GitHub`
              );

              // Push branch to GitHub
              execSync(`git push -u origin "${worktree.branch}"`, {
                cwd: worktree.path,
                stdio: 'pipe'
              });
              pushedCount++;
            }
          } catch (error) {
            console.warn(`Failed to sync ${worktree.name}: ${error.message}`);
          }
        }));

        updateProgress(90, 'Finalizing sync');
        return { pushedCount, totalWorktrees };
      },
      5000 // Estimated 5 seconds
    ),

    // Task 2: Auto-start containers - DISABLED FOR SAFETY
    // REASON: Automatically restarting stopped containers interferes with user intent.
    // Users may have intentionally stopped containers for debugging, resource management,
    // or to avoid conflicts. Auto-restarting them on server startup is destructive behavior.
    //
    // If auto-start is needed in the future, it should be:
    // 1. Opt-in via config flag (e.g., AUTO_START_CONTAINERS=true)
    // 2. Only start containers that have never been started (not ones user stopped)
    // 3. Show clear notification when it happens
    //
    // For now, containers remain in whatever state the user left them.
    /*
    initManager.executeTask(
      'container-startup',
      'Starting Docker containers',
      async (updateProgress) => {
        updateProgress(10, 'Scanning worktrees');
        const worktrees = manager.listWorktrees();

        // Identify worktrees that need container startup
        const worktreesToStart = worktrees.filter(worktree => {
          const servicesRunning = worktree.dockerStatus.filter(s => s.state === 'running').length;
          const servicesTotal = worktree.dockerStatus.length;
          const hasServices = Object.keys(worktree.ports).length > 0;
          return hasServices && servicesRunning < servicesTotal;
        });

        if (worktreesToStart.length === 0) {
          updateProgress(100, 'No containers to start');
          return { started: 0, total: worktrees.length };
        }

        updateProgress(20, `Starting containers for ${worktreesToStart.length} worktrees`);

        const results = await Promise.all(
          worktreesToStart.map(async (worktree, index) => {
            try {
              updateProgress(
                20 + (70 * (index + 1) / worktreesToStart.length),
                `Starting ${worktree.name}`
              );

              const result = await manager.startServices(worktree.name);
              return { worktree: worktree.name, success: result.success, error: result.error };
            } catch (error) {
              return { worktree: worktree.name, success: false, error: error.message };
            }
          })
        );

        updateProgress(95, 'Finalizing container startup');

        const successCount = results.filter(r => r.success).length;
        return { started: successCount, total: worktreesToStart.length, results };
      },
      10000 // Estimated 10 seconds
    ),
    */

    // Task 3: Warm up caches
    initManager.executeTask(
      'cache-warmup',
      'Warming up caches',
      async (updateProgress) => {
        updateProgress(20, 'Loading dependency caches');

        // Pre-load common dependency caches
        try {
          await manager.cacheManager.warmup();
          updateProgress(60, 'Caches loaded');
        } catch (error) {
          updateProgress(60, 'Cache warmup skipped');
        }

        updateProgress(100, 'Ready');
        return { warmed: true };
      },
      2000 // Estimated 2 seconds
    )
  ]);

  // Additional sequential tasks that depend on above
  await initManager.executeTask(
    'final-setup',
    'Finalizing setup',
    async (updateProgress) => {
      updateProgress(50, 'Broadcasting status');

      manager.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'worktrees:updated',
            worktrees: manager.listWorktrees()
          }));
        }
      });

      updateProgress(100, 'Complete');
      return { complete: true };
    },
    1000
  );
}

/**
 * Check all worktrees and create missing GitHub branches on startup
 */
async function syncGitHubBranches(manager) {
  console.log('🔍 Checking for missing GitHub branches...\n');

  const worktrees = manager.listWorktrees();
  let pushedCount = 0;

  for (const worktree of worktrees) {
    // Skip main branch (always exists remotely)
    if (worktree.branch === 'main') {
      continue;
    }

    try {
      const remoteBranches = execSync('git branch -r', {
        cwd: worktree.path,
        encoding: 'utf-8'
      });

      const remoteBranchExists = remoteBranches.includes(`origin/${worktree.branch}`);

      if (!remoteBranchExists) {
        console.log(`📤 ${worktree.name}: Pushing missing branch to GitHub...`);

        // Push branch to GitHub
        execSync(`git push -u origin "${worktree.branch}"`, {
          cwd: worktree.path,
          stdio: 'pipe'
        });

        console.log(`✓ ${worktree.name}: Branch pushed to GitHub`);
        pushedCount++;
      } else {
        console.log(`✓ ${worktree.name}: Branch exists on GitHub`);
      }
    } catch (error) {
      console.warn(`⚠ ${worktree.name}: Failed to push branch: ${error.message}`);
      // Continue with other worktrees even if one fails
    }
  }

  if (pushedCount > 0) {
    console.log(`\n✓ Pushed ${pushedCount} missing branch(es) to GitHub\n`);
  } else {
    console.log('\n✓ All branches synced with GitHub\n');
  }
}

/**
 * Auto-start containers for all worktrees on server startup
 */
async function autoStartContainers(manager) {
  const worktrees = manager.listWorktrees();

  for (const worktree of worktrees) {
    const servicesRunning = worktree.dockerStatus.filter(s => s.state === 'running').length;
    const servicesTotal = worktree.dockerStatus.length;

    // Skip if all services are running
    if (servicesRunning === servicesTotal && servicesTotal > 0) {
      console.log(`✓ ${worktree.name}: All services already running (${servicesRunning}/${servicesTotal})`);
      continue;
    }

    // Skip if no services have been configured (no ports allocated)
    if (Object.keys(worktree.ports).length === 0) {
      console.log(`⊘ ${worktree.name}: No services configured (skipping)`);
      continue;
    }

    // Try to start services
    console.log(`🔄 ${worktree.name}: Starting services (${servicesRunning}/${servicesTotal} running)...`);

    try {
      const result = await manager.startServices(worktree.name);

      if (result.success) {
        console.log(`✓ ${worktree.name}: Services started successfully`);
      } else {
        // Check if this is just a "no compose file" situation (not an error)
        if (result.error.includes('no configuration file provided')) {
          continue;
        }

        console.error(`✗ ${worktree.name}: Failed to start services`);
        console.error(`  Reason: ${result.error}`);

        // Provide diagnostics based on error message
        if (result.error.includes('has neither an image nor a build context')) {
          console.error(`  💡 Diagnosis: Invalid docker-compose.override.yml detected`);
          console.error(`     This is likely a leftover from the old service selection system`);
          console.error(`     Deleting: ${worktree.path}/docker-compose.override.yml`);

          // Try to delete the override file and retry
          try {
            const overridePath = join(worktree.path, 'docker-compose.override.yml');
            if (existsSync(overridePath)) {
              execSync(`rm "${overridePath}"`, { stdio: 'pipe' });
              console.error(`     ✓ Deleted override file, retrying...`);

              // Retry starting services
              const retryResult = await manager.startServices(worktree.name);
              if (retryResult.success) {
                console.log(`✓ ${worktree.name}: Services started successfully after cleanup`);
              } else {
                console.error(`✗ ${worktree.name}: Still failed after cleanup: ${retryResult.error}`);
              }
            }
          } catch (cleanupError) {
            console.error(`     ✗ Failed to delete override file: ${cleanupError.message}`);
          }
        } else if (result.error.includes('address already in use')) {
          console.error(`  💡 Diagnosis: Port conflict detected`);
          console.error(`     Another service is using one of the allocated ports`);
          console.error(`     Ports: ${JSON.stringify(worktree.ports)}`);
        } else if (result.error.includes('Cannot connect to the Docker daemon')) {
          console.error(`  💡 Diagnosis: Docker daemon not running`);
          console.error(`     Run: sudo systemctl start docker (Linux)`);
          console.error(`     Or start Docker Desktop (Mac/Windows)`);
        } else if (result.error.includes('permission denied')) {
          console.error(`  💡 Diagnosis: Permission issue`);
          console.error(`     Ensure your user is in the docker group`);
          console.error(`     Or use sudo to run this script`);
        } else if (result.error.includes('network') || result.error.includes('driver')) {
          console.error(`  💡 Diagnosis: Docker network issue`);
          console.error(`     Try: sudo docker network prune`);
        } else if (result.error.includes('volume')) {
          console.error(`  💡 Diagnosis: Docker volume issue`);
          console.error(`     The database volume may be corrupted or missing`);
          console.error(`     Volume name should be: ${worktree.name}_postgres_data`);
        } else {
          console.error(`  💡 Check docker-compose.yml in: ${worktree.path}`);
        }
        console.error('');
      }
    } catch (error) {
      console.error(`✗ ${worktree.name}: Exception occurred`);
      console.error(`  Error: ${error.message}`);
      console.error('');
    }
  }

  console.log(''); // Extra newline for readability
}

/**
 * Start server
 */
async function startServer() {
  try {
    console.log(`🔍 Finding available port...`);
    const PORT = await findAvailablePort(PORT_RANGE_START, PORT_RANGE_END, HOST);
    console.log(`✓ Port ${PORT} is available\n`);

    const { server, manager } = createApp();

    server.on('error', (error) => {
      console.error('\n❌ Server error:', error.message);
      process.exit(1);
    });

    server.listen(PORT, HOST, async () => {
      const os = await import('os');
      const getNetworkAddresses = () => {
        const interfaces = os.networkInterfaces();
        const addresses = [];

        for (const [name, nets] of Object.entries(interfaces)) {
          for (const net of nets) {
            // Skip internal and non-IPv4 addresses
            if (!net.internal && net.family === 'IPv4') {
              addresses.push({ name, address: net.address });
            }
          }
        }

        return addresses;
      };

      const wizard = new FirstRunWizard();
      if (wizard.isFirstRun()) {
        console.log('\n' + '='.repeat(60));
        console.log('🎉 Welcome to VibeTrees!');
        console.log('='.repeat(60));
        console.log('\nThis appears to be your first time running VibeTrees.');
        console.log('\nDefault configuration:');
        console.log('  • Repository root: Current directory');
        console.log('  • AI agent: Claude Code');
        console.log('  • Container runtime: Docker');
        console.log('  • Network interface: localhost only\n');
        console.log('You can change these settings later in ~/.vibetrees/config.json');
        console.log('='.repeat(60) + '\n');

        // Save default config
        const defaultConfig = {
          repositoryRoot: process.cwd(),
          aiAgent: 'claude',
          containerRuntime: 'docker',
          defaultNetworkInterface: 'localhost',
          initialized: true
        };
        wizard.saveConfig(defaultConfig);
      }

      console.log(`\n🚀 Worktree Manager is running!\n`);

      if (HOST === '0.0.0.0') {
        console.log(`   📡 Network Mode: ALL interfaces\n`);

        // Setup firewall for network mode
        const firewall = new FirewallHelper();
        await firewall.setupForNetworkMode(PORT);

        const addresses = getNetworkAddresses();
        if (addresses.length > 0) {
          addresses.forEach(({ name, address }) => {
            console.log(`      🌐 http://${address}:${PORT}`);
          });
        } else {
          console.log(`      🌐 http://<your-ip>:${PORT}`);
        }
      } else {
        console.log(`   🔒 Local Mode: Localhost only\n`);
        console.log(`      🏠 http://localhost:${PORT}`);
        console.log(`\n   💡 Use --listen to allow network access`);
      }

      console.log('');

      // Auto-open browser immediately
      const url = `http://localhost:${PORT}`;
      const start = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open';

      try {
        execSync(`${start} ${url}`, { stdio: 'ignore' });
      } catch (err) {
        console.log('Could not auto-open browser. Please visit the URL manually.');
      }

      console.log('🔄 Starting background initialization...\n');
      initializeInBackground(manager);
    });
  } catch (error) {
    console.error('\n❌ Failed to start server:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('\n❌ Uncaught exception:', error);
  console.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start
startServer();
