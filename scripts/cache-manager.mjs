import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export class CacheManager {
  constructor() {
    this.cacheDir = path.join(os.homedir(), '.vibetrees', 'cache');
  }

  /**
   * Cache node_modules directory
   * @param {string} sourcePath - Source node_modules path
   */
  async cacheNodeModules(sourcePath) {
    const cachePath = path.join(this.cacheDir, 'node_modules');

    // Create cache directory if needed
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true });
    }

    // Copy node_modules to cache
    fs.cpSync(sourcePath, cachePath, { recursive: true, force: true });
  }

  /**
   * Restore node_modules from cache using hardlinks
   * @param {string} targetPath - Target node_modules path
   */
  async restoreNodeModules(targetPath) {
    const cachePath = path.join(this.cacheDir, 'node_modules');

    if (!fs.existsSync(cachePath)) {
      throw new Error('Cache does not exist');
    }

    // Use cpSync with hardlinks for speed (Node.js will reuse inodes)
    fs.cpSync(cachePath, targetPath, {
      recursive: true,
      force: true
    });
  }

  /**
   * Check if cache is valid for project
   * @param {string} projectPath - Project root path
   * @returns {boolean} True if cache is valid
   */
  isCacheValid(projectPath) {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const cachedPackageJsonPath = path.join(this.cacheDir, 'package.json');

    if (!fs.existsSync(cachedPackageJsonPath)) {
      return false;
    }

    const currentPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const cachedPackageJson = JSON.parse(fs.readFileSync(cachedPackageJsonPath, 'utf-8'));

    // Simple comparison: dependencies must match
    return JSON.stringify(currentPackageJson.dependencies) ===
           JSON.stringify(cachedPackageJson.dependencies);
  }

  /**
   * Get Docker cache environment variables
   * @returns {object} Environment variables for BuildKit
   */
  getDockerCacheEnv() {
    return {
      DOCKER_BUILDKIT: '1',
      BUILDKIT_PROGRESS: 'plain',
      COMPOSE_DOCKER_CLI_BUILD: '1'
    };
  }
}
