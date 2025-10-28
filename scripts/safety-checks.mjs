import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

/**
 * Safety checks for database and file operations
 * Provides disk space validation, bind mount checking, and dry-run capabilities
 */
export class SafetyChecks {
  /**
   * System directories that should never be used as bind mounts
   */
  static FORBIDDEN_PATHS = [
    '/etc',
    '/usr',
    '/sys',
    '/proc',
    '/boot',
    '/dev',
    '/bin',
    '/sbin',
    '/lib',
    '/lib64',
    '/root'
  ];

  /**
   * Minimum free disk space buffer (percentage)
   */
  static DEFAULT_BUFFER = 0.1; // 10%

  /**
   * Check available disk space for a given path
   * @param {string} targetPath - Path to check
   * @param {number} requiredBytes - Required space in bytes
   * @param {object} options - Options { buffer: 0.1 }
   * @returns {Promise<object>} Result with hasSpace, available, required, message
   */
  static async checkDiskSpace(targetPath, requiredBytes, options = {}) {
    const buffer = options.buffer || this.DEFAULT_BUFFER;
    const requiredWithBuffer = Math.ceil(requiredBytes * (1 + buffer));

    try {
      // Resolve the path to get the mount point
      const resolvedPath = path.resolve(targetPath);

      // Use df command to get disk space (works on macOS and Linux)
      let output;
      if (os.platform() === 'darwin' || os.platform() === 'linux') {
        // -k gives output in 1024-byte blocks
        output = execSync(`df -k "${path.dirname(resolvedPath)}"`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } else {
        // Fallback for other platforms
        throw new Error('Unsupported platform for disk space check');
      }

      // Parse df output
      // Format: Filesystem 1024-blocks Used Available Capacity Mounted
      const lines = output.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('Unexpected df output format');
      }

      // Get the data line (last line)
      const dataLine = lines[lines.length - 1];
      const parts = dataLine.trim().split(/\s+/);

      // Available is typically the 4th column (index 3)
      const availableKB = parseInt(parts[3], 10);
      const availableBytes = availableKB * 1024;

      const hasSpace = availableBytes >= requiredWithBuffer;

      return {
        hasSpace,
        available: availableBytes,
        required: requiredBytes,
        requiredWithBuffer,
        buffer: buffer * 100, // Convert to percentage
        message: hasSpace
          ? `Sufficient disk space: ${this._formatBytes(availableBytes)} available`
          : `Insufficient disk space: ${this._formatBytes(availableBytes)} available, ${this._formatBytes(requiredWithBuffer)} required (including ${buffer * 100}% buffer)`
      };
    } catch (error) {
      return {
        hasSpace: false,
        available: 0,
        required: requiredBytes,
        requiredWithBuffer,
        error: error.message,
        message: `Failed to check disk space: ${error.message}`
      };
    }
  }

  /**
   * Estimate database size using pg_database_size
   * @param {object} dbClient - PostgreSQL client
   * @param {string} databaseName - Database name
   * @returns {Promise<number>} Size in bytes
   */
  static async estimateDatabaseSize(dbClient, databaseName) {
    try {
      const result = await dbClient.query(
        `SELECT pg_database_size($1) as size`,
        [databaseName]
      );

      return parseInt(result.rows[0].size, 10) || 0;
    } catch (error) {
      console.error('Failed to estimate database size:', error.message);
      return 0;
    }
  }

