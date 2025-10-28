import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PTYStateSerializer } from './pty-state-serializer.mjs';

vi.mock('fs');
vi.mock('os');

describe('PTYStateSerializer', () => {
  let serializer;
  const sessionId = 'test-session-123';
  const sessionDir = '/mock/home/.vibetrees/sessions/test-session-123';

  beforeEach(() => {
    vi.clearAllMocks();
    os.homedir.mockReturnValue('/mock/home');
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

      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockReturnValue(undefined);
      fs.writeFileSync.mockReturnValue(undefined);

      await serializer.saveState(state);

      expect(fs.mkdirSync).toHaveBeenCalledWith(sessionDir, { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(sessionDir, 'pty-state.json'),
        JSON.stringify(state, null, 2),
        'utf-8'
      );
    });

    it('should not create directory if it already exists', async () => {
      const state = {
        sessionId,
        buffer: ['line1'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);

      await serializer.saveState(state);

      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
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

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(savedState));

      const state = await serializer.loadState(sessionId);

      expect(state).toEqual(savedState);
      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join(sessionDir, 'pty-state.json'),
        'utf-8'
      );
    });

    it('should return null if state file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      const state = await serializer.loadState(sessionId);

      expect(state).toBeNull();
    });
  });
});
