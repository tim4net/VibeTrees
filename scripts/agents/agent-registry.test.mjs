import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry, agentRegistry } from './index.mjs';
import { ClaudeAgent } from './claude-agent.mjs';
import { CodexAgent } from './codex-agent.mjs';
import { GeminiAgent } from './gemini-agent.mjs';
import { ShellAgent } from './shell-agent.mjs';

describe('AgentRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  describe('constructor', () => {
    it('should register built-in agents', () => {
      expect(registry.has('claude')).toBe(true);
      expect(registry.has('codex')).toBe(true);
      expect(registry.has('gemini')).toBe(true);
      expect(registry.has('shell')).toBe(true);
    });
  });

  describe('register', () => {
    it('should register a new agent', () => {
      class CustomAgent extends ClaudeAgent {}
      registry.register('custom', CustomAgent);

      expect(registry.has('custom')).toBe(true);
      expect(registry.get('custom')).toBe(CustomAgent);
    });
  });

  describe('get', () => {
    it('should return agent class by name', () => {
      const AgentClass = registry.get('claude');
      expect(AgentClass).toBe(ClaudeAgent);
    });

    it('should return undefined for unknown agent', () => {
      const AgentClass = registry.get('unknown');
      expect(AgentClass).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create agent instance', () => {
      const agent = registry.create('claude');

      expect(agent).toBeInstanceOf(ClaudeAgent);
      expect(agent.name).toBe('claude');
    });

    it('should pass config to agent', () => {
      const config = { worktreePath: '/test/path' };
      const agent = registry.create('claude', config);

      expect(agent.config).toEqual(config);
    });

    it('should throw error for unknown agent', () => {
      expect(() => registry.create('unknown')).toThrow('Unknown agent: unknown');
    });
  });

  describe('has', () => {
    it('should return true for registered agent', () => {
      expect(registry.has('claude')).toBe(true);
    });

    it('should return false for unregistered agent', () => {
      expect(registry.has('unknown')).toBe(false);
    });
  });

  describe('list', () => {
    it('should return all registered agent names', () => {
      const names = registry.list();

      expect(names).toContain('claude');
      expect(names).toContain('codex');
      expect(names).toContain('gemini');
      expect(names).toContain('shell');
      expect(names.length).toBe(4);
    });
  });

  describe('getAll', () => {
    it('should return metadata for all agents', async () => {
      const metadata = await registry.getAll();

      expect(metadata).toBeInstanceOf(Array);
      expect(metadata.length).toBe(4);

      const claudeMetadata = metadata.find(m => m.name === 'claude');
      expect(claudeMetadata).toMatchObject({
        name: 'claude',
        displayName: 'Claude Code',
        icon: '🤖'
      });
    });

    it('should include installation status', async () => {
      const metadata = await registry.getAll();

      for (const agent of metadata) {
        expect(agent).toHaveProperty('installed');
        expect(agent).toHaveProperty('available');
      }
    });

    it('should mark shell as always available', async () => {
      const metadata = await registry.getAll();
      const shellMetadata = metadata.find(m => m.name === 'shell');

      expect(shellMetadata.available).toBe(true);
    });
  });

  describe('getMetadata', () => {
    it('should return metadata for specific agent', async () => {
      const metadata = await registry.getMetadata('claude');

      expect(metadata).toMatchObject({
        name: 'claude',
        displayName: 'Claude Code',
        icon: '🤖',
        capabilities: expect.any(Array)
      });
    });
  });

  describe('checkAvailability', () => {
    it('should check availability of all agents', async () => {
      const availability = await registry.checkAvailability();

      expect(availability).toHaveProperty('claude');
      expect(availability).toHaveProperty('codex');
      expect(availability).toHaveProperty('gemini');
      expect(availability).toHaveProperty('shell');
    });

    it('should mark shell as available', async () => {
      const availability = await registry.checkAvailability();

      expect(availability.shell).toBe(true);
    });
  });

  describe('deserialize', () => {
    it('should deserialize agent from data', () => {
      const data = {
        name: 'claude',
        config: { worktreePath: '/test' }
      };

      const agent = registry.deserialize(data);

      expect(agent).toBeInstanceOf(ClaudeAgent);
      expect(agent.name).toBe('claude');
      expect(agent.config).toEqual(data.config);
    });

    it('should throw error for invalid data', () => {
      expect(() => registry.deserialize({})).toThrow('Invalid agent data');
      expect(() => registry.deserialize(null)).toThrow('Invalid agent data');
    });
  });

  describe('singleton instance', () => {
    it('should export singleton registry', () => {
      expect(agentRegistry).toBeInstanceOf(AgentRegistry);
      expect(agentRegistry.has('claude')).toBe(true);
    });
  });
});

describe('Agent Implementations', () => {
  describe('ClaudeAgent', () => {
    it('should have correct metadata', () => {
      const agent = new ClaudeAgent();

      expect(agent.name).toBe('claude');
      expect(agent.getDisplayName()).toBe('Claude Code');
      expect(agent.getIcon()).toBe('🤖');
      expect(agent.needsCacheClear()).toBe(false);
    });

    it('should return default args', () => {
      const agent = new ClaudeAgent();
      const args = agent.getDefaultArgs();

      expect(args).toEqual(['-y', '@anthropic-ai/claude-code@latest']);
    });

    it('should return config path', () => {
      const agent = new ClaudeAgent();
      const configPath = agent.getConfigPath('/test/worktree');

      expect(configPath).toBe('/test/worktree/.claude');
    });

    it('should list capabilities', () => {
      const agent = new ClaudeAgent();
      const capabilities = agent.getCapabilities();

      expect(capabilities).toContain('MCP Support');
      expect(capabilities).toContain('Code Generation');
    });
  });

  describe('CodexAgent', () => {
    it('should have correct metadata', () => {
      const agent = new CodexAgent();

      expect(agent.name).toBe('codex');
      expect(agent.getDisplayName()).toBe('OpenAI Codex');
      expect(agent.getIcon()).toBe('🔮');
    });

    it('should return default args', () => {
      const agent = new CodexAgent();
      const args = agent.getDefaultArgs();

      expect(args).toEqual(['-y', '@openai/codex-cli@latest']);
    });
  });

  describe('GeminiAgent', () => {
    it('should have correct metadata', () => {
      const agent = new GeminiAgent();

      expect(agent.name).toBe('gemini');
      expect(agent.getDisplayName()).toBe('Google Gemini');
      expect(agent.getIcon()).toBe('✨');
    });

    it('should return default args', () => {
      const agent = new GeminiAgent();
      const args = agent.getDefaultArgs();

      expect(args).toEqual(['-y', 'gemini-cli@latest']);
    });
  });

  describe('ShellAgent', () => {
    it('should have correct metadata', () => {
      const agent = new ShellAgent();

      expect(agent.name).toBe('shell');
      expect(agent.getDisplayName()).toBe('Shell');
      expect(agent.getIcon()).toBe('💻');
    });

    it('should return empty args', () => {
      const agent = new ShellAgent();
      const args = agent.getDefaultArgs();

      expect(args).toEqual([]);
    });

    it('should return null config path', () => {
      const agent = new ShellAgent();
      const configPath = agent.getConfigPath('/test/worktree');

      expect(configPath).toBeNull();
    });

    it('should always be installed', async () => {
      const agent = new ShellAgent();
      const isInstalled = await agent.isInstalled();

      expect(isInstalled).toBe(true);
    });
  });
});
