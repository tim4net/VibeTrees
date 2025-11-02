/**
 * Compose Inspector
 *
 * Dynamically inspects docker-compose.yml or podman-compose.yml files
 * to discover services, ports, volumes, and networks.
 *
 * CRITICAL: Always uses `docker compose config` or `podman-compose config`
 * as the canonical source, never raw YAML parsing. This handles:
 * - Variable interpolation
 * - Include/extend directives
 * - Version-specific features
 * - Environment variable substitution
 *
 * PERFORMANCE: Uses global singleton cache to avoid re-parsing compose files
 */

import { readFileSync, statSync } from 'fs';
import YAML from 'yaml';
import { TTLCache } from './performance-utils.mjs';

// Global cache for compose configurations (60s TTL)
const COMPOSE_CACHE = new TTLCache(60000, 50);

export class ComposeInspector {
  /**
   * @param {string} composeFilePath - Path to docker-compose.yml
   * @param {ContainerRuntime} runtime - Container runtime instance
   */
  constructor(composeFilePath, runtime) {
    this.composeFilePath = composeFilePath;
    this.runtime = runtime;
    this._config = null;
  }

  /**
   * Get cache key for this compose file
   * Includes file modification time to auto-invalidate on changes
   * @private
   */
  _getCacheKey() {
    try {
      const stats = statSync(this.composeFilePath);
      return `${this.composeFilePath}:${stats.mtimeMs}`;
    } catch (error) {
      // File doesn't exist or can't be accessed, use path only
      return this.composeFilePath;
    }
  }

  /**
   * Load and parse the rendered compose configuration
   * Uses `docker compose config` to get the canonical rendered YAML
   * PERFORMANCE: Checks global cache first, then instance cache
   * @private
   */
  _loadConfig() {
    // Check instance cache first (fastest)
    if (this._config) {
      return this._config;
    }

    // Check global cache (fast)
    const cacheKey = this._getCacheKey();
    const cached = COMPOSE_CACHE.get(cacheKey);
    if (cached) {
      this._config = cached;
      return this._config;
    }

    // Cache miss: parse compose file (slow)
    try {
      // Use `compose config` to get rendered YAML (handles all interpolation)
      const output = this.runtime.execCompose(`-f ${this.composeFilePath} config`, {
        encoding: 'utf-8'
      });

      this._config = YAML.parse(output);

      // Store in global cache
      COMPOSE_CACHE.set(cacheKey, this._config);

      return this._config;
    } catch (error) {
      throw new Error(
        `Failed to parse compose file at ${this.composeFilePath}:\n${error.message}\n\n` +
        'Make sure your docker-compose.yml is valid and all environment variables are set.'
      );
    }
  }

  /**
   * Manually invalidate cache for this compose file
   * Use when you know the file has changed and want immediate reload
   */
  invalidateCache() {
    this._config = null;
    COMPOSE_CACHE.invalidate(this._getCacheKey());
  }

  /**
   * Clear global cache for all compose files
   * @static
   */
  static clearGlobalCache() {
    COMPOSE_CACHE.clear();
  }

  /**
   * Get all services defined in the compose file
   * @returns {Array<{name: string, ports: Array<number>, volumes: Array<string>, image: string, build: string}>}
   */
  getServices() {
    const config = this._loadConfig();

    if (!config.services) {
      return [];
    }

    return Object.entries(config.services).map(([name, service]) => {
      const ports = this._extractPorts(service.ports || []);
      const volumes = this._extractVolumes(service.volumes || []);

      return {
        name,
        ports,
        volumes,
        image: service.image || null,
        build: service.build ? (typeof service.build === 'string' ? service.build : service.build.context) : null
      };
    });
  }

  /**
   * Get ports for a specific service
   * @param {string} serviceName - Name of the service
   * @returns {Array<number>} Array of host ports
   */
  getServicePorts(serviceName) {
    const services = this.getServices();
    const service = services.find(s => s.name === serviceName);
    return service ? service.ports : [];
  }

  /**
   * Check if a service exists
   * @param {string} serviceName - Name of the service
   * @returns {boolean}
   */
  hasService(serviceName) {
    const config = this._loadConfig();
    return config.services && serviceName in config.services;
  }

  /**
   * Get all volume definitions
   * @returns {Array<{name: string, driver: string, external: boolean}>}
   */
  getVolumes() {
    const config = this._loadConfig();

    if (!config.volumes) {
      return [];
    }

    return Object.entries(config.volumes).map(([name, volume]) => ({
      name,
      driver: volume?.driver || 'local',
      external: volume?.external || false
    }));
  }

  /**
   * Get all network definitions
   * @returns {Array<{name: string, driver: string, external: boolean}>}
   */
  getNetworks() {
    const config = this._loadConfig();

    if (!config.networks) {
      return [];
    }

    return Object.entries(config.networks).map(([name, network]) => ({
      name,
      driver: network?.driver || 'bridge',
      external: network?.external || false
    }));
  }

