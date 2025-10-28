/**
 * Data Synchronization System
 *
 * Provides flexible data volume copying for any Docker Compose project.
 * Supports named volumes, bind mounts, and various data types (databases, caches, file storage).
 */

import { execSync } from 'child_process';
import { existsSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';

export class DataSync {
  /**
   * @param {ContainerRuntime} runtime - Container runtime instance
   * @param {ComposeInspector} inspector - Compose inspector instance
   */
  constructor(runtime, inspector) {
    this.runtime = runtime;
    this.inspector = inspector;
  }

  /**
   * Copy data volumes from one worktree to another
   * @param {string} fromWorktree - Source worktree name
   * @param {string} toWorktree - Target worktree name
   * @param {Object} options - Copy options
   * @param {Array<string>} [options.include] - Only copy these volumes
   * @param {Array<string>} [options.exclude] - Skip these volumes
   * @param {boolean} [options.skipAll=false] - Don't copy any volumes
   * @param {Function} [options.onProgress] - Progress callback (volumeName, current, total)
   * @returns {Promise<Object>} Copy results
   */
  async copyVolumes(fromWorktree, toWorktree, options = {}) {
    if (options.skipAll) {
      return { copied: [], skipped: [], errors: [] };
    }

    const results = {
      copied: [],
      skipped: [],
      errors: []
    };

    try {
      // Discover volumes from compose file
      const services = this.inspector.getServicesWithVolumes();
      const allVolumes = this._extractUniqueVolumes(services);

      // Filter volumes based on options
      const volumesToCopy = this._filterVolumes(allVolumes, options);

      // Copy each volume
      for (const volume of volumesToCopy) {
        try {
          if (this._isNamedVolume(volume)) {
            await this._copyNamedVolume(fromWorktree, toWorktree, volume, options);
            results.copied.push(volume);
          } else {
            await this._copyBindMount(fromWorktree, toWorktree, volume, options);
            results.copied.push(volume);
          }
        } catch (error) {
          results.errors.push({ volume, error: error.message });
        }
      }

      // Track skipped volumes
      const skipped = allVolumes.filter(v => !volumesToCopy.includes(v));
      results.skipped = skipped;

    } catch (error) {
      throw new Error(`Failed to copy volumes: ${error.message}`);
    }

    return results;
  }

  /**
   * List all volumes used by a worktree
   * @param {string} worktree - Worktree name
   * @returns {Promise<Array<{name: string, type: string, size: string}>>}
   */
  async listVolumes(worktree) {
    const services = this.inspector.getServicesWithVolumes();
    const volumes = this._extractUniqueVolumes(services);

    const volumeInfo = [];

    for (const volume of volumes) {
      const type = this._isNamedVolume(volume) ? 'volume' : 'bind';
      let size = 'unknown';

      try {
        if (type === 'volume') {
          const fullName = this._getFullVolumeName(worktree, volume);
          const info = await this.getVolumeInfo(fullName);
          size = info.size || 'unknown';
        } else {
          // For bind mounts, get directory size
          size = this._getDirectorySize(volume);
        }
      } catch (error) {
        // Volume might not exist yet
      }

      volumeInfo.push({ name: volume, type, size });
    }

    return volumeInfo;
  }

  /**
   * Reset a volume to empty state
   * @param {string} worktree - Worktree name
   * @param {string} volumeName - Volume name
   */
  async resetVolume(worktree, volumeName) {
    const fullName = this._getFullVolumeName(worktree, volumeName);

    try {
      // Remove existing volume
      this.runtime.exec(`volume rm ${fullName}`, { stdio: 'ignore' });
    } catch (error) {
      // Volume might not exist, that's okay
    }

    // Create fresh volume
    this.runtime.exec(`volume create ${fullName}`);
  }

  /**
   * Get volume information
   * @param {string} volumeName - Full volume name
   * @returns {Promise<Object>} Volume info
   */
  async getVolumeInfo(volumeName) {
    try {
      const output = this.runtime.exec(`volume inspect ${volumeName}`, {
        encoding: 'utf-8'
      });

      const info = JSON.parse(output)[0];

      return {
        name: info.Name,
        driver: info.Driver,
        mountpoint: info.Mountpoint,
        createdAt: info.CreatedAt,
        size: this._estimateVolumeSize(info.Mountpoint)
      };
    } catch (error) {
      throw new Error(`Failed to get volume info for ${volumeName}: ${error.message}`);
    }
  }

  /**
   * Extract unique volumes from services
   * @private
   */
  _extractUniqueVolumes(services) {
    const volumes = new Set();

    for (const service of services) {
      for (const volume of service.volumes) {
        volumes.add(volume);
      }
    }

    return Array.from(volumes);
  }

  /**
   * Filter volumes based on include/exclude options
   * @private
   */
  _filterVolumes(volumes, options) {
    let filtered = [...volumes];

    // Apply include filter (only these volumes)
    if (options.include && options.include.length > 0) {
      filtered = filtered.filter(v => options.include.includes(v));
    }

    // Apply exclude filter (skip these volumes)
    if (options.exclude && options.exclude.length > 0) {
      filtered = filtered.filter(v => !options.exclude.includes(v));
    }

    return filtered;
  }

  /**
   * Check if volume is a named volume (vs bind mount)
   * @private
   */
  _isNamedVolume(volume) {
    // Named volumes don't start with . or /
    return !volume.startsWith('.') && !volume.startsWith('/');
  }

  /**
   * Get full volume name with worktree prefix
   * @private
   */
  _getFullVolumeName(worktree, volumeName) {
    // Docker Compose naming convention: {project}_{volume}
    return `${worktree}_${volumeName}`;
  }

  /**
   * Copy a named volume
   * @private
   */
  async _copyNamedVolume(fromWorktree, toWorktree, volumeName, options) {
    const sourceVolume = this._getFullVolumeName(fromWorktree, volumeName);
    const targetVolume = this._getFullVolumeName(toWorktree, volumeName);

    // Check if source volume exists
    try {
      this.runtime.exec(`volume inspect ${sourceVolume}`, { stdio: 'ignore' });
    } catch (error) {
      throw new Error(`Source volume ${sourceVolume} does not exist`);
    }

    // Create target volume
    try {
      this.runtime.exec(`volume create ${targetVolume}`);
    } catch (error) {
      // Volume might already exist, that's okay
    }

    // Copy data using a temporary container
    // We use alpine because it's tiny and has cp command
    const copyCommand = `run --rm -v ${sourceVolume}:/source:ro -v ${targetVolume}:/target alpine sh -c "cp -a /source/. /target/"`;

    if (options.onProgress) {
      // Get approximate size for progress reporting
      const info = await this.getVolumeInfo(sourceVolume);
      const size = this._parseSize(info.size);
      options.onProgress(volumeName, 0, size);
    }

    this.runtime.exec(copyCommand);

    if (options.onProgress) {
      const info = await this.getVolumeInfo(sourceVolume);
      const size = this._parseSize(info.size);
      options.onProgress(volumeName, size, size); // 100%
    }
  }

  /**
   * Copy a bind mount (host directory)
   * @private
   */
  async _copyBindMount(fromWorktree, toWorktree, bindPath, options) {
    // Resolve relative paths
    const sourceDir = this._resolveBindPath(fromWorktree, bindPath);
    const targetDir = this._resolveBindPath(toWorktree, bindPath);

    // Check if source exists
    if (!existsSync(sourceDir)) {
      throw new Error(`Source bind mount ${sourceDir} does not exist`);
    }

    // Create target directory
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // Get size for progress reporting
    let size = 0;
    if (options.onProgress) {
      size = this._getDirectorySizeBytes(sourceDir);
      options.onProgress(bindPath, 0, size);
    }

    // Copy using rsync if available, otherwise cp
    try {
      execSync(`rsync -a "${sourceDir}/" "${targetDir}/"`, { stdio: 'ignore' });
    } catch (error) {
      // Fallback to cp
      execSync(`cp -r "${sourceDir}/." "${targetDir}/"`, { stdio: 'ignore' });
    }

    if (options.onProgress) {
      options.onProgress(bindPath, size, size); // 100%
    }
  }

  /**
   * Resolve bind mount path relative to worktree
   * @private
   */
  _resolveBindPath(worktree, bindPath) {
    if (bindPath.startsWith('/')) {
      return bindPath; // Absolute path
    }
    // Relative path - resolve from worktree directory
    return join('.worktrees', worktree, bindPath);
  }

  /**
   * Estimate volume size from mountpoint
   * @private
   */
  _estimateVolumeSize(mountpoint) {
    try {
      const output = execSync(`du -sh "${mountpoint}" 2>/dev/null || echo "0"`, {
        encoding: 'utf-8'
      });
      return output.split('\t')[0].trim();
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get directory size in human-readable format
   * @private
   */
  _getDirectorySize(path) {
    try {
      const output = execSync(`du -sh "${path}" 2>/dev/null || echo "0"`, {
        encoding: 'utf-8'
      });
      return output.split('\t')[0].trim();
    } catch (error) {
      return '0';
    }
  }

  /**
   * Get directory size in bytes
   * @private
   */
  _getDirectorySizeBytes(path) {
    try {
      const output = execSync(`du -sb "${path}" 2>/dev/null || echo "0"`, {
        encoding: 'utf-8'
      });
      return parseInt(output.split('\t')[0].trim(), 10);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Parse size string to bytes
   * @private
   */
  _parseSize(sizeStr) {
    if (!sizeStr || sizeStr === 'unknown') return 0;

    const units = {
      'B': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^([\d.]+)([BKMGT])?/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = (match[2] || 'B').toUpperCase();

    return Math.round(value * (units[unit] || 1));
  }
}
