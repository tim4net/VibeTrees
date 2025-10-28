import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FirstRunWizard } from './first-run-wizard.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('FirstRunWizard', () => {
  let wizard;
  let mockConfigPath;
  let mockConfigDir;

  beforeEach(() => {
    // Mock home directory
    mockConfigDir = path.join(os.tmpdir(), '.vibetrees-test-' + Math.random().toString(36).substr(2, 9));
    mockConfigPath = path.join(mockConfigDir, 'config.json');
    
    wizard = new FirstRunWizard(mockConfigDir);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(mockConfigPath)) {
      fs.unlinkSync(mockConfigPath);
    }
    if (fs.existsSync(mockConfigDir)) {
      fs.rmdirSync(mockConfigDir);
    }
  });

  describe('isFirstRun', () => {
    it('should return true when config does not exist', () => {
      expect(wizard.isFirstRun()).toBe(true);
    });

    it('should return false when config exists', () => {
      fs.mkdirSync(mockConfigDir, { recursive: true });
      fs.writeFileSync(mockConfigPath, JSON.stringify({ initialized: true }));
      expect(wizard.isFirstRun()).toBe(false);
    });
  });

  describe('saveConfig', () => {
    it('should create config directory if it does not exist', () => {
      const config = {
        repositoryRoot: '/test/repo',
        aiAgent: 'claude',
        containerRuntime: 'docker',
        defaultNetworkInterface: 'localhost'
      };

      wizard.saveConfig(config);

      expect(fs.existsSync(mockConfigDir)).toBe(true);
      expect(fs.existsSync(mockConfigPath)).toBe(true);
    });

    it('should save configuration to JSON file', () => {
      const config = {
        repositoryRoot: '/test/repo',
        aiAgent: 'claude',
        containerRuntime: 'docker',
        defaultNetworkInterface: 'localhost'
      };

      wizard.saveConfig(config);

      const savedConfig = JSON.parse(fs.readFileSync(mockConfigPath, 'utf-8'));
      expect(savedConfig.repositoryRoot).toBe('/test/repo');
      expect(savedConfig.aiAgent).toBe('claude');
      expect(savedConfig.containerRuntime).toBe('docker');
      expect(savedConfig.defaultNetworkInterface).toBe('localhost');
    });
  });

  describe('loadConfig', () => {
    it('should return null if config does not exist', () => {
      expect(wizard.loadConfig()).toBeNull();
    });

    it('should load existing configuration', () => {
      const config = {
        repositoryRoot: '/test/repo',
        aiAgent: 'codex',
        containerRuntime: 'podman',
        defaultNetworkInterface: 'all'
      };

      fs.mkdirSync(mockConfigDir, { recursive: true });
      fs.writeFileSync(mockConfigPath, JSON.stringify(config));

      const loadedConfig = wizard.loadConfig();
      expect(loadedConfig.repositoryRoot).toBe('/test/repo');
      expect(loadedConfig.aiAgent).toBe('codex');
      expect(loadedConfig.containerRuntime).toBe('podman');
      expect(loadedConfig.defaultNetworkInterface).toBe('all');
    });
  });

  describe('validateConfig', () => {
    it('should validate required fields', () => {
      const validConfig = {
        repositoryRoot: '/test/repo',
        aiAgent: 'claude',
        containerRuntime: 'docker',
        defaultNetworkInterface: 'localhost'
      };

      expect(wizard.validateConfig(validConfig)).toBe(true);
    });

    it('should reject config missing required fields', () => {
      const invalidConfig = {
        repositoryRoot: '/test/repo'
        // Missing other fields
      };

      expect(wizard.validateConfig(invalidConfig)).toBe(false);
    });

    it('should reject config with invalid aiAgent', () => {
      const invalidConfig = {
        repositoryRoot: '/test/repo',
        aiAgent: 'invalid',
        containerRuntime: 'docker',
        defaultNetworkInterface: 'localhost'
      };

      expect(wizard.validateConfig(invalidConfig)).toBe(false);
    });

    it('should reject config with invalid containerRuntime', () => {
      const invalidConfig = {
        repositoryRoot: '/test/repo',
        aiAgent: 'claude',
        containerRuntime: 'invalid',
        defaultNetworkInterface: 'localhost'
      };

      expect(wizard.validateConfig(invalidConfig)).toBe(false);
    });
  });
});
