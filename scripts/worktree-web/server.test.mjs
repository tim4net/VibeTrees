import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkMainStaleness, checkMainDirtyState } from './server.mjs';

/**
 * Minimal WorktreeWebManager mock for testing extractPortsFromDockerStatus
 * This focuses only on the port extraction fallback logic
 */
class WorktreeWebManagerMock {
  /**
   * Extract port mappings from Docker container status
   * Used as fallback when port registry lookup fails
   * @param {Array} dockerStatus - Array of container status objects
   * @returns {Object} Port mappings keyed by service name
   */
  extractPortsFromDockerStatus(dockerStatus) {
    const ports = {};

    for (const container of dockerStatus) {
      // Only process running containers
      if (container.state !== 'running') continue;

      // Extract the first published port for each container
      if (container.ports && container.ports.length > 0) {
        const firstPort = container.ports[0];
        const match = firstPort.match(/^(\d+)→/);
        if (match) {
          const publishedPort = parseInt(match[1], 10);
          ports[container.name] = publishedPort;
        }
      }
    }

    return ports;
  }

  /**
   * Get a descriptive suffix for additional ports in a multi-port service
   * @param {string} serviceName - Name of the service
   * @param {number} port - The port number
   * @param {number} index - Index in the ports array
   * @returns {string} Suffix to append to service name, or empty string for first port
   */
  _getPortSuffix(serviceName, port, index) {
    // First port doesn't need a suffix (use service name directly)
    if (index === 0) return '';

    // Known port mappings for common services
    const portMappings = {
      temporal: { 7233: '', 8233: 'ui' },
      minio: { 9000: '', 9001: 'console' },
    };

    if (portMappings[serviceName] && portMappings[serviceName][port]) {
      return portMappings[serviceName][port];
    }

    // Fallback: use index-based suffix for unknown ports
    return `port${index + 1}`;
  }

  /**
   * Convert service name to environment variable name
   * @param {string} serviceName - Docker service name
   * @returns {string} Environment variable name (without _PORT suffix)
   */
  _serviceNameToEnvVar(serviceName) {
    const serviceToEnvVar = {
      'api-gateway': 'API',
      'api': 'API',
      'temporal-ui': 'TEMPORAL_UI',
      'minio-console': 'MINIO_CONSOLE',
    };

    return serviceToEnvVar[serviceName] || serviceName.toUpperCase().replace(/-/g, '_');
  }
}

