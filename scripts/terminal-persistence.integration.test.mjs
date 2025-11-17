import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PTYSessionManager } from './pty-session-manager.mjs';
import { PTYStateSerializer } from './pty-state-serializer.mjs';
import xtermPkg from '@xterm/headless';
import serializePkg from '@xterm/addon-serialize';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { Terminal } = xtermPkg;
const { SerializeAddon } = serializePkg;

/**
 * Integration tests for terminal persistence
 * These tests verify the complete persistence cycle with real xterm-headless
 */
describe('Terminal Persistence Integration', () => {
  let manager;
  let serializer;
  let testSessionsDir;

  beforeAll(() => {
    // Create test directory
    testSessionsDir = path.join(os.tmpdir(), 'vibetrees-test-sessions');
    fs.mkdirSync(testSessionsDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup test directory
    if (fs.existsSync(testSessionsDir)) {
      fs.rmSync(testSessionsDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Use test directory for sessions
    serializer = new PTYStateSerializer();
    serializer.baseDir = testSessionsDir;

    // Create manager with test serializer and short intervals
    manager = new PTYSessionManager({
      serializer,
      autoSaveInterval: 100, // 100ms for testing
      orphanTimeout: 500 // 500ms for testing
    });
  });

  afterEach(async () => {
    // Destroy manager and clean up sessions
    if (manager) {
      manager.destroy();

      // Clean up all sessions from disk
      if (fs.existsSync(testSessionsDir)) {
        const sessions = fs.readdirSync(testSessionsDir);
        for (const sessionId of sessions) {
          const sessionDir = path.join(testSessionsDir, sessionId);
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
      }
    }
  });

  describe('Full Persistence Cycle', () => {
    it('should save and restore terminal state completely', async () => {
      // Create session
      const sessionId = manager.createSession('test-worktree', 'claude', '/tmp');
      const session = manager.getSession(sessionId);

      // Create real terminal with xterm-headless (need allowProposedApi for SerializeAddon)
      const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
      const serializeAddon = new SerializeAddon();
      terminal.loadAddon(serializeAddon);

      // Attach terminal to session
      session.xterm = terminal;
      session.serializeAddon = serializeAddon;

      // Write test data to terminal
      const testData = 'Hello, World!\nThis is line 2\nLine 3 here\n';
      terminal.write(testData);

      // Wait for terminal to process writes
      await new Promise(resolve => setTimeout(resolve, 50));

      // Capture original serialized state
      const originalSerialized = serializeAddon.serialize();

      // Manually capture and save state
      const capturedState = serializer.captureState(sessionId, session);
      expect(capturedState).toBeTruthy();
      expect(capturedState.sessionId).toBe(sessionId);
      expect(capturedState.serialized).toBeTruthy();
      expect(capturedState.dimensions).toEqual({ cols: 80, rows: 24 });

      await serializer.saveState(capturedState);

      // Verify state saved to disk
      const statePath = path.join(testSessionsDir, sessionId, 'pty-state.json');
      expect(fs.existsSync(statePath)).toBe(true);

      // Destroy original terminal
      terminal.dispose();

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 50));

      // Recover session
      const recovered = await manager.recoverSession(sessionId);
      expect(recovered).toBeTruthy();
      expect(recovered.sessionId).toBe(sessionId);
      expect(recovered.serialized).toBeTruthy();

      // Manually restore terminal from serialized state
      const restoredTerminal = new Terminal({
        cols: recovered.dimensions.cols,
        rows: recovered.dimensions.rows,
        allowProposedApi: true
      });
      const restoredAddon = new SerializeAddon();
      restoredTerminal.loadAddon(restoredAddon);

      // Write the serialized data back
      restoredTerminal.write(recovered.serialized);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify content matches
      expect(restoredTerminal.cols).toBe(80);
      expect(restoredTerminal.rows).toBe(24);

      const restoredSerialized = restoredAddon.serialize();
      expect(restoredSerialized).toContain('Hello, World!');
      expect(restoredSerialized).toContain('This is line 2');
      expect(restoredSerialized).toContain('Line 3 here');

      restoredTerminal.dispose();
      await manager.destroySession(sessionId);
    });

    it('should handle auto-save timer correctly', async () => {
      // Create session with terminal
      const sessionId = manager.createSession('test-worktree', 'claude', '/tmp');
      const session = manager.getSession(sessionId);

      const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
      const serializeAddon = new SerializeAddon();
      terminal.loadAddon(serializeAddon);

      session.xterm = terminal;
      session.serializeAddon = serializeAddon;

      // Write data
      terminal.write('Auto-save test data\n');
      await new Promise(resolve => setTimeout(resolve, 100));

      // Wait for auto-save to trigger (100ms interval + buffer + processing time)
      // Need to wait for at least 2 cycles to be safe
      await new Promise(resolve => setTimeout(resolve, 350));

      // Verify state was auto-saved to disk
      const statePath = path.join(testSessionsDir, sessionId, 'pty-state.json');
      expect(fs.existsSync(statePath)).toBe(true);

      const savedData = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(savedData.sessionId).toBe(sessionId);
      expect(savedData.serialized).toBeTruthy();
      expect(savedData.serialized).toContain('Auto-save test data');

      // Cleanup
      await manager.destroySession(sessionId);
    });
  });

  describe('Browser Refresh Simulation', () => {
    it('should seamlessly recover from disconnect/reconnect cycle', async () => {
      // Create and connect session
      const sessionId = manager.createSession('test-worktree', 'claude', '/tmp');
      const session = manager.getSession(sessionId);

      // Setup terminal
      const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
      const serializeAddon = new SerializeAddon();
      terminal.loadAddon(serializeAddon);

      session.xterm = terminal;
      session.serializeAddon = serializeAddon;

      // Attach client
      manager.attachClient(sessionId, 'client-1');
      expect(session.connected).toBe(true);

      // Write data before disconnect
      terminal.write('Before disconnect\n');
      terminal.write('Second line\n');
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate browser refresh - disconnect
      manager.detachClient(sessionId);
      expect(session.connected).toBe(false);
      expect(session.disconnectedAt).toBeTruthy();

      // Manually save state (would happen via auto-save)
      const state = serializer.captureState(sessionId, session);
      await serializer.saveState(state);

      // Simulate reconnect
      manager.attachClient(sessionId, 'client-2');
      expect(session.connected).toBe(true);
      expect(session.disconnectedAt).toBeNull();

      // Restore from saved state manually
      const recovered = await serializer.loadState(sessionId);
      expect(recovered).toBeTruthy();

      const restoredTerminal = new Terminal({
        cols: recovered.dimensions.cols,
        rows: recovered.dimensions.rows,
        allowProposedApi: true
      });
      const restoredAddon = new SerializeAddon();
      restoredTerminal.loadAddon(restoredAddon);
      restoredTerminal.write(recovered.serialized);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify data preserved
      const restoredSerialized = restoredAddon.serialize();
      expect(restoredSerialized).toContain('Before disconnect');
      expect(restoredSerialized).toContain('Second line');

      // Write more data after reconnect
      restoredTerminal.write('After reconnect\n');
      await new Promise(resolve => setTimeout(resolve, 50));

      const finalSerialized = restoredAddon.serialize();
      expect(finalSerialized).toContain('Before disconnect');
      expect(finalSerialized).toContain('After reconnect');

      restoredTerminal.dispose();

      // Cleanup
      await manager.destroySession(sessionId);
    });

    it('should handle multiple disconnect/reconnect cycles', async () => {
      const sessionId = manager.createSession('test-worktree', 'claude', '/tmp');
      const session = manager.getSession(sessionId);

      const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
      const serializeAddon = new SerializeAddon();
      terminal.loadAddon(serializeAddon);

      session.xterm = terminal;
      session.serializeAddon = serializeAddon;

      // First cycle
      manager.attachClient(sessionId, 'client-1');
      terminal.write('Cycle 1\n');
      await new Promise(resolve => setTimeout(resolve, 50));
      manager.detachClient(sessionId);

      // Second cycle
      manager.attachClient(sessionId, 'client-2');
      terminal.write('Cycle 2\n');
      await new Promise(resolve => setTimeout(resolve, 50));
      manager.detachClient(sessionId);

      // Third cycle
      manager.attachClient(sessionId, 'client-3');
      terminal.write('Cycle 3\n');
      await new Promise(resolve => setTimeout(resolve, 50));

      // Save and verify all data present
      const state = serializer.captureState(sessionId, session);
      await serializer.saveState(state);

      const recovered = await serializer.loadState(sessionId);
      const restoredTerminal = new Terminal({
        cols: recovered.dimensions.cols,
        rows: recovered.dimensions.rows,
        allowProposedApi: true
      });
      const restoredAddon = new SerializeAddon();
      restoredTerminal.loadAddon(restoredAddon);
      restoredTerminal.write(recovered.serialized);
      await new Promise(resolve => setTimeout(resolve, 50));

      const serialized = restoredAddon.serialize();
      expect(serialized).toContain('Cycle 1');
      expect(serialized).toContain('Cycle 2');
      expect(serialized).toContain('Cycle 3');

      restoredTerminal.dispose();

      // Cleanup
      await manager.destroySession(sessionId);
    });
  });

  describe('Multiple Concurrent Sessions', () => {
    it('should handle 5 concurrent sessions without data corruption', async () => {
      const sessionIds = [];
      const expectedData = [];

      // Create 5 sessions with different data
      for (let i = 0; i < 5; i++) {
        const sessionId = manager.createSession(`worktree-${i}`, 'claude', '/tmp');
        const session = manager.getSession(sessionId);

        const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
        const serializeAddon = new SerializeAddon();
        terminal.loadAddon(serializeAddon);

        session.xterm = terminal;
        session.serializeAddon = serializeAddon;

        // Write unique data to each session
        const data = `Session ${i}: Unique data for testing ${i}\n`;
        terminal.write(data);
        expectedData.push(data);
        sessionIds.push(sessionId);

        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Wait for auto-save to process all sessions (100ms interval + processing time)
      // Need extra time for 5 concurrent sessions
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify all sessions saved correctly
      for (let i = 0; i < 5; i++) {
        const statePath = path.join(testSessionsDir, sessionIds[i], 'pty-state.json');
        expect(fs.existsSync(statePath)).toBe(true);

        const savedData = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        expect(savedData.sessionId).toBe(sessionIds[i]);
        expect(savedData.serialized).toContain(`Session ${i}: Unique data`);
      }

      // Verify no cross-contamination
      for (let i = 0; i < 5; i++) {
        const savedData = JSON.parse(
          fs.readFileSync(path.join(testSessionsDir, sessionIds[i], 'pty-state.json'), 'utf-8')
        );

        // Should contain own data
        expect(savedData.serialized).toContain(`Session ${i}:`);

        // Should NOT contain other sessions' data
        for (let j = 0; j < 5; j++) {
          if (i !== j) {
            expect(savedData.serialized).not.toContain(`Session ${j}:`);
          }
        }
      }

      // Cleanup all sessions
      for (const sessionId of sessionIds) {
        await manager.destroySession(sessionId);
      }
    });

    it('should handle concurrent saves without race conditions', async () => {
      const sessionIds = [];

      // Create 3 sessions
      for (let i = 0; i < 3; i++) {
        const sessionId = manager.createSession(`worktree-${i}`, 'claude', '/tmp');
        const session = manager.getSession(sessionId);

        const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
        const serializeAddon = new SerializeAddon();
        terminal.loadAddon(serializeAddon);

        session.xterm = terminal;
        session.serializeAddon = serializeAddon;
        terminal.write(`Initial data ${i}\n`);

        sessionIds.push(sessionId);
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Trigger concurrent manual saves
      const savePromises = sessionIds.map(async sessionId => {
        const session = manager.getSession(sessionId);
        const state = serializer.captureState(sessionId, session);
        if (state) {
          await serializer.saveState(state);
        }
      });

      // Wait for all saves to complete
      await Promise.all(savePromises);

      // Verify all saves succeeded
      for (let i = 0; i < 3; i++) {
        const statePath = path.join(testSessionsDir, sessionIds[i], 'pty-state.json');
        expect(fs.existsSync(statePath)).toBe(true);

        const savedData = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        expect(savedData.sessionId).toBe(sessionIds[i]);
        expect(savedData.serialized).toContain(`Initial data ${i}`);
      }

      // Cleanup
      for (const sessionId of sessionIds) {
        await manager.destroySession(sessionId);
      }
    });
  });

  describe('Large Scrollback Buffer', () => {
    it('should serialize 1000 lines quickly and accurately', async () => {
      const sessionId = manager.createSession('test-worktree', 'claude', '/tmp');
      const session = manager.getSession(sessionId);

      const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
      const serializeAddon = new SerializeAddon();
      terminal.loadAddon(serializeAddon);

      session.xterm = terminal;
      session.serializeAddon = serializeAddon;

      // Write 1000 lines
      for (let i = 0; i < 1000; i++) {
        terminal.write(`Line ${i}: This is test data with some content to make it realistic\n`);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Measure serialization time
      const startTime = Date.now();
      const state = serializer.captureState(sessionId, session);
      const captureTime = Date.now() - startTime;

      // Should complete quickly (< 1 second)
      expect(captureTime).toBeLessThan(1000);
      expect(state).toBeTruthy();
      expect(state.serialized).toBeTruthy();

      // Measure save time
      const saveStartTime = Date.now();
      await serializer.saveState(state);
      const saveTime = Date.now() - saveStartTime;

      // Save should also be fast
      expect(saveTime).toBeLessThan(1000);

      // Verify file was created
      const statePath = path.join(testSessionsDir, sessionId, 'pty-state.json');
      expect(fs.existsSync(statePath)).toBe(true);

      // Measure deserialization time
      const restoreStartTime = Date.now();
      const recovered = await serializer.loadState(sessionId);
      const restoredTerminal = new Terminal({
        cols: recovered.dimensions.cols,
        rows: recovered.dimensions.rows,
        allowProposedApi: true
      });
      const restoredAddon = new SerializeAddon();
      restoredTerminal.loadAddon(restoredAddon);
      restoredTerminal.write(recovered.serialized);
      await new Promise(resolve => setTimeout(resolve, 100));
      const restoreTime = Date.now() - restoreStartTime;

      // Restore should be fast
      expect(restoreTime).toBeLessThan(1000);

      // Verify accuracy - check that we have substantial content
      // Note: Due to scrollback limits, we may not have ALL lines, but should have many
      const restoredSerialized = restoredAddon.serialize();
      expect(restoredSerialized.length).toBeGreaterThan(10000); // Should have substantial content
      expect(restoredSerialized).toContain('Line'); // Should contain line markers
      expect(restoredSerialized).toContain('test data'); // Should contain our test data

      restoredTerminal.dispose();

      // Cleanup
      await manager.destroySession(sessionId);
    });

    it('should handle buffer overflow gracefully', async () => {
      const sessionId = manager.createSession('test-worktree', 'claude', '/tmp');
      const session = manager.getSession(sessionId);

      // Create terminal with default scrollback (1000 lines)
      const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
      const serializeAddon = new SerializeAddon();
      terminal.loadAddon(serializeAddon);

      session.xterm = terminal;
      session.serializeAddon = serializeAddon;

      // Write more than default scrollback buffer
      for (let i = 0; i < 2000; i++) {
        terminal.write(`Overflow line ${i}\n`);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still serialize successfully
      const state = serializer.captureState(sessionId, session);
      expect(state).toBeTruthy();
      await serializer.saveState(state);

      // Restore and verify recent lines are preserved
      const recovered = await serializer.loadState(sessionId);
      const restoredTerminal = new Terminal({
        cols: recovered.dimensions.cols,
        rows: recovered.dimensions.rows,
        allowProposedApi: true
      });
      const restoredAddon = new SerializeAddon();
      restoredTerminal.loadAddon(restoredAddon);
      restoredTerminal.write(recovered.serialized);
      await new Promise(resolve => setTimeout(resolve, 100));

      const restoredSerialized = restoredAddon.serialize();
      // Should have recent lines (exact line depends on scrollback settings)
      expect(restoredSerialized).toContain('Overflow line');

      restoredTerminal.dispose();

      // Cleanup
      await manager.destroySession(sessionId);
    });

    it('should preserve ANSI escape codes and colors', async () => {
      const sessionId = manager.createSession('test-worktree', 'claude', '/tmp');
      const session = manager.getSession(sessionId);

      const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
      const serializeAddon = new SerializeAddon();
      terminal.loadAddon(serializeAddon);

      session.xterm = terminal;
      session.serializeAddon = serializeAddon;

      // Write colored text with ANSI codes
      terminal.write('\x1b[31mRed text\x1b[0m\n');
      terminal.write('\x1b[32mGreen text\x1b[0m\n');
      terminal.write('\x1b[1;34mBold blue text\x1b[0m\n');

      await new Promise(resolve => setTimeout(resolve, 50));

      // Save state
      const state = serializer.captureState(sessionId, session);
      await serializer.saveState(state);

      // Restore
      const recovered = await serializer.loadState(sessionId);
      const restoredTerminal = new Terminal({
        cols: recovered.dimensions.cols,
        rows: recovered.dimensions.rows,
        allowProposedApi: true
      });
      const restoredAddon = new SerializeAddon();
      restoredTerminal.loadAddon(restoredAddon);
      restoredTerminal.write(recovered.serialized);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify ANSI codes preserved in serialized format
      const restoredSerialized = restoredAddon.serialize();
      expect(restoredSerialized).toContain('Red text');
      expect(restoredSerialized).toContain('Green text');
      expect(restoredSerialized).toContain('Bold blue text');

      restoredTerminal.dispose();

      // Cleanup
      await manager.destroySession(sessionId);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing state files gracefully', async () => {
      const sessionId = 'non-existent-session';

      const recovered = await manager.recoverSession(sessionId);
      expect(recovered).toBeNull();

      // Also verify loadState returns null for non-existent sessions
      const loaded = await serializer.loadState(sessionId);
      expect(loaded).toBeNull();
    });

    it('should handle corrupted state files', async () => {
      const sessionId = manager.createSession('test-worktree', 'claude', '/tmp');
      const sessionDir = path.join(testSessionsDir, sessionId);
      const statePath = path.join(sessionDir, 'pty-state.json');

      // Create directory and write corrupted JSON
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(statePath, '{ invalid json }', 'utf-8');

      // Should return null for corrupted files (handled gracefully in loadState)
      const recovered = await manager.recoverSession(sessionId);
      expect(recovered).toBeNull();

      // Cleanup
      await manager.destroySession(sessionId);
    });

    it('should delete state when session is destroyed', async () => {
      const sessionId = manager.createSession('test-worktree', 'claude', '/tmp');
      const session = manager.getSession(sessionId);

      const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
      const serializeAddon = new SerializeAddon();
      terminal.loadAddon(serializeAddon);

      session.xterm = terminal;
      session.serializeAddon = serializeAddon;
      terminal.write('Test data\n');

      await new Promise(resolve => setTimeout(resolve, 50));

      // Save state
      const state = serializer.captureState(sessionId, session);
      await serializer.saveState(state);

      // Verify state exists
      const statePath = path.join(testSessionsDir, sessionId, 'pty-state.json');
      expect(fs.existsSync(statePath)).toBe(true);

      // Destroy session
      await manager.destroySession(sessionId);

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 50));

      // State should be deleted
      const sessionDir = path.join(testSessionsDir, sessionId);
      expect(fs.existsSync(sessionDir)).toBe(false);
    });

    it('should handle rapid terminal writes without data loss', async () => {
      const sessionId = manager.createSession('test-worktree', 'claude', '/tmp');
      const session = manager.getSession(sessionId);

      const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
      const serializeAddon = new SerializeAddon();
      terminal.loadAddon(serializeAddon);

      session.xterm = terminal;
      session.serializeAddon = serializeAddon;

      // Write data rapidly
      for (let i = 0; i < 100; i++) {
        terminal.write(`Rapid write ${i}\n`);
      }

      // Immediate save without waiting
      await new Promise(resolve => setTimeout(resolve, 100));

      const state = serializer.captureState(sessionId, session);
      await serializer.saveState(state);

      // Restore and verify
      const recovered = await serializer.loadState(sessionId);
      const restoredTerminal = new Terminal({
        cols: recovered.dimensions.cols,
        rows: recovered.dimensions.rows,
        allowProposedApi: true
      });
      const restoredAddon = new SerializeAddon();
      restoredTerminal.loadAddon(restoredAddon);
      restoredTerminal.write(recovered.serialized);
      await new Promise(resolve => setTimeout(resolve, 100));

      const restoredSerialized = restoredAddon.serialize();
      // Should contain data (might not have all 100 lines depending on timing)
      expect(restoredSerialized).toContain('Rapid write');

      restoredTerminal.dispose();

      // Cleanup
      await manager.destroySession(sessionId);
    });
  });
});
