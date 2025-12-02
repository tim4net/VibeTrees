# Adding Agents

Pluggable agent system for AI CLIs. Built-in: Claude Code, Shell, Codex, Gemini.

## API

```bash
GET /api/agents              # List all agents
GET /api/agents/:name        # Get agent details
GET /api/agents/availability # Check which are installed
```

## Usage

```javascript
import { agentRegistry } from './agents/index.mjs';

agentRegistry.list();  // all agents
agentRegistry.create('claude', { worktreePath });
```

## Creating an agent

Add to `scripts/agents/`:

```javascript
// scripts/agents/my-agent.mjs
import { AgentInterface } from './agent-interface.mjs';
import pty from 'node-pty';

export class MyAgent extends AgentInterface {
  constructor(config = {}) {
    super('my-agent', config);
  }

  async spawn(worktreePath, options = {}) {
    return pty.spawn('my-agent-cli', [], {
      cwd: worktreePath,
      env: { ...process.env, ...options.env }
    });
  }

  isAvailable() {
    try {
      execSync('which my-agent-cli', { stdio: 'ignore' });
      return true;
    } catch { return false; }
  }
}
```

Register in `scripts/agents/index.mjs`:

```javascript
import { MyAgent } from './my-agent.mjs';
agentRegistry.register(new MyAgent());
```

## Built-in agents

| Agent | CLI | Notes |
|-------|-----|-------|
| claude | `claude` | Primary agent |
| shell | bash/zsh | Always available |
| codex | `codex` | Needs OpenAI CLI |
| gemini | `gemini` | Needs Google CLI |
