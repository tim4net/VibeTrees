# Adding Custom AI Agents

**Guide for implementing custom AI agent integrations in Vibe Worktrees**

Vibe Worktrees provides a pluggable agent system that allows you to add support for any AI-powered CLI tool. This guide walks you through creating a custom agent implementation.

---

## Overview

### Agent System Architecture

Vibe uses an **agent abstraction layer** that separates the worktree management logic from specific AI agent implementations. This enables:

- **Pluggable agents** - Add new agents without modifying core code
- **Consistent interface** - All agents implement the same `AgentInterface`
- **Easy switching** - Users can choose their preferred agent per worktree
- **Future-proof** - New agent CLIs can be added as they become available

### Built-in Agents

| Agent | CLI Package | Status |
|-------|-------------|--------|
| **Claude Code** | `@anthropic-ai/claude-code` | ✅ Fully supported |
| **OpenAI Codex** | `@openai/codex-cli` | 🚧 Hypothetical (waiting for official CLI) |
| **Google Gemini** | `gemini-cli` | 🚧 Hypothetical (waiting for official CLI) |
| **Shell** | System shell | ✅ Always available |

---

## Quick Start

### 1. Create Agent Class

Create a new file in `scripts/agents/`:

```javascript
// scripts/agents/my-agent.mjs
import { AgentInterface } from './agent-interface.mjs';
import pty from 'node-pty';

export class MyAgent extends AgentInterface {
  constructor(config = {}) {
    super('my-agent', config);
  }

  async spawn(worktreePath, options = {}) {
    // Spawn your agent CLI
    return pty.spawn('npx', ['-y', 'my-agent-cli@latest'], {
      cwd: worktreePath,
      env: { ...process.env, ...options.env },
      cols: options.cols || 80,
      rows: options.rows || 30
    });
  }

  getDefaultArgs() {
    return ['-y', 'my-agent-cli@latest'];
  }

  getConfigPath(worktreePath) {
    return join(worktreePath, '.my-agent');
  }

  getDisplayName() {
    return 'My Agent';
  }

  getIcon() {
    return '🚀';
  }

  getCapabilities() {
    return ['Code Generation', 'Refactoring'];
  }
}
```

### 2. Register in AgentRegistry

Add your agent to `scripts/agents/index.mjs`:

```javascript
import { MyAgent } from './my-agent.mjs';

// In constructor
_registerBuiltInAgents() {
  // ... existing agents
  this.register('my-agent', MyAgent);
}

// Export
export { MyAgent } from './my-agent.mjs';
```

### 3. Test Your Agent

Create tests in `scripts/agents/my-agent.test.mjs`:

```javascript
import { describe, it, expect } from 'vitest';
import { MyAgent } from './my-agent.mjs';

describe('MyAgent', () => {
  it('should have correct metadata', () => {
    const agent = new MyAgent();
    expect(agent.name).toBe('my-agent');
    expect(agent.getDisplayName()).toBe('My Agent');
  });
});
```

---

## AgentInterface API Reference

### Required Methods

#### `async spawn(worktreePath, options)`

Spawn the agent CLI as a PTY process.

**Parameters**:
- `worktreePath` (string) - Absolute path to worktree
- `options` (object)
  - `env` (object) - Environment variables
  - `cols` (number) - Terminal columns (default: 80)
  - `rows` (number) - Terminal rows (default: 30)

**Returns**: `PTY` instance from `node-pty`

**Example**:
```javascript
async spawn(worktreePath, options = {}) {
  return pty.spawn('npx', ['-y', 'agent-cli@latest'], {
    cwd: worktreePath,
    env: {
      ...process.env,
      ...this.getEnvironmentVariables(worktreePath),
      ...options.env
    },
    cols: options.cols || 80,
    rows: options.rows || 30
  });
}
```

#### `getDefaultArgs()`

Get default command-line arguments for spawning.

**Returns**: `Array<string>` - Argument list

**Example**:
```javascript
getDefaultArgs() {
  return ['-y', '@my-org/agent-cli@latest'];
}
```

#### `getConfigPath(worktreePath)`

Get configuration directory path for the agent.

**Parameters**:
- `worktreePath` (string) - Absolute path to worktree

**Returns**: `string` - Config directory path (e.g., `.claude/`)

