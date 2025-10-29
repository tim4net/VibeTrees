/**
 * Service configuration registry
 * Single source of truth for service definitions, port ranges, and env var mappings
 */

export const SERVICE_DEFINITIONS = {
  postgres: {
    basePort: 5432,
    envVar: 'POSTGRES_PORT',
    description: 'PostgreSQL database'
  },
  api: {
    basePort: 3000,
    envVar: 'API_PORT',
    description: 'API Gateway service'
  },
  'api-gateway': {
    basePort: 3000,
    envVar: 'API_PORT',
    description: 'API Gateway service (alias)'
  },
  console: {
    basePort: 5173,
    envVar: 'CONSOLE_PORT',
    description: 'Web console'
  },
  temporal: {
    basePort: 7233,
    envVar: 'TEMPORAL_PORT',
    description: 'Temporal workflow engine'
  },
  'temporal-ui': {
    basePort: 8233,
    envVar: 'TEMPORAL_UI_PORT',
    description: 'Temporal web UI'
  },
  minio: {
    basePort: 9000,
    envVar: 'MINIO_PORT',
    description: 'MinIO object storage'
  },
  'minio-console': {
    basePort: 9001,
    envVar: 'MINIO_CONSOLE_PORT',
    description: 'MinIO web console'
  }
};

export class ServiceConfig {
  /**
   * Get service configuration
   * @param {string} serviceName - Service name (supports aliases)
   * @returns {Object} Service config or null
   */
  static get(serviceName) {
    return SERVICE_DEFINITIONS[serviceName] || null;
  }

  /**
   * Get base port for a service
   * @param {string} serviceName - Service name
   * @param {number} defaultPort - Fallback port if service not found
   * @returns {number} Base port
   */
  static getBasePort(serviceName, defaultPort = 3000) {
    const config = this.get(serviceName);
    return config ? config.basePort : defaultPort;
  }

  /**
   * Get environment variable name for a service
   * @param {string} serviceName - Service name
   * @returns {string} Environment variable name (e.g., 'API_PORT')
   */
  static getEnvVar(serviceName) {
    const config = this.get(serviceName);
    if (config) return config.envVar;

    // Fallback: convert service name to env var format
    return serviceName.toUpperCase().replace(/-/g, '_') + '_PORT';
  }

  /**
   * Get all defined services
   * @returns {Array<string>} List of service names
   */
  static getAllServices() {
    return Object.keys(SERVICE_DEFINITIONS);
  }

  /**
   * Check if a service is defined
   * @param {string} serviceName - Service name
   * @returns {boolean}
   */
  static isDefined(serviceName) {
    return serviceName in SERVICE_DEFINITIONS;
  }
}
