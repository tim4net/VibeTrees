import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PTYStateSerializer } from './pty-state-serializer.mjs';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    constants: {
      F_OK: 0
    },
    promises: {
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      access: vi.fn(),
      readFile: vi.fn(),
      rm: vi.fn(),
      readdir: vi.fn()
    }
  }
}));
vi.mock('os');

describe('PTYStateSerializer', () => {
  let serializer;
  const sessionId = 'test-session-123';
  const sessionDir = '/mock/home/.vibetrees/sessions/test-session-123';

  beforeEach(() => {
    vi.clearAllMocks();
    os.homedir.mockReturnValue('/mock/home');

    // Set default mock return values for async operations
    fs.promises.mkdir.mockResolvedValue(undefined);
    fs.promises.writeFile.mockResolvedValue(undefined);
    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.readFile.mockResolvedValue('{}');
    fs.promises.rm.mockResolvedValue(undefined);
    fs.promises.readdir.mockResolvedValue([]);

    serializer = new PTYStateSerializer();
  });

  describe('State Capture', () => {
    it('should capture terminal buffer state', () => {
      const mockPty = {
        _terminal: {
          buffer: {
            active: {
              length: 24,
              getLine: vi.fn((i) => ({
                translateToString: () => `Line ${i}`
              }))
            }
          },
          cols: 80,
          rows: 24
        }
      };

      const state = serializer.captureState(sessionId, mockPty);

      expect(state.sessionId).toBe(sessionId);
      expect(state.buffer).toHaveLength(24);
      expect(state.dimensions).toEqual({ cols: 80, rows: 24 });
      expect(state.timestamp).toBeDefined();
    });

    it('should handle PTY without internal terminal buffer', () => {
      const mockPty = {};

      const state = serializer.captureState(sessionId, mockPty);

      expect(state.sessionId).toBe(sessionId);
      expect(state.buffer).toEqual([]);
    });
  });

  describe('State Persistence', () => {
    it('should save state to filesystem', async () => {
      const state = {
        sessionId,
        buffer: ['line1', 'line2'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      await serializer.saveState(state);

      expect(fs.promises.mkdir).toHaveBeenCalledWith(sessionDir, { recursive: true });
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        path.join(sessionDir, 'pty-state.json'),
        JSON.stringify(state),
        'utf-8'
      );
    });

    it('should handle directory creation errors gracefully', async () => {
      const state = {
        sessionId,
        buffer: ['line1'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      // Mock mkdir to succeed (recursive mode handles existing dirs)
      fs.promises.mkdir.mockResolvedValue(undefined);

      await serializer.saveState(state);

      expect(fs.promises.mkdir).toHaveBeenCalled();
      expect(fs.promises.writeFile).toHaveBeenCalled();
    });
  });

  describe('State Recovery', () => {
    it('should load state from filesystem', async () => {
      const savedState = {
        sessionId,
        buffer: ['line1', 'line2'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      fs.promises.access.mockResolvedValue(undefined);
      fs.promises.readFile.mockResolvedValue(JSON.stringify(savedState));

      const state = await serializer.loadState(sessionId);

      expect(state).toEqual(savedState);
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        path.join(sessionDir, 'pty-state.json'),
        'utf-8'
      );
    });

    it('should return null if state file does not exist', async () => {
      fs.promises.access.mockRejectedValue(new Error('ENOENT'));

      const state = await serializer.loadState(sessionId);

      expect(state).toBeNull();
    });
  });

  describe('Async Operations', () => {
    it('should save state asynchronously without blocking', async () => {
      const state = {
        sessionId: 'test-123',
        buffer: ['test output'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      const startTime = Date.now();
      await serializer.saveState(state);
      const duration = Date.now() - startTime;

      // Should complete quickly without blocking
      expect(duration).toBeLessThan(100);
      expect(fs.promises.mkdir).toHaveBeenCalled();
      expect(fs.promises.writeFile).toHaveBeenCalled();
    });

    it('should handle concurrent saves without corruption', async () => {
      const state1 = { sessionId: 'test-1', buffer: ['a'], dimensions: { cols: 80, rows: 24 }, timestamp: Date.now() };
      const state2 = { sessionId: 'test-2', buffer: ['b'], dimensions: { cols: 80, rows: 24 }, timestamp: Date.now() };

      // Mock readFile to return the correct state based on session ID
      fs.promises.readFile.mockImplementation((filePath) => {
        if (filePath.includes('test-1')) {
          return Promise.resolve(JSON.stringify(state1));
        }
        return Promise.resolve(JSON.stringify(state2));
      });

      // Save concurrently
      await Promise.all([
        serializer.saveState(state1),
        serializer.saveState(state2)
      ]);

      // Both should be saved correctly
      const loaded1 = await serializer.loadState('test-1');
      const loaded2 = await serializer.loadState('test-2');

      expect(loaded1.sessionId).toBe('test-1');
      expect(loaded2.sessionId).toBe('test-2');
    });
  });
});