**Example**:
```javascript
getConfigPath(worktreePath) {
  return join(worktreePath, '.my-agent');
}
```

### Optional Methods

#### `needsCacheClear()`

Check if agent needs cache clearing between sessions.

**Returns**: `boolean` - True if cache should be cleared

**Default**: `false`

**Example**:
```javascript
needsCacheClear() {
  return true; // Clear cache on every session
}
```

#### `getDisplayName()`

Get human-readable display name.

**Returns**: `string` - Display name

**Default**: Capitalizes agent name

**Example**:
```javascript
getDisplayName() {
  return 'My Awesome Agent';
}
```

#### `getIcon()`

Get icon/emoji for UI display.

**Returns**: `string` - Icon character or emoji

**Default**: `'🤖'`

**Example**:
```javascript
getIcon() {
  return '🚀';
}
```

#### `async isInstalled()`

Check if agent CLI is installed.

**Returns**: `Promise<boolean>` - True if installed

**Default**: Tries `checkVersion()`, returns false on error

**Example**:
```javascript
async isInstalled() {
  try {
    await this.checkVersion();
    return true;
  } catch (error) {
    return false;
  }
}
```

#### `async checkVersion()`

Get installed version of agent CLI.

**Returns**: `Promise<string>` - Version string

**Default**: Returns `'unknown'`

**Example**:
```javascript
async checkVersion() {
  try {
    const output = execSync('my-agent-cli --version', {
      encoding: 'utf-8',
      timeout: 10000
    });
    return output.trim();
  } catch (error) {
    throw new Error('Agent CLI not accessible');
  }
}
```

#### `getEnvironmentVariables(worktreePath)`

Get agent-specific environment variables.

**Parameters**:
- `worktreePath` (string) - Absolute path to worktree

**Returns**: `Object` - Environment variables

**Default**: Empty object

**Example**:
```javascript
getEnvironmentVariables(worktreePath) {
  return {
    AGENT_API_KEY: process.env.MY_API_KEY,
    AGENT_CONFIG: join(worktreePath, '.my-agent', 'config.json')
  };
}
```

#### `getCapabilities()`

Get list of agent capabilities.

**Returns**: `Array<string>` - Capability names

**Default**: Empty array

**Example**:
```javascript
getCapabilities() {
  return [
    'Code Generation',
    'Refactoring',
    'Testing',
    'Documentation'
  ];
}
```

#### `validateConfig()`

Validate agent configuration.

**Returns**: `Object` - `{ valid: boolean, errors: string[] }`

**Default**: `{ valid: true, errors: [] }`

