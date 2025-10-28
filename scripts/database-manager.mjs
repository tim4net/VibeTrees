import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import pg from 'pg';

export class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.connectionString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
  }

  /**
   * Export database schema only
   * @param {string} outputPath - Output file path
   * @returns {Promise<object>} Result with success status
   */
  async exportSchema(outputPath) {
    try {
      const command = `pg_dump ${this.connectionString} --schema-only --no-owner --no-acl -f ${outputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: outputPath,
        type: 'schema'
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
   * @returns {Promise<object>} Result with success status
   */
  async exportData(outputPath) {
    try {
      const command = `pg_dump ${this.connectionString} --data-only --inserts --no-owner --no-acl -f ${outputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: outputPath,
        type: 'data'
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
   * @returns {Promise<object>} Result with success status
   */
  async exportFull(outputPath) {
    try {
      const command = `pg_dump ${this.connectionString} --no-owner --no-acl -f ${outputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: outputPath,
        type: 'full'
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
   * @returns {Promise<object>} Result with success status
   */
  async importSQL(inputPath) {
    try {
      const command = `psql ${this.connectionString} -f ${inputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: inputPath
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
   * @returns {Promise<object>} Result with success status
   */
  async importWithTransaction(inputPath) {
    const client = new pg.Client(this.config);

    try {
      await client.connect();
      await client.query('BEGIN');

      // Execute import (directly with execSync so errors propagate)
      const command = `psql ${this.connectionString} -f ${inputPath}`;
      execSync(command, { encoding: 'utf-8' });

      await client.query('COMMIT');

      return {
        success: true,
        path: inputPath,
        rollback: false
      };
    } catch (error) {
      await client.query('ROLLBACK');

      return {
        success: false,
        error: error.message,
        rollback: true
      };
    } finally {
      await client.end();
    }
  }
}
