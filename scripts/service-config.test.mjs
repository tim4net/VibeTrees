import { describe, it, expect } from 'vitest';
import { ServiceConfig, SERVICE_DEFINITIONS } from './service-config.mjs';

describe('ServiceConfig', () => {
  describe('get', () => {
    it('should return service config', () => {
      const config = ServiceConfig.get('postgres');
      expect(config).toEqual({
        basePort: 5432,
        envVar: 'POSTGRES_PORT',
        description: 'PostgreSQL database'
      });
    });

    it('should return null for unknown service', () => {
      expect(ServiceConfig.get('unknown')).toBeNull();
    });
  });

  describe('getBasePort', () => {
    it('should return base port for known service', () => {
      expect(ServiceConfig.getBasePort('postgres')).toBe(5432);
      expect(ServiceConfig.getBasePort('api')).toBe(3000);
    });

    it('should return default for unknown service', () => {
      expect(ServiceConfig.getBasePort('unknown', 9999)).toBe(9999);
    });
  });

  describe('getEnvVar', () => {
    it('should return env var for known service', () => {
      expect(ServiceConfig.getEnvVar('postgres')).toBe('POSTGRES_PORT');
      expect(ServiceConfig.getEnvVar('temporal-ui')).toBe('TEMPORAL_UI_PORT');
    });

    it('should convert unknown service name to env var format', () => {
      expect(ServiceConfig.getEnvVar('my-custom-service')).toBe('MY_CUSTOM_SERVICE_PORT');
    });
  });

  describe('getAllServices', () => {
    it('should return all defined services', () => {
      const services = ServiceConfig.getAllServices();
      expect(services).toContain('postgres');
      expect(services).toContain('temporal-ui');
      expect(services).toContain('minio-console');
    });
  });

  describe('isDefined', () => {
    it('should return true for defined services', () => {
      expect(ServiceConfig.isDefined('postgres')).toBe(true);
      expect(ServiceConfig.isDefined('temporal-ui')).toBe(true);
    });

    it('should return false for undefined services', () => {
      expect(ServiceConfig.isDefined('unknown')).toBe(false);
    });
  });
});