**Example**:
```javascript
validateConfig() {
  const errors = [];

  if (!process.env.MY_API_KEY) {
    errors.push('MY_API_KEY environment variable not set');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

#### `async installDependencies()`

Install agent CLI dependencies.

**Returns**: `Promise<Object>` - `{ success: boolean, message: string }`

**Default**: Returns success with no action message

**Example**:
```javascript
async installDependencies() {
  try {
    execSync('npm install -g my-agent-cli', { stdio: 'inherit' });
    return { success: true, message: 'Installed successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}
```

#### `async update()`

Update agent CLI to latest version.

**Returns**: `Promise<Object>` - `{ success: boolean, message: string }`

**Default**: Returns success with no updates message

#### `async cleanup(worktreePath)`

Cleanup agent-specific files on worktree deletion.

**Parameters**:
- `worktreePath` (string) - Absolute path to worktree

**Returns**: `Promise<void>`

**Default**: No cleanup

**Example**:
```javascript
async cleanup(worktreePath) {
  const configDir = this.getConfigPath(worktreePath);
  if (existsSync(configDir)) {
    rmSync(configDir, { recursive: true });
  }
}
```

---

## Agent Comparison Table

| Agent | MCP Support | Code Gen | Refactoring | Testing | Docs | Cost |
|-------|-------------|----------|-------------|---------|------|------|
| **Claude Code** | ✅ Full | ✅ Excellent | ✅ Excellent | ✅ Yes | ✅ Yes | Pay-per-use |
| **Codex** | ❌ No | ✅ Excellent | ✅ Good | ✅ Yes | ✅ Yes | API credits |
| **Gemini** | ❌ No | ✅ Good | ✅ Good | ✅ Yes | ✅ Yes | API credits |
| **Shell** | ❌ N/A | ❌ Manual | ❌ Manual | ❌ Manual | ❌ Manual | Free |

---

## Examples

### Example 1: Simple Agent (npx-based)

```javascript
import { AgentInterface } from './agent-interface.mjs';
import pty from 'node-pty';

export class SimpleAgent extends AgentInterface {
  constructor(config = {}) {
    super('simple', config);
  }

  async spawn(worktreePath, options = {}) {
    return pty.spawn('npx', this.getDefaultArgs(), {
      cwd: worktreePath,
      env: { ...process.env, ...options.env },
      cols: options.cols || 80,
      rows: options.rows || 30
    });
  }

  getDefaultArgs() {
    return ['-y', 'simple-agent@latest'];
  }

  getConfigPath(worktreePath) {
    return null; // No config directory
  }

  getDisplayName() {
    return 'Simple Agent';
  }

  getIcon() {
    return '⚡';
  }
}
```

### Example 2: Agent with API Key

```javascript
export class ApiKeyAgent extends AgentInterface {
  constructor(config = {}) {
    super('apikey-agent', config);
  }

  async spawn(worktreePath, options = {}) {
    const env = {
      ...process.env,
      ...this.getEnvironmentVariables(worktreePath),
      ...options.env
    };

    return pty.spawn('agent-cli', [], {
      cwd: worktreePath,
      env,
      cols: options.cols || 80,
      rows: options.rows || 30
    });
  }

  getEnvironmentVariables(worktreePath) {
    return {
      AGENT_API_KEY: process.env.AGENT_API_KEY || '',
      AGENT_MODEL: 'gpt-4'
    };
  }

  validateConfig() {
    const errors = [];

    if (!process.env.AGENT_API_KEY) {
      errors.push('AGENT_API_KEY environment variable required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### Example 3: Agent with Custom Config

```javascript
export class CustomConfigAgent extends AgentInterface {
  constructor(config = {}) {
    super('custom', config);
  }

  async spawn(worktreePath, options = {}) {
    // Generate config file before spawning
    this._generateConfig(worktreePath);

    return pty.spawn('custom-agent', ['--config', this.getConfigPath(worktreePath)], {
      cwd: worktreePath,
      env: { ...process.env, ...options.env },
      cols: options.cols || 80,
      rows: options.rows || 30
    });
  }

  _generateConfig(worktreePath) {
    const configPath = this.getConfigPath(worktreePath);

    if (!existsSync(configPath)) {
      mkdirSync(configPath, { recursive: true });
    }

    const configFile = join(configPath, 'config.json');
    writeFileSync(configFile, JSON.stringify({
      model: 'custom-model',
      temperature: 0.7,
      maxTokens: 2000
    }, null, 2));
  }

  getConfigPath(worktreePath) {
    return join(worktreePath, '.custom-agent');
  }
}
```

---

## Testing Your Agent

### Unit Tests

```javascript
// scripts/agents/my-agent.test.mjs
import { describe, it, expect } from 'vitest';
import { MyAgent } from './my-agent.mjs';

describe('MyAgent', () => {
  it('should have correct name', () => {
    const agent = new MyAgent();
    expect(agent.name).toBe('my-agent');
  });

  it('should return default args', () => {
    const agent = new MyAgent();
    expect(agent.getDefaultArgs()).toEqual(['-y', 'my-agent-cli@latest']);
  });

  it('should return config path', () => {
    const agent = new MyAgent();
    const path = agent.getConfigPath('/test/worktree');
    expect(path).toBe('/test/worktree/.my-agent');
  });

  it('should have display name and icon', () => {
    const agent = new MyAgent();
    expect(agent.getDisplayName()).toBe('My Agent');
    expect(agent.getIcon()).toBe('🚀');
  });
});
```

### Integration Tests

Test with actual worktree:

```bash
# Create test worktree
cd /path/to/project
git worktree add .worktrees/test-agent test-branch

# Spawn agent manually
node -e "
import { MyAgent } from './scripts/agents/my-agent.mjs';
const agent = new MyAgent();
const pty = await agent.spawn('.worktrees/test-agent');
console.log('Agent spawned successfully');
"
```

---

## Best Practices

### 1. Error Handling

Always handle spawn errors gracefully:

```javascript
async spawn(worktreePath, options = {}) {
  try {
    return pty.spawn('agent-cli', this.getDefaultArgs(), {
      cwd: worktreePath,
      env: { ...process.env, ...options.env },
      cols: options.cols || 80,
      rows: options.rows || 30
    });
  } catch (error) {
    console.error(`Failed to spawn ${this.name}:`, error);
    throw error;
  }
}
```

### 2. Environment Variable Management

Use `.env` files for secrets:

```javascript
getEnvironmentVariables(worktreePath) {
  // Check for .env file in worktree
  const envPath = join(worktreePath, '.env');
  if (existsSync(envPath)) {
    const env = dotenv.parse(readFileSync(envPath));
    return { AGENT_API_KEY: env.AGENT_API_KEY };
  }
  return {};
}
```

### 3. Version Checking

Implement version checking to ensure compatibility:

```javascript
async checkVersion() {
  const output = execSync('agent-cli --version', { encoding: 'utf-8' });
  const version = output.trim();

  if (!this._isVersionCompatible(version)) {
    throw new Error(`Incompatible version: ${version}. Requires >= 1.0.0`);
  }

  return version;
}

_isVersionCompatible(version) {
  const [major] = version.split('.');
  return parseInt(major) >= 1;
}
```

### 4. Cleanup

Clean up agent-specific files:

```javascript
async cleanup(worktreePath) {
  const configDir = this.getConfigPath(worktreePath);
  const cacheDir = join(worktreePath, '.agent-cache');

  for (const dir of [configDir, cacheDir]) {
    if (existsSync(dir)) {
      console.log(`Cleaning up ${dir}`);
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
```

---

## Troubleshooting

### Agent Not Spawning

**Problem**: PTY spawn fails

**Solutions**:
1. Check if CLI is installed: `npx -y agent-cli@latest --version`
2. Verify PATH includes node_modules/.bin
3. Check environment variables are set
4. Test spawn manually with `node-pty` directly

### Configuration Not Loading

**Problem**: Agent doesn't use config files

**Solutions**:
1. Verify config path returned by `getConfigPath()`
2. Check file permissions on config directory
3. Ensure config is generated before spawn
4. Test config loading separately

### Version Check Fails

**Problem**: `checkVersion()` throws error

**Solutions**:
1. Verify `--version` flag is supported
2. Handle different version output formats
3. Set longer timeout for slow CLIs
4. Catch and handle version check failures gracefully

---

## Contributing Agents

Want to contribute your agent to Vibe Worktrees?

### PR Submission Checklist

- [ ] Agent class extends `AgentInterface`
- [ ] All required methods implemented
- [ ] Unit tests with 80%+ coverage
- [ ] Documentation in this file
- [ ] Example usage provided
- [ ] Error handling tested
- [ ] No hardcoded secrets or API keys

### PR Template

```markdown
## Agent: [Name]

**CLI Package**: `package-name`
**Official Docs**: https://...

### Features
- List of capabilities

### Requirements
- Environment variables needed
- Minimum CLI version

### Testing
- How to test locally
- Integration test results
```

---

## FAQ

**Q: Can I use agents that aren't npm packages?**

A: Yes! Use direct executable paths instead of npx. Example:
```javascript
async spawn(worktreePath, options = {}) {
  return pty.spawn('/usr/local/bin/my-agent', [], {
    cwd: worktreePath,
    env: { ...process.env, ...options.env }
  });
}
```

**Q: How do I pass custom arguments to the agent?**

A: Add them to `options.args` or override `getDefaultArgs()`:
```javascript
async spawn(worktreePath, options = {}) {
  const args = options.args || this.getDefaultArgs();
  return pty.spawn('agent-cli', args, { ... });
}
```

**Q: Can agents access MCP servers?**

A: Yes! If your agent supports MCP, config is auto-generated in `.{agent}/settings.json`. Just point your agent to read it:
```javascript
getEnvironmentVariables(worktreePath) {
  return {
    AGENT_MCP_CONFIG: join(worktreePath, '.my-agent', 'settings.json')
  };
}
```

---

## References

- [AgentInterface Source](../scripts/agents/agent-interface.mjs)
- [Built-in Agents](../scripts/agents/)
- [Agent Registry](../scripts/agents/index.mjs)
- [MCP Integration Guide](./mcp-integration.md)

---

**Last Updated**: 2025-10-28
**Version**: 1.0
**Maintainer**: Vibe Worktrees Team
