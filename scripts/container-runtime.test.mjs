/**
 * Tests for Container Runtime Abstraction
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';

// Mock child_process
vi.mock('child_process');

// Import after mocking
const { ContainerRuntime } = await import('./container-runtime.mjs');

describe('ContainerRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Runtime Detection', () => {
    it('should detect Docker when available', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 24.0.0');
        if (cmd === 'docker ps') return Buffer.from('');
        if (cmd === 'docker compose version') return Buffer.from('Docker Compose version 2.0.0');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();

      expect(runtime.getRuntime()).toBe('docker');
      expect(runtime.getComposeCommand()).toBe('docker compose');
      expect(runtime.needsElevation()).toBe(false);
    });

    it('should detect Podman when Docker not available', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') throw new Error('Command not found');
        if (cmd === 'podman --version') return Buffer.from('podman version 4.0.0');
        if (cmd === 'podman info --format json') {
          return Buffer.from(JSON.stringify({ host: { security: { rootless: true } } }));
        }
        if (cmd === 'podman-compose --version') return Buffer.from('podman-compose version 1.0.0');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();

      expect(runtime.getRuntime()).toBe('podman');
      expect(runtime.getComposeCommand()).toBe('podman-compose');
      expect(runtime.needsElevation()).toBe(false);
    });

    it('should throw error when no runtime available', () => {
      execSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      expect(() => new ContainerRuntime()).toThrow('No container runtime found');
    });

    it('should use forced runtime when specified', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'podman --version') return Buffer.from('podman version 4.0.0');
        if (cmd === 'podman info --format json') {
          return Buffer.from(JSON.stringify({ host: { security: { rootless: true } } }));
        }
        if (cmd === 'podman-compose --version') return Buffer.from('podman-compose version 1.0.0');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime({ runtime: 'podman' });

      expect(runtime.getRuntime()).toBe('podman');
    });

    it('should throw error when forced runtime not available', () => {
      execSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      expect(() => new ContainerRuntime({ runtime: 'docker' })).toThrow(
        "Runtime 'docker' was specified but is not available"
      );
    });
  });

  describe('Sudo Detection', () => {
    it('should detect when Docker needs sudo', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 24.0.0');
        if (cmd === 'docker ps') throw new Error('Permission denied');
        if (cmd === 'sudo docker ps') return Buffer.from('');
        if (cmd === 'sudo docker compose version') return Buffer.from('Docker Compose version 2.0.0');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();

      expect(runtime.needsElevation()).toBe(true);
    });

    it('should detect when Docker does not need sudo', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 24.0.0');
        if (cmd === 'docker ps') return Buffer.from('');
        if (cmd === 'docker compose version') return Buffer.from('Docker Compose version 2.0.0');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();

      expect(runtime.needsElevation()).toBe(false);
    });

    it('should use forced sudo setting when specified', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 24.0.0');
        if (cmd === 'sudo docker compose version') return Buffer.from('Docker Compose version 2.0.0');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime({ sudo: true });

      expect(runtime.needsElevation()).toBe(true);
    });

    it('should detect rootless Podman does not need sudo', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') throw new Error('Command not found');
        if (cmd === 'podman --version') return Buffer.from('podman version 4.0.0');
        if (cmd === 'podman info --format json') {
          return Buffer.from(JSON.stringify({ host: { security: { rootless: true } } }));
        }
        if (cmd === 'podman-compose --version') return Buffer.from('podman-compose version 1.0.0');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();

      expect(runtime.needsElevation()).toBe(false);
    });

    it('should detect rootful Podman needs sudo', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') throw new Error('Command not found');
        if (cmd === 'podman --version') return Buffer.from('podman version 4.0.0');
        if (cmd === 'podman info --format json') {
          return Buffer.from(JSON.stringify({ host: { security: { rootless: false } } }));
        }
        if (cmd === 'sudo podman-compose --version') return Buffer.from('podman-compose version 1.0.0');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();

      expect(runtime.needsElevation()).toBe(true);
    });
  });

  describe('Compose Command Detection', () => {
    it('should use "docker compose" for modern Docker', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 24.0.0');
        if (cmd === 'docker ps') return Buffer.from('');
        if (cmd === 'docker compose version') return Buffer.from('Docker Compose version 2.0.0');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();

      expect(runtime.getComposeCommand()).toBe('docker compose');
    });

    it('should fallback to "docker-compose" for legacy Docker', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 20.0.0');
        if (cmd === 'docker ps') return Buffer.from('');
        if (cmd === 'docker compose version') throw new Error('Command not found');
        if (cmd === 'docker-compose --version') return Buffer.from('docker-compose version 1.29.0');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();

      expect(runtime.getComposeCommand()).toBe('docker-compose');
    });

    it('should throw error when compose not available', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 24.0.0');
        if (cmd === 'docker ps') return Buffer.from('');
        throw new Error('Command not found');
      });

      expect(() => new ContainerRuntime()).toThrow('Docker Compose is not available');
    });
  });

  describe('Command Execution', () => {
    it('should execute docker commands without sudo when not needed', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 24.0.0');
        if (cmd === 'docker ps') return Buffer.from('');
        if (cmd === 'docker compose version') return Buffer.from('Docker Compose version 2.0.0');
        if (cmd === 'docker ps -a') return Buffer.from('CONTAINER ID   IMAGE');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();
      runtime.exec('ps -a');

      expect(execSync).toHaveBeenLastCalledWith('docker ps -a', {});
    });

    it('should execute docker commands with sudo when needed', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 24.0.0');
        if (cmd === 'docker ps') throw new Error('Permission denied');
        if (cmd === 'sudo docker ps') return Buffer.from('');
        if (cmd === 'sudo docker compose version') return Buffer.from('Docker Compose version 2.0.0');
        if (cmd === 'sudo docker ps -a') return Buffer.from('CONTAINER ID   IMAGE');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();
      runtime.exec('ps -a');

      expect(execSync).toHaveBeenLastCalledWith('sudo docker ps -a', {});
    });

    it('should execute compose commands correctly', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 24.0.0');
        if (cmd === 'docker ps') return Buffer.from('');
        if (cmd === 'docker compose version') return Buffer.from('Docker Compose version 2.0.0');
        if (cmd === 'docker compose up -d') return Buffer.from('Creating services...');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();
      runtime.execCompose('up -d');

      expect(execSync).toHaveBeenLastCalledWith('docker compose up -d', {});
    });

    it('should pass through execSync options', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 24.0.0');
        if (cmd === 'docker ps') return Buffer.from('');
        if (cmd === 'docker compose version') return Buffer.from('Docker Compose version 2.0.0');
        return Buffer.from('');
      });

      const runtime = new ContainerRuntime();
      const options = { cwd: '/some/path', encoding: 'utf-8' };
      runtime.execCompose('ps', options);

      expect(execSync).toHaveBeenLastCalledWith('docker compose ps', options);
    });
  });

  describe('Runtime Information', () => {
    it('should return correct runtime info', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'docker --version') return Buffer.from('Docker version 24.0.0');
        if (cmd === 'docker ps') return Buffer.from('');
        if (cmd === 'docker compose version') return Buffer.from('Docker Compose version 2.0.0');
        throw new Error('Command not found');
      });

      const runtime = new ContainerRuntime();
      const info = runtime.getInfo();

      expect(info).toEqual({
        runtime: 'docker',
        composeCommand: 'docker compose',
        needsSudo: false
      });
    });
  });
});