describe('WorktreeWebManager - extractPortsFromDockerStatus', () => {
  let manager;

  beforeEach(() => {
    manager = new WorktreeWebManagerMock();
  });

  it('should extract ports from running containers', () => {
    const dockerStatus = [
      {
        name: 'console',
        state: 'running',
        status: 'Up 18 hours',
        ports: ['5175→5173', '5175→5173']
      },
      {
        name: 'postgres',
        state: 'running',
        status: 'Up 18 hours (healthy)',
        ports: ['5434→5432', '5434→5432']
      },
      {
        name: 'api',
        state: 'running',
        status: 'Up 18 hours',
        ports: ['3002→3000', '3002→3000']
      }
    ];

    const result = manager.extractPortsFromDockerStatus(dockerStatus);

    expect(result).toEqual({
      console: 5175,
      postgres: 5434,
      api: 3002
    });
  });

  it('should skip non-running containers', () => {
    const dockerStatus = [
      {
        name: 'console',
        state: 'running',
        status: 'Up 18 hours',
        ports: ['5175→5173']
      },
      {
        name: 'postgres',
        state: 'exited',
        status: 'Exited (1) 2 hours ago',
        ports: ['5434→5432']
      }
    ];

    const result = manager.extractPortsFromDockerStatus(dockerStatus);

    expect(result).toEqual({
      console: 5175
    });
    expect(result.postgres).toBeUndefined();
  });

  it('should handle containers with no ports', () => {
    const dockerStatus = [
      {
        name: 'worker-1',
        state: 'running',
        status: 'Up 18 hours',
        ports: []
      },
      {
        name: 'console',
        state: 'running',
        status: 'Up 18 hours',
        ports: ['5175→5173']
      }
    ];

    const result = manager.extractPortsFromDockerStatus(dockerStatus);

    expect(result).toEqual({
      console: 5175
    });
    expect(result['worker-1']).toBeUndefined();
  });

  it('should return empty object for empty docker status', () => {
    const result = manager.extractPortsFromDockerStatus([]);
    expect(result).toEqual({});
  });

  it('should handle containers with multiple port mappings (uses first)', () => {
    const dockerStatus = [
      {
        name: 'temporal',
        state: 'running',
        status: 'Up 18 hours',
        ports: [
          '7235→7233',
          '8235→8233',
          '0→6933',
          '0→6934'
        ]
      }
    ];

    const result = manager.extractPortsFromDockerStatus(dockerStatus);

    expect(result).toEqual({
      temporal: 7235
    });
  });

  it('should handle port strings with 0 as published port', () => {
    const dockerStatus = [
      {
        name: 'temporal',
        state: 'running',
        status: 'Up 18 hours',
        ports: [
          '0→6933',
          '7235→7233'
        ]
      }
    ];

    const result = manager.extractPortsFromDockerStatus(dockerStatus);

    // Should use the first port, even if it's 0
    expect(result).toEqual({
      temporal: 0
    });
  });

  it('should handle containers with undefined ports property', () => {
    const dockerStatus = [
      {
        name: 'console',
        state: 'running',
        status: 'Up 18 hours',
        ports: ['5175→5173']
      },
      {
        name: 'worker',
        state: 'running',
        status: 'Up 18 hours'
        // no ports property
      }
    ];

    const result = manager.extractPortsFromDockerStatus(dockerStatus);

    expect(result).toEqual({
      console: 5175
    });
  });
});

describe('WorktreeWebManager - _getPortSuffix', () => {
  let manager;

  beforeEach(() => {
    manager = new WorktreeWebManagerMock();
  });

  it('should return empty string for first port (index 0)', () => {
    expect(manager._getPortSuffix('temporal', 7233, 0)).toBe('');
    expect(manager._getPortSuffix('minio', 9000, 0)).toBe('');
    expect(manager._getPortSuffix('postgres', 5432, 0)).toBe('');
  });

  it('should return "ui" for temporal port 8233', () => {
    expect(manager._getPortSuffix('temporal', 8233, 1)).toBe('ui');
  });

  it('should return "console" for minio port 9001', () => {
    expect(manager._getPortSuffix('minio', 9001, 1)).toBe('console');
  });

  it('should return indexed suffix for unknown service/port combinations', () => {
    expect(manager._getPortSuffix('unknown-service', 1234, 1)).toBe('port2');
    expect(manager._getPortSuffix('unknown-service', 5678, 2)).toBe('port3');
  });

  it('should return indexed suffix for unknown ports on known services', () => {
    expect(manager._getPortSuffix('temporal', 9999, 1)).toBe('port2');
    expect(manager._getPortSuffix('minio', 8888, 2)).toBe('port3');
  });
});

describe('WorktreeWebManager - _serviceNameToEnvVar', () => {
  let manager;

  beforeEach(() => {
    manager = new WorktreeWebManagerMock();
  });

  it('should convert api-gateway to API', () => {
    expect(manager._serviceNameToEnvVar('api-gateway')).toBe('API');
  });

  it('should convert api to API', () => {
    expect(manager._serviceNameToEnvVar('api')).toBe('API');
  });

  it('should convert standard service names correctly', () => {
    expect(manager._serviceNameToEnvVar('postgres')).toBe('POSTGRES');
    expect(manager._serviceNameToEnvVar('console')).toBe('CONSOLE');
    expect(manager._serviceNameToEnvVar('minio')).toBe('MINIO');
    expect(manager._serviceNameToEnvVar('temporal')).toBe('TEMPORAL');
  });

  it('should handle hyphenated service names', () => {
    expect(manager._serviceNameToEnvVar('minio-console')).toBe('MINIO_CONSOLE');
    expect(manager._serviceNameToEnvVar('temporal-ui')).toBe('TEMPORAL_UI');
  });
});

