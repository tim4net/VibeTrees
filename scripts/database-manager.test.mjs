import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseManager } from './database-manager.mjs';
import { execSync } from 'child_process';
import pg from 'pg';

vi.mock('child_process');
vi.mock('pg');

describe('DatabaseManager', () => {
  let manager;
  const dbConfig = {
    host: 'localhost',
    port: 5432,
    database: 'vibe_test',
    user: 'postgres',
    password: 'password'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new DatabaseManager(dbConfig);
  });

  describe('Export Operations', () => {
    it('should export schema only', async () => {
      const outputPath = '/tmp/schema.sql';
      execSync.mockReturnValue('-- Schema export');

      const result = await manager.exportSchema(outputPath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
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
    });

    it('should handle export errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('pg_dump failed');
      });

      const result = await manager.exportSchema('/tmp/schema.sql');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pg_dump failed');
    });
  });

  describe('Import Operations', () => {
    it('should import SQL file', async () => {
      const inputPath = '/tmp/import.sql';
      execSync.mockReturnValue('');

      const result = await manager.importSQL(inputPath);

      expect(result.success).toBe(true);
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
  });

  describe('Transaction Safety', () => {
    it('should wrap import in transaction', async () => {
      const mockClient = {
        connect: vi.fn(),
        query: vi.fn(),
        end: vi.fn()
      };
      pg.Client = vi.fn(() => mockClient);

      const manager = new DatabaseManager(dbConfig);
      execSync.mockReturnValue('');

      await manager.importWithTransaction('/tmp/import.sql');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback on import error', async () => {
      const mockClient = {
        connect: vi.fn(),
        query: vi.fn(),
        end: vi.fn()
      };
      pg.Client = vi.fn(() => mockClient);

      const manager = new DatabaseManager(dbConfig);
      execSync.mockImplementation(() => {
        throw new Error('Import failed');
      });

      const result = await manager.importWithTransaction('/tmp/bad.sql');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(result.success).toBe(false);
    });
  });
});
