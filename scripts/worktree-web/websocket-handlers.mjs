/**
 * WebSocket Handlers
 *
 * Handles WebSocket connections for:
 * - Service logs (single service)
 * - Combined logs (all services)
 * - Terminal sessions (PTY)
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

/**
 * Format a log line with ANSI colors based on log level
 * @param {string} line - Raw log line
 * @param {string} serviceName - Name of the service
 * @returns {string} Formatted log line with ANSI escape codes
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
 * Handle logs WebSocket connection for a single service
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} worktreeName - Name of the worktree
 * @param {string} serviceName - Name of the Docker service
 * @param {Object} manager - WorktreeManager instance
 */
export function handleLogsConnection(ws, worktreeName, serviceName, manager) {
  const runtime = manager.runtime;

  const worktrees = manager.listWorktrees();
  const worktree = worktrees.find(w => w.name === worktreeName);

  if (!worktree) {
    console.error(`[WebSocket] Logs connection failed: worktree "${worktreeName}" not found`);
    console.error(`[WebSocket] Available worktrees:`, worktrees.map(w => w.name));
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
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} worktreeName - Name of the worktree
 * @param {Object} manager - WorktreeManager instance
 */
export function handleCombinedLogsConnection(ws, worktreeName, manager) {
  const runtime = manager.runtime;

  const worktrees = manager.listWorktrees();
  const worktree = worktrees.find(w => w.name === worktreeName);

  if (!worktree) {
    console.error(`[WebSocket] Combined logs connection failed: worktree "${worktreeName}" not found`);
    console.error(`[WebSocket] Available worktrees:`, worktrees.map(w => w.name));
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
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          const serviceMatch = line.match(/^([\w-]+)-\d+\s+\|\s+/);
          const serviceName = serviceMatch ? serviceMatch[1] : 'unknown';
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
    console.error(`\x1b[31mCombined logs process error: ${error.message}\x1b[0m`);
    if (ws.readyState === 1) {
      ws.send(`\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    }
  });

  ws.on('close', () => {
    logsProcess.kill();
  });

  ws.send(`\x1b[1;36m╔═══ Combined Logs (${worktreeName}) ═══╗\x1b[0m\r\n\r\n`);
}

/**
 * Handle terminal WebSocket connection (PTY session)
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} worktreeName - Name of the worktree
 * @param {string} command - Command/agent to run (shell, claude, codex)
 * @param {Object} manager - WorktreeManager instance
 * @param {boolean} enableProfiling - Whether profiling is enabled
 */
export function handleTerminalConnection(ws, worktreeName, command, manager, enableProfiling = false) {
  const worktrees = manager.listWorktrees();
  const worktree = worktrees.find(w => w.name === worktreeName);

  if (!worktree) {
    console.error(`[WebSocket] Terminal connection failed: worktree "${worktreeName}" not found`);
    console.error(`[WebSocket] Available worktrees:`, worktrees.map(w => w.name));
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
      // Claude Code with update and session UUID
      // Prefer native binary, fall back to npx if not found
      const sessionUUID = randomUUID();
      const nativePath = join(homedir(), '.local', 'bin', 'claude');
      const hasNative = existsSync(nativePath);

      commandStr = '/bin/bash';
      if (hasNative) {
        // Use native claude with update command
        args = ['-c', `echo "Updating Claude Code..." && ${nativePath} update 2>/dev/null || echo "Update skipped" && echo "" && echo "🔑 Session ID: ${sessionUUID}" && echo "" && ${nativePath} --dangerously-skip-permissions`];
      } else {
        // Fall back to npx
        args = ['-c', `echo "Updating Claude Code..." && npx -y @anthropic-ai/claude-code@latest update 2>/dev/null || echo "Update skipped" && echo "" && echo "🔑 Session ID: ${sessionUUID}" && echo "" && npx -y @anthropic-ai/claude-code@latest --dangerously-skip-permissions`];
      }
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
          // Only resume if client hasn't paused it
          if (!clientPaused) {
            terminal.resume();
            try {
              ws.send(JSON.stringify({ type: 'status', message: '', paused: false }));
            } catch (e) {}
          }
        }, BACKPRESSURE_TIMEOUT);

        // Use 'drain' event instead of polling
        const drainHandler = () => {
          if (ws.bufferedAmount < BACKPRESSURE_THRESHOLD / 2) {
            clearTimeout(drainTimeout);
            ws.off('drain', drainHandler);
            draining = false;
            isPaused = false;
            // Only resume if client hasn't paused it
            if (!clientPaused) {
              terminal.resume();
              try {
                ws.send(JSON.stringify({ type: 'status', message: '', paused: false }));
              } catch (e) {}
            }
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
    } else {
      // DEBUG: Log when input is being dropped due to pause
      console.log(`[PTY Input Blocked] ${worktreeName} - isPaused: ${isPaused}, clientPaused: ${clientPaused}, input length: ${dataStr.length}`);
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
    profiling: enableProfiling
  }));

  if (isTakeover) {
    ws.send(`\r\n\x1b[33mConnected to ${sessionName} session (ID: ${sessionId.slice(0, 8)}) - took over from previous client\x1b[0m\r\n`);
  } else {
    ws.send(`\r\n\x1b[32mConnected to ${sessionName} session (ID: ${sessionId.slice(0, 8)})\x1b[0m\r\n`);
  }
}
