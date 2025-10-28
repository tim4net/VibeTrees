/**
 * Agent Registry - Central registry for all AI agent implementations
 *
 * Manages available agents and provides factory methods for creating agent instances.
 */

import { ClaudeAgent } from './claude-agent.mjs';
import { CodexAgent } from './codex-agent.mjs';
import { GeminiAgent } from './gemini-agent.mjs';
import { ShellAgent } from './shell-agent.mjs';

export class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this._registerBuiltInAgents();
  }

  /**
   * Register built-in agents
   */
  _registerBuiltInAgents() {
    this.register('claude', ClaudeAgent);
    this.register('codex', CodexAgent);
    this.register('gemini', GeminiAgent);
    this.register('shell', ShellAgent);
  }

  /**
   * Register a new agent implementation
   * @param {string} name - Agent name (lowercase)
   * @param {class} AgentClass - Agent class (extends AgentInterface)
   */
  register(name, AgentClass) {
    this.agents.set(name, AgentClass);
  }

  /**
   * Get an agent class by name
   * @param {string} name - Agent name
   * @returns {class} Agent class
   */
  get(name) {
    return this.agents.get(name);
  }

  /**
   * Create an agent instance
   * @param {string} name - Agent name
   * @param {Object} config - Agent configuration
   * @returns {AgentInterface} Agent instance
   */
  create(name, config = {}) {
    const AgentClass = this.agents.get(name);

    if (!AgentClass) {
      throw new Error(`Unknown agent: ${name}`);
    }

    return new AgentClass(config);
  }

  /**
   * Check if an agent is registered
   * @param {string} name - Agent name
   * @returns {boolean} True if registered
   */
  has(name) {
    return this.agents.has(name);
  }

  /**
   * List all registered agent names
   * @returns {Array<string>} Agent names
   */
  list() {
    return Array.from(this.agents.keys());
  }

  /**
   * Get metadata for all registered agents
   * @returns {Array<Object>} Agent metadata
   */
  async getAll() {
    const metadata = [];

    for (const [name, AgentClass] of this.agents.entries()) {
      const agent = new AgentClass();
      const isInstalled = await agent.isInstalled();

      metadata.push({
        ...agent.getMetadata(),
        installed: isInstalled,
        available: isInstalled || name === 'shell' // Shell is always available
      });
    }

    return metadata;
  }

  /**
   * Get metadata for a specific agent
   * @param {string} name - Agent name
   * @returns {Promise<Object>} Agent metadata
   */
  async getMetadata(name) {
    const agent = this.create(name);
    const isInstalled = await agent.isInstalled();

    return {
      ...agent.getMetadata(),
      installed: isInstalled,
      available: isInstalled || name === 'shell'
    };
  }

  /**
   * Check availability of all agents
   * @returns {Promise<Object>} Availability status { name: boolean }
   */
  async checkAvailability() {
    const availability = {};

    for (const name of this.agents.keys()) {
      const agent = this.create(name);
      availability[name] = await agent.isInstalled();
    }

    // Shell is always available
    availability.shell = true;

    return availability;
  }

  /**
   * Deserialize agent from stored configuration
   * @param {Object} data - Serialized agent data
   * @returns {AgentInterface} Agent instance
   */
  deserialize(data) {
    if (!data || !data.name) {
      throw new Error('Invalid agent data');
    }

    return this.create(data.name, data.config || {});
  }
}

// Export singleton instance
export const agentRegistry = new AgentRegistry();

// Export agent classes for direct use
export { ClaudeAgent } from './claude-agent.mjs';
export { CodexAgent } from './codex-agent.mjs';
export { GeminiAgent } from './gemini-agent.mjs';
export { ShellAgent } from './shell-agent.mjs';
export { AgentInterface } from './agent-interface.mjs';
