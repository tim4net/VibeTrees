/**
 * Tests for Compose Inspector
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock runtime
const createMockRuntime = (composeOutput) => ({
  execCompose: vi.fn((command, options) => {
    if (command.includes('config')) {
      return composeOutput;
    }
    throw new Error('Unexpected command');
  })
});

// Import after mocking
const { ComposeInspector } = await import('./compose-inspector.mjs');

describe('ComposeInspector', () => {
  // Clear global cache before each test to prevent test pollution
  beforeEach(() => {
    ComposeInspector.clearGlobalCache();
  });

  afterEach(() => {
    ComposeInspector.clearGlobalCache();
  });
  describe('Service Discovery', () => {
    it('should discover all services from compose config', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
    ports:
      - "3000:3000"
  db:
    image: postgres:15
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
  worker:
    image: node:18
volumes:
  postgres-data:
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const services = inspector.getServices();

      expect(services).toHaveLength(3);
      expect(services.map(s => s.name)).toEqual(['api', 'db', 'worker']);
    });

    it('should extract service ports correctly', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
    ports:
      - "3000:3000"
      - "3001:3001"
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const services = inspector.getServices();
      const apiService = services.find(s => s.name === 'api');

      expect(apiService.ports).toEqual([3000, 3001]);
    });

    it('should extract service volumes correctly', () => {
      const composeOutput = `
version: '3.8'
services:
  db:
    image: postgres:15
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./data:/backup
volumes:
  postgres-data:
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const services = inspector.getServices();
      const dbService = services.find(s => s.name === 'db');

      expect(dbService.volumes).toEqual(['postgres-data', './data']);
    });

    it('should handle services without ports or volumes', () => {
      const composeOutput = `
version: '3.8'
services:
  worker:
    image: node:18
    command: npm run worker
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const services = inspector.getServices();
      const workerService = services.find(s => s.name === 'worker');

      expect(workerService.ports).toEqual([]);
      expect(workerService.volumes).toEqual([]);
    });

    it('should handle object-style port definitions', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
    ports:
      - target: 3000
        published: 3000
        protocol: tcp
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const services = inspector.getServices();
      const apiService = services.find(s => s.name === 'api');

      expect(apiService.ports).toEqual([3000]);
    });

    it('should handle single port format (no host mapping)', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
    ports:
      - "3000"
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const services = inspector.getServices();
      const apiService = services.find(s => s.name === 'api');

      expect(apiService.ports).toEqual([3000]);
    });
  });

  describe('Service Lookup', () => {
    it('should get ports for specific service', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
    ports:
      - "3000:3000"
  db:
    image: postgres:15
    ports:
      - "5432:5432"
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const apiPorts = inspector.getServicePorts('api');
      const dbPorts = inspector.getServicePorts('db');

      expect(apiPorts).toEqual([3000]);
      expect(dbPorts).toEqual([5432]);
    });

    it('should return empty array for non-existent service', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const ports = inspector.getServicePorts('nonexistent');

      expect(ports).toEqual([]);
    });

    it('should check if service exists', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      expect(inspector.hasService('api')).toBe(true);
      expect(inspector.hasService('nonexistent')).toBe(false);
    });
  });

  describe('Volume Discovery', () => {
    it('should discover all volumes', () => {
      const composeOutput = `
version: '3.8'
services:
  db:
    image: postgres:15
    volumes:
      - postgres-data:/var/lib/postgresql/data
volumes:
  postgres-data:
    driver: local
  redis-data:
    driver: local
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const volumes = inspector.getVolumes();

      expect(volumes).toHaveLength(2);
      expect(volumes.map(v => v.name)).toContain('postgres-data');
      expect(volumes.map(v => v.name)).toContain('redis-data');
    });

    it('should handle external volumes', () => {
      const composeOutput = `
version: '3.8'
services:
  db:
    image: postgres:15
volumes:
  external-vol:
    external: true
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const volumes = inspector.getVolumes();
      const externalVol = volumes.find(v => v.name === 'external-vol');

      expect(externalVol.external).toBe(true);
    });

    it('should return empty array when no volumes defined', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const volumes = inspector.getVolumes();

      expect(volumes).toEqual([]);
    });
  });

  describe('Network Discovery', () => {
    it('should discover all networks', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const networks = inspector.getNetworks();

      expect(networks).toHaveLength(2);
      expect(networks.map(n => n.name)).toContain('frontend');
      expect(networks.map(n => n.name)).toContain('backend');
    });

    it('should handle external networks', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
networks:
  external-net:
    external: true
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const networks = inspector.getNetworks();
      const externalNet = networks.find(n => n.name === 'external-net');

      expect(externalNet.external).toBe(true);
    });
  });

  describe('Filtered Queries', () => {
    it('should get only services with ports', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
    ports:
      - "3000:3000"
  worker:
    image: node:18
  db:
    image: postgres:15
    ports:
      - "5432:5432"
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const servicesWithPorts = inspector.getServicesWithPorts();

      expect(servicesWithPorts).toHaveLength(2);
      expect(servicesWithPorts.map(s => s.name)).toEqual(['api', 'db']);
    });

    it('should get only services with volumes', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
  db:
    image: postgres:15
    volumes:
      - postgres-data:/var/lib/postgresql/data
  redis:
    image: redis:7
    volumes:
      - redis-data:/data
volumes:
  postgres-data:
  redis-data:
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const servicesWithVolumes = inspector.getServicesWithVolumes();

      expect(servicesWithVolumes).toHaveLength(2);
      expect(servicesWithVolumes.map(s => s.name)).toEqual(['db', 'redis']);
    });
  });

  describe('Summary', () => {
    it('should provide complete summary', () => {
      const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
    ports:
      - "3000:3000"
  db:
    image: postgres:15
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
volumes:
  postgres-data:
networks:
  frontend:
`;

      const runtime = createMockRuntime(composeOutput);
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const summary = inspector.getSummary();

      expect(summary.serviceCount).toBe(2);
      expect(summary.services).toEqual(['api', 'db']);
      expect(summary.volumeCount).toBe(1);
      expect(summary.volumes).toEqual(['postgres-data']);
      expect(summary.networkCount).toBe(1);
      expect(summary.networks).toEqual(['frontend']);
      expect(summary.servicesWithPorts).toEqual([
        { name: 'api', ports: [3000] },
        { name: 'db', ports: [5432] }
      ]);
    });
  });

  describe('Port Environment Variables', () => {
    it('should extract port env var names from raw YAML', async () => {
      // Note: getPortEnvVars() reads the raw file directly, not using runtime
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      // Create a temp file with port env vars
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-test-'));
      const composePath = path.join(tmpDir, 'docker-compose.yml');

      const composeContent = `
services:
  mcp-server:
    image: test
    ports:
      - "\${MCP_PORT:-3337}:3337"
  api-gateway:
    image: test
    ports:
      - "\${API_PORT:-3000}:3000"
  postgres:
    image: test
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
`;

      fs.writeFileSync(composePath, composeContent);

      const runtime = createMockRuntime(''); // Not used for getPortEnvVars
      const inspector = new ComposeInspector(composePath, runtime);
      const portEnvVars = inspector.getPortEnvVars();

      expect(portEnvVars).toEqual({
        'mcp-server': 'MCP_PORT',
        'api-gateway': 'API_PORT',
        'postgres': 'POSTGRES_PORT'
      });

      // Cleanup
      fs.unlinkSync(composePath);
      fs.rmdirSync(tmpDir);
    });

    it('should handle services without port env vars', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-test-'));
      const composePath = path.join(tmpDir, 'docker-compose.yml');

      const composeContent = `
services:
  api:
    image: test
    ports:
      - "3000:3000"
  db:
    image: postgres
`;

      fs.writeFileSync(composePath, composeContent);

      const runtime = createMockRuntime('');
      const inspector = new ComposeInspector(composePath, runtime);
      const portEnvVars = inspector.getPortEnvVars();

      expect(portEnvVars).toEqual({});

      // Cleanup
      fs.unlinkSync(composePath);
      fs.rmdirSync(tmpDir);
    });

    it('should extract ALL port env vars for multi-port services', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-test-'));
      const composePath = path.join(tmpDir, 'docker-compose.yml');

      // Multi-port services like MinIO and Temporal
      const composeContent = `
services:
  minio:
    image: minio/minio
    ports:
      - "\${MINIO_PORT:-9000}:9000"
      - "\${MINIO_CONSOLE_PORT:-9001}:9001"
  temporal:
    image: temporalio/auto-setup
    ports:
      - "\${TEMPORAL_PORT:-7233}:7233"
      - "\${TEMPORAL_UI_PORT:-8233}:8233"
  single-port:
    image: postgres
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
`;

      fs.writeFileSync(composePath, composeContent);

      const runtime = createMockRuntime('');
      const inspector = new ComposeInspector(composePath, runtime);
      const portEnvVars = inspector.getPortEnvVars();

      // Should extract all ports with proper keys
      expect(portEnvVars).toEqual({
        'minio': 'MINIO_PORT',
        'minio-console': 'MINIO_CONSOLE_PORT',
        'temporal': 'TEMPORAL_PORT',
        'temporal-ui': 'TEMPORAL_UI_PORT',
        'single-port': 'POSTGRES_PORT'
      });

      // Cleanup
      fs.unlinkSync(composePath);
      fs.rmdirSync(tmpDir);
    });
  });

  describe('Error Handling', () => {
    it('should throw helpful error when compose config fails', () => {
      const runtime = {
        execCompose: vi.fn(() => {
          throw new Error('Compose file not found');
        })
      };

      const inspector = new ComposeInspector('nonexistent.yml', runtime);

      expect(() => inspector.getServices()).toThrow('Failed to parse compose file');
    });

    it('should handle empty compose file', () => {
      const runtime = createMockRuntime('version: "3.8"\n');
      const inspector = new ComposeInspector('docker-compose.yml', runtime);

      const services = inspector.getServices();

      expect(services).toEqual([]);
    });
  });
});
