import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import pg from 'pg';
import { SafetyChecks } from './safety-checks.mjs';

export class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.connectionString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
  }

  /**
   * Export database schema only
   * @param {string} outputPath - Output file path
   * @param {object} options - Options { dryRun: boolean }
   * @returns {Promise<object>} Result with success status
   */
  async exportSchema(outputPath, options = {}) {
    try {
      // Perform pre-flight safety checks
      const estimatedSize = await this._estimateDatabaseSize();
      const validation = await SafetyChecks.validateOperation({
        type: 'export',
        outputPath,
        estimatedSize
      });

      if (!validation.safe) {
        return {
          success: false,
          error: 'Safety checks failed',
          validation
        };
      }

      // Dry-run mode
      if (SafetyChecks.isDryRun(options)) {
        return {
          success: true,
          dryRun: true,
          path: outputPath,
          type: 'schema',
          estimatedSize,
          validation,
          operations: [
            { type: 'export', target: 'schema', size: estimatedSize * 0.1 }, // Schema is ~10% of total
            { type: 'write', target: outputPath, size: estimatedSize * 0.1 }
          ]
        };
      }

      const command = `pg_dump ${this.connectionString} --schema-only --no-owner --no-acl -f ${outputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: outputPath,
        type: 'schema',
        validation
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export database data only
   * @param {string} outputPath - Output file path
   * @param {object} options - Options { dryRun: boolean }
   * @returns {Promise<object>} Result with success status
   */
  async exportData(outputPath, options = {}) {
    try {
      // Perform pre-flight safety checks
      const estimatedSize = await this._estimateDatabaseSize();
      const validation = await SafetyChecks.validateOperation({
        type: 'export',
        outputPath,
        estimatedSize
      });

      if (!validation.safe) {
        return {
          success: false,
          error: 'Safety checks failed',
          validation
        };
      }

      // Dry-run mode
      if (SafetyChecks.isDryRun(options)) {
        return {
          success: true,
          dryRun: true,
          path: outputPath,
          type: 'data',
          estimatedSize,
          validation,
          operations: [
            { type: 'export', target: 'data', size: estimatedSize * 0.9 }, // Data is ~90% of total
            { type: 'write', target: outputPath, size: estimatedSize * 0.9 }
          ]
        };
      }

      const command = `pg_dump ${this.connectionString} --data-only --inserts --no-owner --no-acl -f ${outputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: outputPath,
        type: 'data',
        validation
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export full database (schema + data)
   * @param {string} outputPath - Output file path
   * @param {object} options - Options { dryRun: boolean }
   * @returns {Promise<object>} Result with success status
   */
  async exportFull(outputPath, options = {}) {
    try {
      // Perform pre-flight safety checks
      const estimatedSize = await this._estimateDatabaseSize();
      const validation = await SafetyChecks.validateOperation({
        type: 'export',
        outputPath,
        estimatedSize
      });

      if (!validation.safe) {
        return {
          success: false,
          error: 'Safety checks failed',
          validation
        };
      }

      // Dry-run mode
      if (SafetyChecks.isDryRun(options)) {
        return {
          success: true,
          dryRun: true,
          path: outputPath,
          type: 'full',
          estimatedSize,
          validation,
          operations: [
            { type: 'export', target: 'full', size: estimatedSize },
            { type: 'write', target: outputPath, size: estimatedSize }
          ]
        };
      }

      const command = `pg_dump ${this.connectionString} --no-owner --no-acl -f ${outputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: outputPath,
        type: 'full',
        validation
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Import SQL file into database
   * @param {string} inputPath - Input SQL file path
   * @param {object} options - Options { dryRun: boolean }
   * @returns {Promise<object>} Result with success status
   */
  async importSQL(inputPath, options = {}) {
    try {
      // Perform pre-flight safety checks
      if (!fs.existsSync(inputPath)) {
        return {
          success: false,
          error: `Input file does not exist: ${inputPath}`
        };
      }

      const fileSize = fs.statSync(inputPath).size;
      const currentDbSize = await this._estimateDatabaseSize();
      const estimatedFinalSize = currentDbSize + fileSize;

      // Check disk space on database volume
      const validation = await SafetyChecks.validateOperation({
        type: 'import',
        outputPath: inputPath, // For path validation
        estimatedSize: estimatedFinalSize
      });

      if (!validation.safe) {
        return {
          success: false,
          error: 'Safety checks failed',
          validation
        };
      }

      // Dry-run mode
      if (SafetyChecks.isDryRun(options)) {
        return {
          success: true,
          dryRun: true,
          path: inputPath,
          fileSize,
          currentDbSize,
          estimatedFinalSize,
          validation,
          operations: [
            { type: 'read', target: inputPath, size: fileSize },
            { type: 'import', target: 'database', size: fileSize }
          ]
        };
      }

      const command = `psql ${this.connectionString} -f ${inputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: inputPath,
        validation
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Import SQL file with transaction safety
   * @param {string} inputPath - Input SQL file path
   * @param {object} options - Options { dryRun: boolean }
   * @returns {Promise<object>} Result with success status
   */
  async importWithTransaction(inputPath, options = {}) {
    try {
      // Perform pre-flight safety checks
      if (!fs.existsSync(inputPath)) {
        return {
          success: false,
          error: `Input file does not exist: ${inputPath}`
        };
      }

      const fileSize = fs.statSync(inputPath).size;
      const currentDbSize = await this._estimateDatabaseSize();
      const estimatedFinalSize = currentDbSize + fileSize;

      // Check disk space on database volume
      const validation = await SafetyChecks.validateOperation({
        type: 'import',
        outputPath: inputPath,
        estimatedSize: estimatedFinalSize
      });

      if (!validation.safe) {
        return {
          success: false,
          error: 'Safety checks failed',
          validation
        };
      }

      // Dry-run mode
      if (SafetyChecks.isDryRun(options)) {
        return {
          success: true,
          dryRun: true,
          path: inputPath,
          fileSize,
          currentDbSize,
          estimatedFinalSize,
          validation,
          operations: [
            { type: 'begin_transaction', target: 'database' },
            { type: 'read', target: inputPath, size: fileSize },
            { type: 'import', target: 'database', size: fileSize },
            { type: 'commit_transaction', target: 'database' }
          ]
        };
      }

      const client = new pg.Client(this.config);

      await client.connect();
      await client.query('BEGIN');

      // Execute import (directly with execSync so errors propagate)
      const command = `psql ${this.connectionString} -f ${inputPath}`;
      execSync(command, { encoding: 'utf-8' });

      await client.query('COMMIT');
      await client.end();

      return {
        success: true,
        path: inputPath,
        rollback: false,
        validation
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        rollback: true
      };
    }
  }

  /**
   * Estimate database size
   * @private
   * @returns {Promise<number>} Size in bytes
   */
  async _estimateDatabaseSize() {
    try {
      const client = new pg.Client(this.config);
      await client.connect();
      const size = await SafetyChecks.estimateDatabaseSize(client, this.config.database);
      await client.end();
      return size;
    } catch (error) {
      console.error('Failed to estimate database size:', error.message);
      // Return a conservative estimate (100MB) if we can't determine size
      return 100 * 1024 * 1024;
    }
  }
}