  /**
   * Estimate Docker volume size
   * @param {string} volumeName - Volume name
   * @returns {Promise<number>} Size in bytes
   */
  static async estimateVolumeSize(volumeName) {
    try {
      // Try to get volume size via Docker inspect
      const output = execSync(
        `docker volume inspect ${volumeName} --format '{{.Mountpoint}}'`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();

      // Get directory size using du
      const sizeOutput = execSync(
        `du -sb "${output}" 2>/dev/null || echo "0"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );

      const size = parseInt(sizeOutput.split(/\s+/)[0], 10);
      return size || 0;
    } catch (error) {
      // Volume might not exist or docker not available
      return 0;
    }
  }

  /**
   * Validate bind mount path for safety
   * @param {string} mountPath - Path to validate
   * @returns {object} Result with valid, path, reason
   */
  static validateBindMount(mountPath) {
    try {
      // Normalize and resolve the path
      const resolvedPath = fs.existsSync(mountPath)
        ? fs.realpathSync(mountPath)
        : path.resolve(mountPath);

      // Check if path exists
      if (!fs.existsSync(resolvedPath)) {
        return {
          valid: false,
          path: resolvedPath,
          reason: 'Path does not exist'
        };
      }

      // Check if it's a directory
      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        return {
          valid: false,
          path: resolvedPath,
          reason: 'Path must be a directory, not a file'
        };
      }

      // Check if it's a forbidden system directory
      const isForbidden = this.FORBIDDEN_PATHS.some(forbidden => {
        return resolvedPath === forbidden || resolvedPath.startsWith(forbidden + '/');
      });

      if (isForbidden) {
        return {
          valid: false,
          path: resolvedPath,
          reason: 'Cannot use system directory as bind mount'
        };
      }

      // Check write permissions
      try {
        fs.accessSync(resolvedPath, fs.constants.W_OK);
      } catch (error) {
        return {
          valid: false,
          path: resolvedPath,
          reason: 'No write permission for this directory'
        };
      }

      return {
        valid: true,
        path: resolvedPath
      };
    } catch (error) {
      return {
        valid: false,
        path: mountPath,
        reason: `Validation error: ${error.message}`
      };
    }
  }

  /**
   * Check if operation is in dry-run mode
   * @param {object} options - Operation options
   * @returns {boolean} True if dry-run
   */
  static isDryRun(options) {
    return options.dryRun === true;
  }

  /**
   * Create dry-run summary for operations
   * @param {Array} operations - List of operations { type, target, size }
   * @returns {object} Summary with operations, totalDiskImpact, affectedFiles
   */
  static createDryRunSummary(operations) {
    const totalDiskImpact = operations.reduce((sum, op) => {
      return sum + (op.size || 0);
    }, 0);

    const affectedFiles = operations
      .filter(op => op.target)
      .map(op => op.target);

    // Rough estimate: 1MB per second for database operations
    const estimatedDuration = Math.ceil(totalDiskImpact / (1024 * 1024));

    return {
      operations,
      totalDiskImpact,
      totalDiskImpactFormatted: this._formatBytes(totalDiskImpact),
      affectedFiles,
      estimatedDuration: `~${estimatedDuration} seconds`,
      warning: totalDiskImpact > 1024 * 1024 * 1024
        ? 'Large operation: may take several minutes'
        : null
    };
  }

  /**
   * Validate entire operation before execution
   * @param {object} operation - Operation details { type, outputPath, estimatedSize }
   * @returns {Promise<object>} Validation result with safe, checks, errors, warnings
   */
  static async validateOperation(operation) {
    const checks = {};
    const errors = [];
    const warnings = [];

    // Check disk space if outputPath provided
    if (operation.outputPath) {
      const outputDir = path.dirname(operation.outputPath);

      // Validate the output directory path
      const pathValidation = this.validateBindMount(outputDir);
      checks.path = pathValidation;

      if (!pathValidation.valid) {
        errors.push({
          type: 'path',
          message: pathValidation.reason,
          path: outputDir
        });
      }

      // Check disk space
      if (operation.estimatedSize) {
        const spaceCheck = await this.checkDiskSpace(
          outputDir,
          operation.estimatedSize
        );
        checks.diskSpace = spaceCheck;

        if (!spaceCheck.hasSpace) {
          errors.push({
            type: 'disk_space',
            message: spaceCheck.message,
            available: spaceCheck.available,
            required: spaceCheck.requiredWithBuffer
          });
        } else if (spaceCheck.available < spaceCheck.requiredWithBuffer * 1.5) {
          // Warn if very close to limit
          warnings.push({
            type: 'disk_space_low',
            message: 'Disk space is sufficient but close to minimum',
            available: spaceCheck.available,
            required: spaceCheck.requiredWithBuffer
          });
        }
      }
    }

    return {
      safe: errors.length === 0,
      checks,
      errors,
      warnings
    };
  }

  /**
   * Format bytes to human-readable string
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   */
  static _formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}
