/**
 * Null Runtime Implementation
 *
 * Provides a no-op container runtime when Docker/Podman is unavailable.
 * Allows VibeTrees to run without container support while gracefully
 * degrading Docker-dependent features.
 */

/**
 * Null container runtime - returns empty results for all operations
 * Implements the same interface as ContainerRuntime for drop-in compatibility
 */
export class NullRuntime {
  constructor() {
    this._runtime = 'none';
    this._needsSudo = false;
    this._composeCommand = '';
  }

  /**
   * Get the runtime type
   * @returns {string} Always returns 'none'
   */
  getRuntime() {
    return this._runtime;
  }

  /**
   * Get the compose command
   * @returns {string} Always returns empty string
   */
  getComposeCommand() {
    return this._composeCommand;
  }

  /**
   * Check if elevation (sudo) is needed
   * @returns {boolean} Always returns false
   */
  needsElevation() {
    return this._needsSudo;
  }

  /**
   * Check if runtime is available
   * @returns {boolean} Always returns false
   */
  isAvailable() {
    return false;
  }

  /**
   * Execute a container command
   * Returns empty output to indicate no containers exist
   *
   * @param {string} command - The command to execute
   * @param {Object} options - Execution options
   * @returns {string|Buffer} Empty output
   */
  exec(command, options = {}) {
    // Return empty output in the format the caller expects
    if (options.encoding === 'utf-8' || options.encoding === 'utf8') {
      return '';
    }
    return Buffer.from('');
  }

  /**
   * Execute a compose command
   * Returns empty output to indicate no services exist
   *
   * @param {string} command - The compose subcommand
   * @param {Object} options - Execution options
   * @returns {string|Buffer} Empty output
   */
  execCompose(command, options = {}) {
    // Return empty output in the format the caller expects
    if (options.encoding === 'utf-8' || options.encoding === 'utf8') {
      return '';
    }
    return Buffer.from('');
  }

  /**
   * Get runtime information
   * @returns {Object} Runtime metadata
   */
  getInfo() {
    return {
      runtime: this._runtime,
      composeCommand: this._composeCommand,
      needsSudo: this._needsSudo
    };
  }
}
