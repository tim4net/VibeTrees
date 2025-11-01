/**
 * Background Update Checker
 *
 * Checks GitHub for new versions hourly without blocking.
 * Caches results to avoid rate limiting.
 */

import { readFileSync } from 'fs';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CACHE_DIR = join(homedir(), '.vibetrees');
const CACHE_FILE = join(CACHE_DIR, 'update-check.json');
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export class UpdateChecker {
  constructor(currentVersion) {
    this.currentVersion = currentVersion;
    this.latestVersion = null;
    this.lastCheck = null;
    this.isUpdateAvailable = false;
  }

  /**
   * Start the background checker
   */
  start() {
    // Check immediately on startup (cached)
    this.checkForUpdates();

    // Then check every hour
    setInterval(() => {
      this.checkForUpdates();
    }, CHECK_INTERVAL);

    console.log('[UpdateChecker] Background update checker started');
  }

  /**
   * Check for updates (non-blocking)
   */
  async checkForUpdates() {
    try {
      // Check cache first
      const cached = this.getCachedResult();
      if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        this.latestVersion = cached.latestVersion;
        this.isUpdateAvailable = this.compareVersions(this.currentVersion, cached.latestVersion) < 0;
        return;
      }

      // Fetch from GitHub API (non-blocking)
      const response = await fetch('https://api.github.com/repos/tim4net/VibeTrees/releases/latest', {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'VibeTrees-Update-Checker'
        }
      });

      if (!response.ok) {
        console.error('[UpdateChecker] Failed to check for updates:', response.statusText);
        return;
      }

      const data = await response.json();
      this.latestVersion = data.tag_name.replace(/^v/, ''); // Remove 'v' prefix
      this.lastCheck = Date.now();
      this.isUpdateAvailable = this.compareVersions(this.currentVersion, this.latestVersion) < 0;

      // Cache the result
      this.cacheResult({
        latestVersion: this.latestVersion,
        timestamp: this.lastCheck
      });

      if (this.isUpdateAvailable) {
        console.log(`[UpdateChecker] New version available: ${this.latestVersion} (current: ${this.currentVersion})`);
      }

    } catch (error) {
      // Silently fail - don't block the app
      console.error('[UpdateChecker] Error checking for updates:', error.message);
    }
  }

  /**
   * Get update status (for API endpoint)
   */
  getStatus() {
    return {
      currentVersion: this.currentVersion,
      latestVersion: this.latestVersion,
      isUpdateAvailable: this.isUpdateAvailable,
      lastCheck: this.lastCheck
    };
  }

  /**
   * Compare semantic versions
   * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }
    return 0;
  }

  /**
   * Cache the result to disk
   */
  cacheResult(data) {
    try {
      if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, { recursive: true });
      }
      writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      // Ignore cache write errors
    }
  }

  /**
   * Get cached result from disk
   */
  getCachedResult() {
    try {
      if (!existsSync(CACHE_FILE)) return null;
      const data = readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
}
