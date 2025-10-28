/**
 * Port registry for managing dynamic port allocation across worktrees
 *
 * Each worktree needs isolated services with unique ports. This registry
 * tracks port assignments and ensures no conflicts between worktrees.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export class PortRegistry {
  /**
   * @param {string} projectRoot - Project root directory (optional, uses cwd if not provided)
   */
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.registryDir = this._getProjectConfigDir(projectRoot);
    this.registryFile = join(this.registryDir, 'ports.json');
    this.ports = this.load();
  }

  /**
   * Get project-specific config directory in ~/.vibetrees/
   * Uses parent-child naming to avoid collisions
   * @param {string} projectRoot - Project root directory
   * @returns {string} Config directory path
   */
  _getProjectConfigDir(projectRoot) {
    const parts = projectRoot.split(/[\/\\]/).filter(Boolean);

    // Use last two path components: parent-child
    // ~/code/ecommerce-app → code-ecommerce-app
    const projectName = parts.length >= 2
      ? `${parts[parts.length - 2]}-${parts[parts.length - 1]}`
      : parts[parts.length - 1];

    return join(homedir(), '.vibetrees', projectName);
  }

  load() {
    if (!existsSync(this.registryDir)) {
      mkdirSync(this.registryDir, { recursive: true });
    }

    if (!existsSync(this.registryFile)) {
      return {};
    }

    try {
      const data = readFileSync(this.registryFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  save() {
    if (!existsSync(this.registryDir)) {
      mkdirSync(this.registryDir, { recursive: true });
    }
    writeFileSync(this.registryFile, JSON.stringify(this.ports, null, 2));
  }

  allocate(worktreeName, service, basePort) {
    const key = `${worktreeName}:${service}`;

    // Return existing port if already allocated
    if (this.ports[key]) {
      return this.ports[key];
    }

    // Find next available port
    let port = basePort;
    const usedPorts = new Set(Object.values(this.ports));

    while (usedPorts.has(port)) {
      port++;
    }

    this.ports[key] = port;
    this.save();

    return port;
  }

  release(worktreeName) {
    const keys = Object.keys(this.ports).filter(k => k.startsWith(`${worktreeName}:`));
    for (const key of keys) {
      delete this.ports[key];
    }
    this.save();
  }

  getWorktreePorts(worktreeName) {
    const result = {};
    for (const [key, port] of Object.entries(this.ports)) {
      if (key.startsWith(`${worktreeName}:`)) {
        const service = key.split(':')[1];
        result[service] = port;
      }
    }
    return result;
  }
}
