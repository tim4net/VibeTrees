import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseValidator } from './database-validator.mjs';
import pg from 'pg';

vi.mock('pg');

describe('DatabaseValidator', () => {
  let validator;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      connect: vi.fn(),
      query: vi.fn(),
      end: vi.fn()
    };
    // Use a constructable mock (arrow functions can't be used with `new`)
    pg.Client = vi.fn(function () { return mockClient; });

    validator = new DatabaseValidator({
      host: 'localhost',
      port: 5432,
      database: 'vibe_test',
      user: 'postgres',
      password: 'password'
    });
  });

  describe('Schema Detection', () => {
    it('should detect existing tables', async () => {
      mockClient.query.mockResolvedValue({
        rows: [
          { tablename: 'users' },
          { tablename: 'posts' }
        ]
      });

      const tables = await validator.getTables();

      expect(tables).toEqual(['users', 'posts']);
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.query.mock.calls[0][0]).toContain('SELECT tablename');
    });

    it('should get table schema', async () => {
      mockClient.query.mockResolvedValue({
        rows: [
          { column_name: 'id', data_type: 'integer' },
          { column_name: 'email', data_type: 'varchar' }
        ]
      });

      const schema = await validator.getTableSchema('users');

      expect(schema).toHaveLength(2);
      expect(schema[0].column_name).toBe('id');
    });
  });

  describe('Compatibility Checks', () => {
    it('should validate schema compatibility', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ tablename: 'users' }] })
        .mockResolvedValueOnce({
          rows: [
            { column_name: 'id', data_type: 'integer' },
            { column_name: 'email', data_type: 'varchar' }
          ]
        });

      const importSchema = {
        users: [
          { column_name: 'id', data_type: 'integer' },
          { column_name: 'email', data_type: 'varchar' }
        ]
      };

      const result = await validator.validateCompatibility(importSchema);

      expect(result.compatible).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('should detect incompatible schemas', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ tablename: 'users' }] })
        .mockResolvedValueOnce({
          rows: [
            { column_name: 'id', data_type: 'integer' }
          ]
        });

      const importSchema = {
        users: [
          { column_name: 'id', data_type: 'varchar' } // Type mismatch
        ]
      };

      const result = await validator.validateCompatibility(importSchema);

      expect(result.compatible).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ type: 'type_mismatch' })
      );
    });
  });
});