  /**
   * Extract host ports from ports configuration
   * Handles various port formats:
   * - "3000:3000"
   * - "3000"
   * - {target: 3000, published: 3000}
   * @private
   * @param {Array<string|Object>} ports - Ports configuration
   * @returns {Array<number>} Array of host ports
   */
  _extractPorts(ports) {
    if (!Array.isArray(ports)) {
      return [];
    }

    return ports
      .map(port => {
        if (typeof port === 'string') {
          // Format: "host:container" or "port"
          const parts = port.split(':');
          const hostPort = parts.length > 1 ? parts[0] : parts[0];
          return parseInt(hostPort, 10);
        } else if (typeof port === 'object' && port.published) {
          // Format: {target: 3000, published: 3000}
          return parseInt(port.published, 10);
        }
        return null;
      })
      .filter(port => port && !isNaN(port));
  }

  /**
   * Extract volume paths from volumes configuration
   * @private
   * @param {Array<string|Object>} volumes - Volumes configuration
   * @returns {Array<string>} Array of volume names or paths
   */
  _extractVolumes(volumes) {
    if (!Array.isArray(volumes)) {
      return [];
    }

    return volumes.map(volume => {
      if (typeof volume === 'string') {
        // Format: "volume:/path" or "/host/path:/container/path"
        const parts = volume.split(':');
        return parts[0];
      } else if (typeof volume === 'object' && volume.source) {
        // Format: {type: volume, source: volume_name, target: /path}
        return volume.source;
      }
      return null;
    }).filter(Boolean);
  }

  /**
   * Get all services that expose ports (useful for finding web services)
   * @returns {Array<{name: string, ports: Array<number>}>}
   */
  getServicesWithPorts() {
    return this.getServices()
      .filter(service => service.ports.length > 0)
      .map(service => ({
        name: service.name,
        ports: service.ports
      }));
  }

  /**
   * Get all services that use volumes (useful for finding data services)
   * @returns {Array<{name: string, volumes: Array<string>}>}
   */
  getServicesWithVolumes() {
    return this.getServices()
      .filter(service => service.volumes.length > 0)
      .map(service => ({
        name: service.name,
        volumes: service.volumes
      }));
  }

  /**
   * Extract environment variable names from raw docker-compose.yml
   * Parses port definitions like "${MCP_PORT:-3337}:3337" to extract "MCP_PORT"
   * @returns {Object} Map of service:port-key to environment variable names
   * @example
   * {
   *   "mcp-server": "MCP_PORT",
   *   "api-gateway": "API_PORT",
   *   "postgres": "POSTGRES_PORT",
   *   "minio": "MINIO_PORT",
   *   "minio:console": "MINIO_CONSOLE_PORT"
   * }
   */
  getPortEnvVars() {
    try {
      // Parse raw YAML (not rendered config) to preserve variable references
      const rawYaml = readFileSync(this.composeFilePath, 'utf-8');
      const rawConfig = YAML.parse(rawYaml);

      if (!rawConfig.services) {
        return {};
      }

      const envVars = {};

      for (const [serviceName, service] of Object.entries(rawConfig.services)) {
        if (!service.ports || !Array.isArray(service.ports)) {
          continue;
        }

        // Extract ALL port environment variables
        const portEnvVars = [];
        for (const portDef of service.ports) {
          if (typeof portDef === 'string') {
            // Match ${VAR_NAME:-default} or ${VAR_NAME}
            const match = portDef.match(/\$\{([A-Z_]+)(?::-[^}]+)?\}/);
            if (match) {
              portEnvVars.push(match[1]); // Extract VAR_NAME
            }
          }
        }

        // Store env vars with keys that match how ports are allocated
        // First port: service name only
        // Additional ports: service:suffix (matching _getPortSuffix logic)
        if (portEnvVars.length > 0) {
          envVars[serviceName] = portEnvVars[0]; // First port

          // Additional ports need suffix mapping
          if (portEnvVars.length > 1) {
            // Known port suffix mappings (must match _getPortSuffix in worktree-manager.mjs)
            const suffixMappings = {
              'TEMPORAL_UI_PORT': 'ui',
              'MINIO_CONSOLE_PORT': 'console'
            };

            for (let i = 1; i < portEnvVars.length; i++) {
              const envVarName = portEnvVars[i];
              const suffix = suffixMappings[envVarName] || `port${i + 1}`;
              const key = `${serviceName}-${suffix}`;
              envVars[key] = envVarName;
            }
          }
        }
      }

      return envVars;
    } catch (error) {
      console.warn(`[ComposeInspector] Failed to extract port env vars: ${error.message}`);
      return {};
    }
  }

  /**
   * Get a summary of the compose configuration
   * @returns {Object} Summary information
   */
  getSummary() {
    const services = this.getServices();
    const volumes = this.getVolumes();
    const networks = this.getNetworks();

    return {
      serviceCount: services.length,
      services: services.map(s => s.name),
      volumeCount: volumes.length,
      volumes: volumes.map(v => v.name),
      networkCount: networks.length,
      networks: networks.map(n => n.name),
      servicesWithPorts: this.getServicesWithPorts().map(s => ({
        name: s.name,
        ports: s.ports
      }))
    };
  }
}
