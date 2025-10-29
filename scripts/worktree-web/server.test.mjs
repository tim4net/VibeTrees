import { describe, it, expect, beforeEach } from 'vitest';

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
