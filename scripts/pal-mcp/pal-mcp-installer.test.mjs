/**
 * Tests for PalMcpInstaller
 *
 * Tests cover:
 * - uvx detection across common paths
 * - Python version checking
 * - Installation readiness verification
 * - Command generation for MCP config
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PalMcpInstaller } from './pal-mcp-installer.mjs';

describe('PalMcpInstaller', () => {
  let installer;
  let mockExecSync;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecSync = vi.fn();
  });

  describe('constructor', () => {
    it('should initialize with default repository URL', () => {
      installer = new PalMcpInstaller();
      expect(installer.repoUrl).toBe('git+https://github.com/BeehiveInnovations/pal-mcp-server.git');
    });

    it('should accept custom repository URL via options', () => {
      installer = new PalMcpInstaller({ repoUrl: 'git+https://github.com/custom/repo.git' });
      expect(installer.repoUrl).toBe('git+https://github.com/custom/repo.git');
    });

    it('should accept custom execSync via dependency injection', () => {
      const customExec = vi.fn();
      installer = new PalMcpInstaller({ execSync: customExec });
      expect(installer.execSync).toBe(customExec);
    });
  });

  describe('findUvx', () => {
    beforeEach(() => {
      installer = new PalMcpInstaller({ execSync: mockExecSync });
    });

    it('should return uvx path when found in PATH', () => {
      mockExecSync.mockReturnValue('uv 0.5.0');

      const result = installer.findUvx();

      expect(result).toBe('uvx');
      expect(mockExecSync).toHaveBeenCalledWith('uvx --version', { encoding: 'utf8', stdio: 'pipe' });
    });

    it('should search ~/.local/bin/uvx when not in PATH', () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'uvx --version') {
          throw new Error('command not found');
        }
        if (cmd.includes('.local/bin/uvx')) {
          return 'uv 0.5.0';
        }
        throw new Error('not found');
      });

      const result = installer.findUvx();

      expect(result).toBe(`${process.env.HOME}/.local/bin/uvx`);
    });

    it('should search /opt/homebrew/bin/uvx for macOS', () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === '/opt/homebrew/bin/uvx --version') {
          return 'uv 0.5.0';
        }
        throw new Error('not found');
      });

      const result = installer.findUvx();

      expect(result).toBe('/opt/homebrew/bin/uvx');
    });

    it('should return null when uvx not found anywhere', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found');
      });

      const result = installer.findUvx();

      expect(result).toBeNull();
    });
  });

  describe('checkPython', () => {
    beforeEach(() => {
      installer = new PalMcpInstaller({ execSync: mockExecSync });
    });

    it('should return available=true for Python 3.12', () => {
      mockExecSync.mockReturnValue('Python 3.12.0');

      const result = installer.checkPython();

      expect(result.available).toBe(true);
      expect(result.version).toBe('3.12');
    });

    it('should return available=true for Python 3.10', () => {
      mockExecSync.mockReturnValue('Python 3.10.5');

      const result = installer.checkPython();

      expect(result.available).toBe(true);
      expect(result.version).toBe('3.10');
    });

    it('should return available=false for Python 3.9', () => {
      mockExecSync.mockReturnValue('Python 3.9.7');

      const result = installer.checkPython();

      expect(result.available).toBe(false);
      expect(result.version).toBe('3.9');
      expect(result.error).toBe('Python 3.10+ required');
    });

    it('should return available=false when Python not installed', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found: python3');
      });

      const result = installer.checkPython();

      expect(result.available).toBe(false);
      expect(result.error).toBe('Python not found');
    });

    it('should handle malformed version output', () => {
      mockExecSync.mockReturnValue('unexpected output');

      const result = installer.checkPython();

      expect(result.available).toBe(false);
      expect(result.error).toBe('Could not parse Python version');
    });
  });

  describe('getCommand', () => {
    it('should return uvx command when method is uvx', () => {
      installer = new PalMcpInstaller();

      const command = installer.getCommand('uvx');

      expect(command).toHaveLength(2);
      expect(command[0]).toBe('-c');
      expect(command[1]).toContain('uvx');
      expect(command[1]).toContain('BeehiveInnovations/pal-mcp-server');
      expect(command[1]).toContain('pal-mcp-server');
    });

    it('should use custom repository URL in uvx command', () => {
      installer = new PalMcpInstaller({ repoUrl: 'git+https://github.com/custom/repo.git' });

      const command = installer.getCommand('uvx');

      expect(command[1]).toContain('custom/repo');
    });

    it('should return pip command when method is pip', () => {
      installer = new PalMcpInstaller();

      const command = installer.getCommand('pip');

      expect(command).toHaveLength(2);
      expect(command[0]).toBe('-c');
      expect(command[1]).toContain('python3 -m pal_mcp_server');
    });

    it('should return pipx command when method is pipx', () => {
      installer = new PalMcpInstaller();

      const command = installer.getCommand('pipx');

      expect(command).toHaveLength(2);
      expect(command[0]).toBe('-c');
      expect(command[1]).toBe('pal-mcp-server');
    });
  });

  describe('ensureInstalled', () => {
    beforeEach(() => {
      installer = new PalMcpInstaller({ execSync: mockExecSync });
    });

    it('should return success when Python and uvx are available', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'python3 --version') {
          return 'Python 3.12.0';
        }
        if (cmd === 'uvx --version') {
          return 'uv 0.5.0';
        }
        throw new Error('not found');
      });

      const result = await installer.ensureInstalled();

      expect(result.success).toBe(true);
      expect(result.method).toBe('uvx');
      expect(result.path).toBe('uvx');
      expect(result.pythonVersion).toBe('3.12');
      expect(result.command).toBeDefined();
    });

    it('should fail when Python is not available', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'python3 --version') {
          throw new Error('command not found');
        }
        return 'uv 0.5.0';
      });

      const result = await installer.ensureInstalled();

      expect(result.success).toBe(false);
      expect(result.error).toBe('PYTHON_NOT_FOUND');
      expect(result.recoverable).toBe(false);
    });

    it('should fail when Python version is too old', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'python3 --version') {
          return 'Python 3.8.10';
        }
        return 'uv 0.5.0';
      });

      const result = await installer.ensureInstalled();

      expect(result.success).toBe(false);
      expect(result.error).toBe('PYTHON_NOT_FOUND');
    });

    it('should fail when no installer is available', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'python3 --version') {
          return 'Python 3.12.0';
        }
        // All installers fail
        throw new Error('command not found');
      });

      const result = await installer.ensureInstalled(false); // Don't try to install

      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_INSTALLER');
      expect(result.message).toContain('No package manager found');
      expect(result.recoverable).toBe(false);
    });

    it('should succeed with pip when uvx unavailable but pip installed', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'python3 --version') return 'Python 3.12.0';
        if (cmd === 'pip3 --version') return 'pip 24.0';
        if (cmd === 'pip3 show pal-mcp-server') return 'Name: pal-mcp-server\nVersion: 9.4.0';
        throw new Error('command not found');
      });

      const result = await installer.ensureInstalled();

      expect(result.success).toBe(true);
      expect(result.method).toBe('pip');
      expect(result.version).toBe('9.4.0');
    });
  });

  describe('ensureReady', () => {
    it('should be an alias for ensureInstalled', async () => {
      installer = new PalMcpInstaller({ execSync: mockExecSync });
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'python3 --version') return 'Python 3.12.0';
        if (cmd === 'uvx --version') return 'uv 0.5.0';
        throw new Error('not found');
      });

      const result = await installer.ensureReady();

      expect(result.success).toBe(true);
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      installer = new PalMcpInstaller({ execSync: mockExecSync });
    });

    it('should return full status when uvx is available', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'python3 --version') return 'Python 3.12.0';
        if (cmd === 'uvx --version') return 'uv 0.5.0';
        throw new Error('not found');
      });

      const status = await installer.getStatus();

      expect(status.pythonAvailable).toBe(true);
      expect(status.pythonVersion).toBe('3.12');
      expect(status.method).toBe('uvx');
      expect(status.uvxAvailable).toBe(true);
      expect(status.uvxPath).toBe('uvx');
      expect(status.ready).toBe(true);
    });

    it('should return ready=false when Python missing', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'python3 --version') {
          throw new Error('not found');
        }
        if (cmd === 'uvx --version') return 'uv 0.5.0';
        throw new Error('not found');
      });

      const status = await installer.getStatus();

      expect(status.pythonAvailable).toBe(false);
      expect(status.uvxAvailable).toBe(true);
      expect(status.ready).toBe(false);
    });

    it('should return ready=true with pip when uvx missing but pip installed', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'python3 --version') return 'Python 3.12.0';
        if (cmd === 'pip3 --version') return 'pip 24.0';
        if (cmd === 'pip3 show pal-mcp-server') return 'Name: pal-mcp-server\nVersion: 9.4.0';
        throw new Error('not found');
      });

      const status = await installer.getStatus();

      expect(status.pythonAvailable).toBe(true);
      expect(status.method).toBe('pip');
      expect(status.uvxAvailable).toBe(false);
      expect(status.ready).toBe(true);
    });

    it('should return ready=false when nothing installed', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'python3 --version') return 'Python 3.12.0';
        throw new Error('not found');
      });

      const status = await installer.getStatus();

      expect(status.pythonAvailable).toBe(true);
      expect(status.method).toBe(null);
      expect(status.ready).toBe(false);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      installer = new PalMcpInstaller({ execSync: mockExecSync });
    });

    it('should return success with auto-updates message for uvx', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'uvx --version') return 'uv 0.5.0';
        throw new Error('not found');
      });

      const result = await installer.update();

      expect(result.success).toBe(true);
      expect(result.message).toContain('auto-updates');
    });

    it('should update via pip when installed via pip', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd === 'pip3 --version') return 'pip 24.0';
        if (cmd === 'pip3 show pal-mcp-server') return 'Name: pal-mcp-server\nVersion: 9.4.2';
        if (cmd.includes('pip3 install --user --upgrade')) return '';
        throw new Error('not found');
      });

      const result = await installer.update();

      expect(result.success).toBe(true);
      expect(result.version).toBe('9.4.2');
    });

    it('should fail when not installed', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const result = await installer.update();

      expect(result.success).toBe(false);
      expect(result.error).toBe('NOT_INSTALLED');
    });
  });
});
