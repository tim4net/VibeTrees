import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseManager } from './database-manager.mjs';
import { execSync } from 'child_process';
import pg from 'pg';
import fs from 'fs';
import os from 'os';
import { SafetyChecks } from './safety-checks.mjs';

vi.mock('child_process');
vi.mock('pg');
vi.mock('fs');
vi.mock('os');
vi.mock('./safety-checks.mjs');

describe('DatabaseManager', () => {
  let manager;
  let mockClient;
  const dbConfig = {
    host: 'localhost',
    port: 5432,
    database: 'vibe_test',
    user: 'postgres',
    password: 'password'
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock PostgreSQL client
    mockClient = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({ rows: [{ size: '52428800' }] }), // 50MB
      end: vi.fn()
    };
    // Use a constructable mock for `new pg.Client()`
    pg.Client = vi.fn(function () { return mockClient; });

    // Mock SafetyChecks
    SafetyChecks.estimateDatabaseSize = vi.fn().mockResolvedValue(50 * 1024 * 1024); // 50MB
    SafetyChecks.validateOperation = vi.fn().mockResolvedValue({
      safe: true,
      checks: {},
      errors: [],
      warnings: []
    });
    SafetyChecks.isDryRun = vi.fn((options) => options.dryRun === true);

    // Mock fs
    fs.existsSync = vi.fn().mockReturnValue(true);
    fs.statSync = vi.fn().mockReturnValue({ size: 10 * 1024 * 1024 }); // 10MB

    manager = new DatabaseManager(dbConfig);
  });

  describe('Export Operations', () => {
    it('should export schema only', async () => {
      const outputPath = '/tmp/schema.sql';
      execSync.mockReturnValue('-- Schema export');

      const result = await manager.exportSchema(outputPath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(SafetyChecks.validateOperation).toHaveBeenCalled();
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('pg_dump'),
        expect.objectContaining({ encoding: 'utf-8' })
      );
    });

    it('should export data only', async () => {
      const outputPath = '/tmp/data.sql';
      execSync.mockReturnValue('-- Data export');

      const result = await manager.exportData(outputPath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(SafetyChecks.validateOperation).toHaveBeenCalled();
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--data-only'),
        expect.any(Object)
      );
    });

    it('should export both schema and data', async () => {
      const outputPath = '/tmp/full.sql';
      execSync.mockReturnValue('-- Full export');

      const result = await manager.exportFull(outputPath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(SafetyChecks.validateOperation).toHaveBeenCalled();
    });

    it('should handle export errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('pg_dump failed');
      });

      const result = await manager.exportSchema('/tmp/schema.sql');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pg_dump failed');
    });

    it('should fail export when safety checks fail', async () => {
      SafetyChecks.validateOperation.mockResolvedValue({
        safe: false,
        errors: [{ type: 'disk_space', message: 'Insufficient space' }]
      });

      const result = await manager.exportSchema('/tmp/schema.sql');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Safety checks failed');
    });
  });

  describe('Import Operations', () => {
    it('should import SQL file', async () => {
      const inputPath = '/tmp/import.sql';
      execSync.mockReturnValue('');

      const result = await manager.importSQL(inputPath);

      expect(result.success).toBe(true);
      expect(SafetyChecks.validateOperation).toHaveBeenCalled();
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('psql'),
        expect.any(Object)
      );
    });

    it('should handle import errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('psql failed');
      });

      const result = await manager.importSQL('/tmp/bad.sql');

      expect(result.success).toBe(false);
      expect(result.error).toContain('psql failed');
    });

    it('should fail import when file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await manager.importSQL('/tmp/nonexistent.sql');

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should fail import when safety checks fail', async () => {
      SafetyChecks.validateOperation.mockResolvedValue({
        safe: false,
        errors: [{ type: 'disk_space', message: 'Insufficient space' }]
      });

      const result = await manager.importSQL('/tmp/import.sql');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Safety checks failed');
    });
  });

  describe('Transaction Safety', () => {
    it('should wrap import in transaction', async () => {
      execSync.mockReturnValue('');

      await manager.importWithTransaction('/tmp/import.sql');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(SafetyChecks.validateOperation).toHaveBeenCalled();
    });

    it('should rollback on import error', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Import failed');
      });

      const result = await manager.importWithTransaction('/tmp/bad.sql');

      expect(result.success).toBe(false);
      expect(result.rollback).toBe(true);
    });
  });

  describe('Dry-Run Mode', () => {
    it('should return dry-run result for schema export', async () => {
      const result = await manager.exportSchema('/tmp/schema.sql', { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.operations).toBeDefined();
      expect(result.estimatedSize).toBeGreaterThan(0);
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should return dry-run result for data export', async () => {
      const result = await manager.exportData('/tmp/data.sql', { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.operations).toBeDefined();
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should return dry-run result for full export', async () => {
      const result = await manager.exportFull('/tmp/full.sql', { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.operations).toBeDefined();
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should return dry-run result for import', async () => {
      const result = await manager.importSQL('/tmp/import.sql', { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.operations).toBeDefined();
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.currentDbSize).toBeGreaterThan(0);
      expect(result.estimatedFinalSize).toBeGreaterThan(0);
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should return dry-run result for import with transaction', async () => {
      const result = await manager.importWithTransaction('/tmp/import.sql', { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.operations).toContainEqual(
        expect.objectContaining({ type: 'begin_transaction' })
      );
      expect(result.operations).toContainEqual(
        expect.objectContaining({ type: 'commit_transaction' })
      );
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('should still perform safety checks in dry-run mode', async () => {
      await manager.exportSchema('/tmp/schema.sql', { dryRun: true });

      expect(SafetyChecks.validateOperation).toHaveBeenCalled();
    });

    it('should fail dry-run if safety checks fail', async () => {
      SafetyChecks.validateOperation.mockResolvedValue({
        safe: false,
        errors: [{ type: 'disk_space', message: 'Insufficient space' }]
      });

      const result = await manager.exportSchema('/tmp/schema.sql', { dryRun: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Safety checks failed');
    });
  });

  describe('Pre-flight Checks', () => {
    it('should estimate database size before export', async () => {
      await manager.exportFull('/tmp/full.sql');

      expect(SafetyChecks.estimateDatabaseSize).toHaveBeenCalled();
    });

    it('should check file size before import', async () => {
      await manager.importSQL('/tmp/import.sql');

      expect(fs.statSync).toHaveBeenCalledWith('/tmp/import.sql');
    });

    it('should validate operation before executing', async () => {
      await manager.exportFull('/tmp/full.sql');

      expect(SafetyChecks.validateOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'export',
          outputPath: '/tmp/full.sql',
          estimatedSize: expect.any(Number)
        })
      );
    });
  });
});
