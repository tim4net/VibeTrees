import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger, getLogger, resetLogger } from './logger.mjs';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Logger', () => {
  let testLogDir;

  beforeEach(() => {
    // Create temporary log directory
    testLogDir = join(tmpdir(), `vibe-test-logs-${Date.now()}`);
    mkdirSync(testLogDir, { recursive: true });
    resetLogger();
  });

  afterEach(() => {
    // Clean up test logs
    if (existsSync(testLogDir)) {
      rmSync(testLogDir, { recursive: true, force: true });
    }
    resetLogger();
  });

  describe('Log Levels', () => {
    it('should log at DEBUG level when configured', async () => {
      const logger = new Logger({
        level: 'DEBUG',
        format: 'json',
        outputs: ['console'],
        logDir: testLogDir
      });

      const consoleSpy = vi.spyOn(console, 'log');

      await logger.debug('Debug message', { test: true });

      expect(consoleSpy).toHaveBeenCalled();
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('DEBUG');
      expect(logOutput).toContain('Debug message');

      consoleSpy.mockRestore();
    });

    it('should not log DEBUG when level is INFO', async () => {
      const logger = new Logger({
        level: 'INFO',
        format: 'json',
        outputs: ['console'],
        logDir: testLogDir
      });

      const consoleSpy = vi.spyOn(console, 'log');

      await logger.debug('Should not appear');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should log ERROR to console.error', async () => {
      const logger = new Logger({
        level: 'ERROR',
        format: 'json',
        outputs: ['console'],
        logDir: testLogDir
      });

      const errorSpy = vi.spyOn(console, 'error');

      await logger.error('Error message', { code: 'TEST' });

      expect(errorSpy).toHaveBeenCalled();
      const logOutput = errorSpy.mock.calls[0][0];
      expect(logOutput).toContain('ERROR');
      expect(logOutput).toContain('Error message');

      errorSpy.mockRestore();
    });

    it('should log WARN to console.warn', async () => {
      const logger = new Logger({
        level: 'WARN',
        format: 'json',
        outputs: ['console'],
        logDir: testLogDir
      });

      const warnSpy = vi.spyOn(console, 'warn');

      await logger.warn('Warning message');

      expect(warnSpy).toHaveBeenCalled();
      const logOutput = warnSpy.mock.calls[0][0];
      expect(logOutput).toContain('WARN');

      warnSpy.mockRestore();
    });
  });

  describe('Log Formats', () => {
    it('should format logs as JSON by default', async () => {
      const logger = new Logger({
        level: 'INFO',
        format: 'json',
        outputs: ['console'],
        logDir: testLogDir
      });

      const consoleSpy = vi.spyOn(console, 'log');

      await logger.info('Test message', { key: 'value' });

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('level', 'INFO');
      expect(parsed).toHaveProperty('message', 'Test message');
      expect(parsed).toHaveProperty('key', 'value');

      consoleSpy.mockRestore();
    });

    it('should format logs as text when configured', async () => {
      const logger = new Logger({
        level: 'INFO',
        format: 'text',
        outputs: ['console'],
        logDir: testLogDir
      });

      const consoleSpy = vi.spyOn(console, 'log');

      await logger.info('Test message', { key: 'value' });

      const logOutput = consoleSpy.mock.calls[0][0];

      expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO: Test message/);
      expect(logOutput).toContain('"key":"value"');

      consoleSpy.mockRestore();
    });
  });

  describe('Contextual Metadata', () => {
    it('should include global context in all logs', async () => {
      const logger = new Logger({
        level: 'INFO',
        format: 'json',
        outputs: ['console'],
        logDir: testLogDir,
        context: { service: 'test-service', env: 'test' }
      });

      const consoleSpy = vi.spyOn(console, 'log');

      await logger.info('Message');

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed).toHaveProperty('service', 'test-service');
      expect(parsed).toHaveProperty('env', 'test');

      consoleSpy.mockRestore();
    });

    it('should merge log-specific metadata with global context', async () => {
      const logger = new Logger({
        level: 'INFO',
        format: 'json',
        outputs: ['console'],
        logDir: testLogDir,
        context: { service: 'test-service' }
      });

      const consoleSpy = vi.spyOn(console, 'log');

      await logger.info('Message', { operation: 'test-op' });

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed).toHaveProperty('service', 'test-service');
      expect(parsed).toHaveProperty('operation', 'test-op');

      consoleSpy.mockRestore();
    });
  });

  describe('Child Loggers', () => {
    it('should create child logger with additional context', async () => {
      const parentLogger = new Logger({
        level: 'INFO',
        format: 'json',
        outputs: ['console'],
        logDir: testLogDir,
        context: { service: 'parent' }
      });

      const childLogger = parentLogger.child({ worktree: 'feature-auth' });

      const consoleSpy = vi.spyOn(console, 'log');

      await childLogger.info('Child message');

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed).toHaveProperty('service', 'parent');
      expect(parsed).toHaveProperty('worktree', 'feature-auth');

      consoleSpy.mockRestore();
    });
  });

  describe('Access Logging', () => {
    it('should log HTTP access with request details', async () => {
      const logger = new Logger({
        level: 'INFO',
        format: 'json',
        outputs: ['console'],
        logDir: testLogDir
      });

      const consoleSpy = vi.spyOn(console, 'log');

      const mockReq = {
        method: 'GET',
        url: '/api/worktrees',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-client' }
      };

      const mockRes = {
        statusCode: 200
      };

      await logger.access(mockReq, mockRes, 123);

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed).toHaveProperty('method', 'GET');
      expect(parsed).toHaveProperty('url', '/api/worktrees');
      expect(parsed).toHaveProperty('status', 200);
      expect(parsed).toHaveProperty('duration', '123ms');
      expect(parsed).toHaveProperty('ip', '127.0.0.1');

      consoleSpy.mockRestore();
    });
  });

  describe('Default Logger', () => {
    it('should return same instance on multiple calls', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();

      expect(logger1).toBe(logger2);
    });

    it('should respect environment variables', () => {
      process.env.LOG_LEVEL = 'DEBUG';
      process.env.LOG_FORMAT = 'text';

      resetLogger();
      const logger = getLogger();

      expect(logger.level).toBe(0); // DEBUG = 0
      expect(logger.format).toBe('text');

      delete process.env.LOG_LEVEL;
      delete process.env.LOG_FORMAT;
    });
  });

  describe('File Output', () => {
    it('should write logs to file when configured', async () => {
      const logger = new Logger({
        level: 'INFO',
        format: 'json',
        outputs: ['file'],
        logDir: testLogDir
      });

      await logger.info('File log message');

      // Give file system time to write
      await new Promise(resolve => setTimeout(resolve, 100));

      const logFile = join(testLogDir, 'app.log');
      expect(existsSync(logFile)).toBe(true);
    });

    it('should write errors to separate error.log', async () => {
      const logger = new Logger({
        level: 'ERROR',
        format: 'json',
        outputs: ['file'],
        logDir: testLogDir
      });

      await logger.error('Error message');

      // Give file system time to write
      await new Promise(resolve => setTimeout(resolve, 100));

      const errorLog = join(testLogDir, 'error.log');
      expect(existsSync(errorLog)).toBe(true);
    });
  });
});
