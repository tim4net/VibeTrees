/**
 * Agent Interface - Abstract base class for AI agent CLIs
 *
 * This interface defines the contract that all agent implementations must follow.
 * It enables pluggable AI agent support (Claude, Codex, Gemini, etc.) without
 * hardcoding specific agent logic throughout the codebase.
 */

export class AgentInterface {
  /**
   * @param {string} name - Agent name (e.g., 'claude', 'codex', 'gemini')
   * @param {Object} config - Agent-specific configuration
   */
  constructor(name, config = {}) {
    if (new.target === AgentInterface) {
      throw new TypeError('Cannot construct AgentInterface instances directly');
    }

    this.name = name;
    this.config = config;
  }

  /**
   * Spawn the agent CLI as a PTY process
   * @param {string} worktreePath - Absolute path to worktree
   * @param {Object} options - Spawn options
   * @param {Object} options.env - Environment variables
   * @param {number} options.cols - Terminal columns
   * @param {number} options.rows - Terminal rows
   * @returns {Object} PTY instance from node-pty
   */
  async spawn(worktreePath, options = {}) {
    throw new Error('spawn() must be implemented by subclass');
  }

  /**
   * Get default command-line arguments for spawning the agent
   * @returns {Array<string>} Default arguments
   */
  getDefaultArgs() {
    throw new Error('getDefaultArgs() must be implemented by subclass');
  }

  /**
   * Get the configuration directory path for this agent
   * @param {string} worktreePath - Absolute path to worktree
   * @returns {string} Config directory path (e.g., '.claude/', '.gemini/')
   */
  getConfigPath(worktreePath) {
    throw new Error('getConfigPath() must be implemented by subclass');
  }

  /**
   * Check if agent needs cache cleared between sessions
   * @returns {boolean} True if cache should be cleared
   */
  needsCacheClear() {
    return false; // Default: no cache clearing needed
  }

  /**
   * Get the display name for this agent
   * @returns {string} Human-readable name
   */
  getDisplayName() {
    return this.name.charAt(0).toUpperCase() + this.name.slice(1);
  }

  /**
   * Get the icon/emoji for this agent (for UI display)
   * @returns {string} Icon character or emoji
   */
  getIcon() {
    return '🤖'; // Default icon
  }

  /**
   * Check if the agent CLI is installed
   * @returns {Promise<boolean>} True if installed
   */
  async isInstalled() {
    try {
      await this.checkVersion();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the installed version of the agent CLI
   * @returns {Promise<string>} Version string (e.g., '1.2.3')
   */
  async checkVersion() {
    // Default implementation - subclasses can override
    return 'unknown';
  }

  /**
   * Install the agent CLI dependencies
   * @returns {Promise<Object>} Installation result
   */
  async installDependencies() {
    // Default implementation - subclasses can override
    return { success: true, message: 'No dependencies to install' };
  }

  /**
   * Update the agent CLI to the latest version
   * @returns {Promise<Object>} Update result
   */
  async update() {
    // Default implementation - subclasses can override
    return { success: true, message: 'No updates available' };
  }

  /**
   * Get agent-specific environment variables
   * @param {string} worktreePath - Absolute path to worktree
   * @returns {Object} Environment variables to inject
   */
  getEnvironmentVariables(worktreePath) {
    return {}; // Default: no special env vars
  }

  /**
   * Get agent capabilities (for UI display)
   * @returns {Array<string>} List of capabilities
   */
  getCapabilities() {
    return []; // Default: no special capabilities
  }

  /**
   * Validate agent configuration
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validateConfig() {
    return { valid: true, errors: [] };
  }

  /**
   * Get agent metadata for API responses
   * @returns {Object} Agent metadata
   */
  getMetadata() {
    return {
      name: this.name,
      displayName: this.getDisplayName(),
      icon: this.getIcon(),
      capabilities: this.getCapabilities(),
      needsCacheClear: this.needsCacheClear()
    };
  }

  /**
   * Handle agent-specific cleanup on worktree deletion
   * @param {string} worktreePath - Absolute path to worktree
   * @returns {Promise<void>}
   */
  async cleanup(worktreePath) {
    // Default: no cleanup needed
    // Subclasses can override to remove agent-specific files
  }

  /**
   * Serialize agent configuration for persistence
   * @returns {Object} Serializable config object
   */
  serialize() {
    return {
      name: this.name,
      config: this.config
    };
  }

  /**
   * Deserialize agent configuration
   * @param {Object} data - Serialized agent data
   * @returns {AgentInterface} Agent instance
   */
  static deserialize(data) {
    // Must be implemented by registry or subclasses
    throw new Error('deserialize() must be implemented');
  }
}
