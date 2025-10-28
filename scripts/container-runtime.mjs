/**
 * Container Runtime Abstraction
 *
 * Provides a unified interface for Docker and Podman container runtimes.
 * Auto-detects available runtime and handles sudo requirements.
 */

import { execSync } from 'child_process';

/**
 * Container runtime abstraction layer
 * Supports Docker and Podman with automatic detection
 */
export class ContainerRuntime {
  /**
   * @param {Object} options - Configuration options
   * @param {string} [options.runtime] - Force specific runtime: 'docker' or 'podman' (auto-detect if not specified)
   * @param {boolean} [options.sudo] - Force sudo on/off (auto-detect if not specified)
   */
  constructor(options = {}) {
    this.options = options;
    this._runtime = null;
    this._needsSudo = null;
    this._composeCommand = null;

    // Perform detection on construction
    this._detectRuntime();
  }

  /**
   * Detect which container runtime is available
   * @private
   */
  _detectRuntime() {
    // Use forced runtime if specified
    if (this.options.runtime) {
      if (!['docker', 'podman'].includes(this.options.runtime)) {
        throw new Error(`Invalid runtime specified: ${this.options.runtime}. Must be 'docker' or 'podman'.`);
      }
      this._runtime = this.options.runtime;
      this._validateRuntime();
      this._detectSudo();
      this._detectComposeCommand();
      return;
    }

    // Auto-detect: try Docker first, then Podman
    try {
      execSync('docker --version', { stdio: 'ignore' });
      this._runtime = 'docker';
    } catch (error) {
      try {
        execSync('podman --version', { stdio: 'ignore' });
        this._runtime = 'podman';
      } catch (podmanError) {
        throw new Error(
          'No container runtime found. Please install Docker or Podman.\n' +
          '  Docker: https://docs.docker.com/get-docker/\n' +
          '  Podman: https://podman.io/getting-started/installation'
        );
      }
    }

    this._detectSudo();
    this._detectComposeCommand();
  }

  /**
   * Validate that the selected runtime is actually available
   * @private
   */
  _validateRuntime() {
    try {
      execSync(`${this._runtime} --version`, { stdio: 'ignore' });
    } catch (error) {
      throw new Error(
        `Runtime '${this._runtime}' was specified but is not available.\n` +
        `Please install ${this._runtime} or use auto-detection.`
      );
    }
  }

  /**
   * Detect if sudo is required for the runtime
   * @private
   */
  _detectSudo() {
    // Use forced sudo setting if specified
    if (typeof this.options.sudo === 'boolean') {
      this._needsSudo = this.options.sudo;
      return;
    }

    // Podman in rootless mode doesn't need sudo
    if (this._runtime === 'podman') {
      try {
        // Check if podman is running in rootless mode
        const output = execSync('podman info --format json', { encoding: 'utf-8' });
        const info = JSON.parse(output);
        this._needsSudo = info.host?.security?.rootless === false;
      } catch (error) {
        // If we can't determine, assume rootless (no sudo needed)
        this._needsSudo = false;
      }
      return;
    }

    // Docker: test if we need sudo
    if (this._runtime === 'docker') {
      try {
        execSync('docker ps', { stdio: 'ignore' });
        this._needsSudo = false;
      } catch (error) {
        try {
          execSync('sudo docker ps', { stdio: 'ignore' });
          this._needsSudo = true;
        } catch (sudoError) {
          throw new Error(
            'Docker is installed but not accessible with or without sudo.\n' +
            'Please configure Docker permissions or ensure Docker daemon is running.'
          );
        }
      }
    }
  }

  /**
   * Detect which compose command to use
   * @private
   */
  _detectComposeCommand() {
    if (this._runtime === 'docker') {
      // Modern Docker has built-in 'docker compose' command
      try {
        const testCommand = this._needsSudo ? 'sudo docker compose version' : 'docker compose version';
        execSync(testCommand, { stdio: 'ignore' });
        this._composeCommand = 'docker compose';
      } catch (error) {
        // Fallback to standalone docker-compose (legacy)
        try {
          const testCommand = this._needsSudo ? 'sudo docker-compose --version' : 'docker-compose --version';
          execSync(testCommand, { stdio: 'ignore' });
          this._composeCommand = 'docker-compose';
        } catch (composeError) {
          throw new Error(
            'Docker is installed but Docker Compose is not available.\n' +
            'Please install Docker Compose: https://docs.docker.com/compose/install/'
          );
        }
      }
    } else if (this._runtime === 'podman') {
      // Podman uses podman-compose
      try {
        const testCommand = this._needsSudo ? 'sudo podman-compose --version' : 'podman-compose --version';
        execSync(testCommand, { stdio: 'ignore' });
        this._composeCommand = 'podman-compose';
      } catch (error) {
        throw new Error(
          'Podman is installed but podman-compose is not available.\n' +
          'Please install podman-compose: pip3 install podman-compose'
        );
      }
    }
  }

  /**
   * Get the detected runtime
   * @returns {string} 'docker' or 'podman'
   */
  getRuntime() {
    return this._runtime;
  }

  /**
   * Get the compose command to use
   * @returns {string} e.g., 'docker compose' or 'podman-compose'
   */
  getComposeCommand() {
    return this._composeCommand;
  }

  /**
   * Check if sudo is required
   * @returns {boolean}
   */
  needsElevation() {
    return this._needsSudo;
  }

  /**
   * Execute a container command with appropriate runtime and sudo
   * @param {string} command - The command to execute (without runtime prefix)
   * @param {Object} options - Options to pass to execSync
   * @returns {Buffer|string} Command output
   */
  exec(command, options = {}) {
    const fullCommand = this._needsSudo
      ? `sudo ${this._runtime} ${command}`
      : `${this._runtime} ${command}`;

    return execSync(fullCommand, options);
  }

  /**
   * Execute a compose command with appropriate runtime and sudo
   * @param {string} command - The compose subcommand (e.g., 'up -d', 'down')
   * @param {Object} options - Options to pass to execSync
   * @returns {Buffer|string} Command output
   */
  execCompose(command, options = {}) {
    const fullCommand = this._needsSudo
      ? `sudo ${this._composeCommand} ${command}`
      : `${this._composeCommand} ${command}`;

    return execSync(fullCommand, options);
  }

  /**
   * Get runtime information for logging/debugging
   * @returns {Object} Runtime information
   */
  getInfo() {
    return {
      runtime: this._runtime,
      composeCommand: this._composeCommand,
      needsSudo: this._needsSudo
    };
  }
}