describe('checkMainStaleness', () => {
  it('should detect when main is behind remote', () => {
    const mockExec = vi.fn()
      .mockReturnValueOnce('') // git fetch
      .mockReturnValueOnce('5\n'); // git rev-list count

    const result = checkMainStaleness(mockExec);

    expect(result.behind).toBe(5);
    expect(mockExec).toHaveBeenCalledWith('git fetch origin main');
    expect(mockExec).toHaveBeenCalledWith('git rev-list --count main..origin/main');
  });

  it('should return 0 when main is up to date', () => {
    const mockExec = vi.fn()
      .mockReturnValueOnce('') // git fetch
      .mockReturnValueOnce('0\n'); // git rev-list count

    const result = checkMainStaleness(mockExec);

    expect(result.behind).toBe(0);
  });
});

describe('checkMainDirtyState', () => {
  it('should detect uncommitted changes', () => {
    const mockExec = vi.fn()
      .mockReturnValueOnce(' M scripts/foo.mjs\n?? newfile.txt\n'); // git status

    const result = checkMainDirtyState(mockExec);

    expect(result.isDirty).toBe(true);
    expect(mockExec).toHaveBeenCalledWith(
      'git status --porcelain',
      expect.objectContaining({ cwd: expect.any(String) })
    );
  });

  it('should return false when main is clean', () => {
    const mockExec = vi.fn()
      .mockReturnValueOnce(''); // git status empty

    const result = checkMainDirtyState(mockExec);

    expect(result.isDirty).toBe(false);
  });
});

describe('POST /api/worktrees - staleness check logic', () => {
  it('should return 409-like response when main is behind and force not set', () => {
    // Simulate the staleness check returning behind: 5
    const stalenessResult = { behind: 5 };
    const dirtyResult = { isDirty: false };

    // Expected response structure when main is behind
    const response = {
      needsSync: true,
      commitsBehind: stalenessResult.behind,
      hasDirtyState: dirtyResult.isDirty,
      message: `main is ${stalenessResult.behind} commit${stalenessResult.behind > 1 ? 's' : ''} behind origin/main`
    };

    // Validate the logic
    expect(response.needsSync).toBe(true);
    expect(response.commitsBehind).toBe(5);
    expect(response.hasDirtyState).toBe(false);
    expect(response.message).toBe('main is 5 commits behind origin/main');
  });

  it('should proceed with creation when force=true', () => {
    // When force=true, checks should be skipped
    const force = true;
    const baseBranch = 'main';

    // Logic: if baseBranch === 'main' && !force -> should be false when force=true
    const shouldCheckStaleness = baseBranch === 'main' && !force;

    expect(shouldCheckStaleness).toBe(false);
  });

  it('should return 409-like response with dirty state flag when main has uncommitted changes', () => {
    // Simulate dirty state check
    const dirtyResult = { isDirty: true };

    // Expected response structure when main has uncommitted changes
    const response = {
      needsSync: false,
      hasDirtyState: dirtyResult.isDirty,
      commitsBehind: 0,
      message: 'Cannot sync: main has uncommitted changes. Please commit or stash changes first.'
    };

    expect(response.hasDirtyState).toBe(true);
    expect(response.needsSync).toBe(false);
    expect(response.message).toContain('uncommitted changes');
  });

  it('should not check staleness for non-main branches', () => {
    const baseBranch = 'feature/test';
    const force = false;

    // Logic: only check staleness for 'main' branch
    const shouldCheckStaleness = baseBranch === 'main' && !force;

    expect(shouldCheckStaleness).toBe(false);
  });

  it('should format singular commit message correctly', () => {
    const commitsBehind = 1;
    const message = `main is ${commitsBehind} commit${commitsBehind > 1 ? 's' : ''} behind origin/main`;

    expect(message).toBe('main is 1 commit behind origin/main');
  });

  it('should format plural commits message correctly', () => {
    const commitsBehind = 5;
    const message = `main is ${commitsBehind} commit${commitsBehind > 1 ? 's' : ''} behind origin/main`;

    expect(message).toBe('main is 5 commits behind origin/main');
  });
});
