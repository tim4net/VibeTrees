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
