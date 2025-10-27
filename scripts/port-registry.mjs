/**
 * Port registry for managing dynamic port allocation across worktrees
 *
 * Each worktree needs isolated services with unique ports. This registry
 * tracks port assignments and ensures no conflicts between worktrees.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PORT_REGISTRY_DIR = join(homedir(), '.claude-worktrees');
const PORT_REGISTRY_FILE = join(PORT_REGISTRY_DIR, 'ports.json');

export class PortRegistry {
  constructor() {
    this.ports = this.load();
  }

  load() {
    if (!existsSync(PORT_REGISTRY_DIR)) {
      mkdirSync(PORT_REGISTRY_DIR, { recursive: true });
    }

    if (!existsSync(PORT_REGISTRY_FILE)) {
      return {};
    }

    try {
      const data = readFileSync(PORT_REGISTRY_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  save() {
    writeFileSync(PORT_REGISTRY_FILE, JSON.stringify(this.ports, null, 2));
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
