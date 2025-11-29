import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Telemetry, getTelemetry, resetTelemetry } from './telemetry.mjs';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Telemetry', () => {
  let testTelemetryDir;

  beforeEach(() => {
    testTelemetryDir = join(tmpdir(), `vibe-test-telemetry-${Date.now()}`);
    mkdirSync(testTelemetryDir, { recursive: true });
    resetTelemetry();
  });

  afterEach(() => {
    if (existsSync(testTelemetryDir)) {
      rmSync(testTelemetryDir, { recursive: true, force: true });
    }
    resetTelemetry();
  });

  describe('Opt-in Behavior', () => {
    it('should be disabled by default', () => {
      const telemetry = new Telemetry();

      expect(telemetry.isEnabled()).toBe(false);
    });

    it('should be enabled when explicitly opted in', () => {
      const telemetry = new Telemetry({ enabled: true });

      expect(telemetry.isEnabled()).toBe(true);
    });

    it('should not track events when disabled', async () => {
      const telemetry = new Telemetry({
        enabled: false,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackEvent('test-event', { key: 'value' });

      expect(telemetry.events).toHaveLength(0);
    });

    it('should track events when enabled', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackEvent('test-event', { key: 'value' });

      expect(telemetry.events).toHaveLength(1);
      expect(telemetry.events[0]).toMatchObject({
        eventName: 'test-event',
        properties: { key: 'value' }
      });
    });
  });

  describe('Event Tracking', () => {
    it('should include session and install IDs', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackEvent('test-event');

      const event = telemetry.events[0];

      expect(event).toHaveProperty('sessionId');
      expect(event).toHaveProperty('installId');
      expect(event.sessionId).toBeTruthy();
    });

    it('should include platform information', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackEvent('test-event');

      const event = telemetry.events[0];

      expect(event).toHaveProperty('platform');
      expect(event).toHaveProperty('arch');
      expect(event).toHaveProperty('nodeVersion');
    });

    it('should include timestamp', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackEvent('test-event');

      const event = telemetry.events[0];

      expect(event).toHaveProperty('timestamp');
      expect(new Date(event.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('Error Tracking', () => {
    it('should track errors with sanitized stack traces', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      const error = new Error('Test error');
      error.code = 'TEST_ERROR';

      await telemetry.trackError(error, { operation: 'test-op' });

      const event = telemetry.events[0];

      expect(event.eventName).toBe('error');
      expect(event.properties).toHaveProperty('message', 'Test error');
      expect(event.properties).toHaveProperty('code', 'TEST_ERROR');
      expect(event.properties).toHaveProperty('stack');
      expect(event.properties).toHaveProperty('operation', 'test-op');
    });
  });

  describe('Metric Tracking', () => {
    it('should track performance metrics', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackMetric('operation-time', 1234, 'ms');

      expect(telemetry.metrics.has('operation-time')).toBe(true);
      expect(telemetry.metrics.get('operation-time')).toContain(1234);
    });

    it('should calculate metric statistics', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackMetric('test-metric', 100);
      await telemetry.trackMetric('test-metric', 200);
      await telemetry.trackMetric('test-metric', 300);

      const stats = telemetry.getMetricStats('test-metric');

      expect(stats).toMatchObject({
        count: 3,
        min: 100,
        max: 300,
        mean: 200,
        median: 200
      });
    });

    it('should return null for non-existent metrics', () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      const stats = telemetry.getMetricStats('non-existent');

      expect(stats).toBeNull();
    });
  });

  describe('Timer', () => {
    it('should measure operation duration', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      const timer = telemetry.startTimer('test-operation');

      await new Promise(resolve => setTimeout(resolve, 100));

      const duration = await timer.end();

      // Allow 1ms tolerance for timer precision
      expect(duration).toBeGreaterThanOrEqual(99);
      expect(telemetry.metrics.has('test-operation')).toBe(true);
    });
  });

  describe('Data Sanitization', () => {
    it('should sanitize file paths', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackEvent('test', {
        path: '/Users/john/project/.vibetrees/config.json'
      });

      const event = telemetry.events[0];

      expect(event.properties.path).not.toContain('/Users/john');
      expect(event.properties.path).toContain('***');
    });

    it('should remove sensitive keys', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackEvent('test', {
        password: 'secret123',
        token: 'abc123',
        apiKey: 'key123',
        normalKey: 'value'
      });

      const event = telemetry.events[0];

      expect(event.properties).not.toHaveProperty('password');
      expect(event.properties).not.toHaveProperty('token');
      expect(event.properties).not.toHaveProperty('apiKey');
      expect(event.properties).toHaveProperty('normalKey', 'value');
    });

    it('should sanitize email addresses', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackEvent('test', {
        message: 'User john@example.com logged in'
      });

      const event = telemetry.events[0];

      expect(event.properties.message).not.toContain('john@example.com');
      expect(event.properties.message).toContain('***@***.***');
    });

    it('should sanitize IP addresses', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackEvent('test', {
        ip: '192.168.1.1'
      });

      const event = telemetry.events[0];

      expect(event.properties.ip).not.toContain('192.168.1.1');
      expect(event.properties.ip).toContain('***');
    });

    it('should replace arrays and objects with counts', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackEvent('test', {
        list: [1, 2, 3],
        obj: { a: 1, b: 2 }
      });

      const event = telemetry.events[0];

      expect(event.properties.list).toBe(3); // Array length
      expect(event.properties.obj).toBe(2); // Object key count
    });
  });

  describe('Usage Summary', () => {
    it('should generate usage summary', async () => {
      const telemetry = new Telemetry({
        enabled: true,
        telemetryDir: testTelemetryDir
      });

      await telemetry.trackEvent('event-1');
      await telemetry.trackEvent('event-2');
      await telemetry.trackMetric('metric-1', 100);
      await telemetry.trackMetric('metric-1', 200);

      const summary = telemetry.getUsageSummary();

      expect(summary).toHaveProperty('sessionId');
      expect(summary).toHaveProperty('installId');
      expect(summary).toHaveProperty('eventCount', 2);
      expect(summary).toHaveProperty('metrics');
      expect(summary.metrics).toHaveProperty('metric-1');
    });
  });

  describe('Default Telemetry', () => {
    it('should return same instance on multiple calls', () => {
      const telemetry1 = getTelemetry();
      const telemetry2 = getTelemetry();

      expect(telemetry1).toBe(telemetry2);
    });

    it('should respect environment variable', () => {
      process.env.VIBE_TELEMETRY = 'true';

      resetTelemetry();
      const telemetry = getTelemetry();

      expect(telemetry.isEnabled()).toBe(true);

      delete process.env.VIBE_TELEMETRY;
    });
  });

  describe('Enable/Disable', () => {
    it('should enable telemetry', () => {
      const telemetry = new Telemetry({ enabled: false });

      expect(telemetry.isEnabled()).toBe(false);

      telemetry.enable();

      expect(telemetry.isEnabled()).toBe(true);
    });

    it('should disable telemetry', () => {
      const telemetry = new Telemetry({ enabled: true });

      expect(telemetry.isEnabled()).toBe(true);

      telemetry.disable();

      expect(telemetry.isEnabled()).toBe(false);
    });
  });
});
