import fs from 'fs';
import path from 'path';
import os from 'os';

export class FirstRunWizard {
  constructor(configDir = null) {
    this.configDir = configDir || path.join(os.homedir(), '.vibetrees');
    this.configPath = path.join(this.configDir, 'config.json');
  }

  isFirstRun() {
    return !fs.existsSync(this.configPath);
  }

  saveConfig(config) {
    // Create directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    // Write config to file
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  loadConfig() {
    if (!fs.existsSync(this.configPath)) {
      return null;
    }

    try {
      const configData = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(configData);
    } catch (error) {
      console.error('Error loading config:', error);
      return null;
    }
  }

  validateConfig(config) {
    const requiredFields = ['repositoryRoot', 'aiAgent', 'containerRuntime', 'defaultNetworkInterface'];
    
    // Check all required fields exist
    for (const field of requiredFields) {
      if (!config[field]) {
        return false;
      }
    }

    // Validate aiAgent
    const validAgents = ['claude', 'codex', 'both'];
    if (!validAgents.includes(config.aiAgent)) {
      return false;
    }

    // Validate containerRuntime
    const validRuntimes = ['docker', 'podman'];
    if (!validRuntimes.includes(config.containerRuntime)) {
      return false;
    }

    // Validate defaultNetworkInterface
    const validInterfaces = ['localhost', 'all'];
    if (!validInterfaces.includes(config.defaultNetworkInterface)) {
      return false;
    }

    return true;
  }
}
