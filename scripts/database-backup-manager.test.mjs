import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseBackupManager } from './database-backup-manager.mjs';
import { DatabaseManager } from './database-manager.mjs';
import { ComposeInspector } from './compose-inspector.mjs';
import path from 'path';
import fs from 'fs';

// Mock dependencies
vi.mock('fs');
vi.mock('./database-manager.mjs');
vi.mock('./compose-inspector.mjs');

describe('DatabaseBackupManager', () => {
  let manager;
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      projectRoot: '/test/project',
      backupDir: '/test/project/.vibetrees/backups'
    };

    manager = new DatabaseBackupManager(mockConfig);
  });

  describe('detectDatabase', () => {
    it('should detect postgres database service', async () => {
      const worktreePath = '/test/project/.worktrees/main';

      // Mock ComposeInspector to return postgres service
      const mockInspector = {
        getServices: vi.fn().mockReturnValue([
          { name: 'postgres', image: 'postgres:15' },
          { name: 'api', image: 'node:18' }
        ])
      };

      vi.mocked(ComposeInspector).mockImplementation(function() {
        return mockInspector;
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await manager.detectDatabase(worktreePath);

      expect(result).toEqual({
        hasDatabase: true,
        type: 'postgres',
        service: 'postgres'
      });
    });

    it('should detect mysql database service', async () => {
      const worktreePath = '/test/project/.worktrees/main';

      const mockInspector = {
        getServices: vi.fn().mockReturnValue([
          { name: 'mysql', image: 'mysql:8' },
          { name: 'api', image: 'node:18' }
        ])
      };

      vi.mocked(ComposeInspector).mockImplementation(function() {
        return mockInspector;
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await manager.detectDatabase(worktreePath);

      expect(result).toEqual({
        hasDatabase: true,
        type: 'mysql',
        service: 'mysql'
      });
    });

    it('should detect mariadb database service', async () => {
      const worktreePath = '/test/project/.worktrees/main';

      const mockInspector = {
        getServices: vi.fn().mockReturnValue([
          { name: 'mariadb', image: 'mariadb:10' }
        ])
      };

      vi.mocked(ComposeInspector).mockImplementation(function() {
        return mockInspector;
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await manager.detectDatabase(worktreePath);

      expect(result).toEqual({
        hasDatabase: true,
        type: 'mariadb',
        service: 'mariadb'
      });
    });

    it('should return no database if no database service found', async () => {
      const worktreePath = '/test/project/.worktrees/main';

      const mockInspector = {
        getServices: vi.fn().mockReturnValue([
          { name: 'api', image: 'node:18' },
          { name: 'redis', image: 'redis:7' }
        ])
      };

      vi.mocked(ComposeInspector).mockImplementation(function() {
        return mockInspector;
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await manager.detectDatabase(worktreePath);

      expect(result).toEqual({
        hasDatabase: false,
        type: null,
        service: null
      });
    });

    it('should return no database if docker-compose.yml does not exist', async () => {
      const worktreePath = '/test/project/.worktrees/main';

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await manager.detectDatabase(worktreePath);

      expect(result).toEqual({
        hasDatabase: false,
        type: null,
        service: null
      });
    });
  });

  describe('createBackup', () => {
    it('should create backup for main worktree with postgres', async () => {
      const worktreeName = 'main';
      const worktreePath = '/test/project';

      // Mock database detection
      vi.spyOn(manager, 'detectDatabase').mockResolvedValue({
        hasDatabase: true,
        type: 'postgres',
        service: 'postgres'
      });

      // Mock DatabaseManager
      const mockDbManager = {
        exportFull: vi.fn().mockResolvedValue({
          success: true,
          path: '/test/project/.vibetrees/backups/main/backup-2025-11-17-020000.sql'
        })
      };
      vi.mocked(DatabaseManager).mockImplementation(function() {
        return mockDbManager;
      });

      // Mock fs operations
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024000 });

      const result = await manager.createBackup(worktreeName, worktreePath, { postgres: 5432 });

      expect(result.success).toBe(true);
      expect(result.backupPath).toContain('backup-');
      expect(result.backupPath).toContain('.sql');
      expect(mockDbManager.exportFull).toHaveBeenCalled();
    });

    it('should skip backup if no database detected', async () => {
      const worktreeName = 'main';
      const worktreePath = '/test/project';

      vi.spyOn(manager, 'detectDatabase').mockResolvedValue({
        hasDatabase: false,
        type: null,
        service: null
      });

      const result = await manager.createBackup(worktreeName, worktreePath, {});

      expect(result.success).toBe(false);
      expect(result.reason).toBe('no-database');
    });

    it('should handle backup errors gracefully', async () => {
      const worktreeName = 'main';
      const worktreePath = '/test/project';

      vi.spyOn(manager, 'detectDatabase').mockResolvedValue({
        hasDatabase: true,
        type: 'postgres',
        service: 'postgres'
      });

      const mockDbManager = {
        exportFull: vi.fn().mockResolvedValue({
          success: false,
          error: 'Connection timeout'
        })
      };
      vi.mocked(DatabaseManager).mockImplementation(function() {
        return mockDbManager;
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await manager.createBackup(worktreeName, worktreePath, { postgres: 5432 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });
  });

  describe('getLatestBackup', () => {
    it('should return the most recent backup file', () => {
      const worktreeName = 'main';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'backup-2025-11-15-020000.sql',
        'backup-2025-11-17-020000.sql',
        'backup-2025-11-16-020000.sql',
        'README.md'
      ]);

      // Mock statSync to return different mtimes for different files
      vi.mocked(fs.statSync).mockImplementation((filePath) => {
        if (filePath.includes('backup-2025-11-17')) {
          return { mtime: new Date('2025-11-17T02:00:00'), size: 1024000 };
        } else if (filePath.includes('backup-2025-11-16')) {
          return { mtime: new Date('2025-11-16T02:00:00'), size: 1024000 };
        } else {
          return { mtime: new Date('2025-11-15T02:00:00'), size: 1024000 };
        }
      });

      const result = manager.getLatestBackup(worktreeName);

      expect(result).toEqual({
        path: expect.stringContaining('backup-2025-11-17-020000.sql'),
        filename: 'backup-2025-11-17-020000.sql',
        timestamp: new Date('2025-11-17T02:00:00'),
        size: 1024000
      });
    });

    it('should return null if no backups exist', () => {
      const worktreeName = 'main';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['README.md']);

      const result = manager.getLatestBackup(worktreeName);

      expect(result).toBeNull();
    });

    it('should return null if backup directory does not exist', () => {
      const worktreeName = 'main';

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = manager.getLatestBackup(worktreeName);

      expect(result).toBeNull();
    });
  });

  describe('generateBackupDocs', () => {
    it('should generate README.md with backup information', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        if (dir.toString().includes('/main')) {
          return ['backup-2025-11-17-020000.sql', 'backup-2025-11-16-020000.sql'];
        }
        return ['main'];
      });
      vi.mocked(fs.statSync).mockReturnValue({
        mtime: new Date('2025-11-17T02:00:00'),
        size: 1024000,
        isDirectory: () => true
      });
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const result = manager.generateBackupDocs();

      expect(result.success).toBe(true);
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const content = writeCall[1];

      expect(content).toContain('# Database Backups');
      expect(content).toContain('## Main Worktree Backups');
      expect(content).toContain('backup-2025-11-17-020000.sql');
      expect(content).toContain('1000.0 KB'); // 1024000 bytes = 1000.0 KB
    });

    it('should handle case when backup directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = manager.generateBackupDocs();

      expect(result.success).toBe(true);
      expect(result.worktrees).toBe(0);
    });
  });

  describe('listBackups', () => {
    it('should list all backups for a worktree', () => {
      const worktreeName = 'main';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'backup-2025-11-17-020000.sql',
        'backup-2025-11-16-020000.sql',
        'README.md'
      ]);
      vi.mocked(fs.statSync).mockReturnValue({
        mtime: new Date('2025-11-17T02:00:00'),
        size: 1024000
      });

      const result = manager.listBackups(worktreeName);

      expect(result).toHaveLength(2);
      expect(result[0].filename).toBe('backup-2025-11-17-020000.sql');
      expect(result[1].filename).toBe('backup-2025-11-16-020000.sql');
    });

    it('should return empty array if no backups exist', () => {
      const worktreeName = 'main';

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = manager.listBackups(worktreeName);

      expect(result).toEqual([]);
    });
  });
});
