# Zen MCP Integration

Multi-model AI access for VibeTrees worktrees via Zen MCP.

## Overview

Zen MCP provides access to multiple AI model providers (OpenRouter, OpenAI, Anthropic, Google) through a single MCP server. When configured, all new worktrees automatically include Zen MCP with your API keys.

## Quick Start

1. Open VibeTrees web UI (localhost:3335)
2. Click "Zen MCP" at the bottom of the sidebar
3. Click a provider to configure
4. Enter your API key and click "Test"
5. If test passes, click "Save"
6. Create a new worktree - Zen MCP will be included automatically

## Supported Providers

| Provider | Models | Get API Key |
|----------|--------|-------------|
| OpenRouter | GPT-4, Claude, Gemini, Llama, etc. | [openrouter.ai/keys](https://openrouter.ai/keys) |
| OpenAI | GPT-4o, o1, o3 | [platform.openai.com](https://platform.openai.com/api-keys) |
| Anthropic | Claude 3.5, Claude 4 | [console.anthropic.com](https://console.anthropic.com/) |
| Google AI | Gemini Pro, Gemini Ultra | [makersuite.google.com](https://makersuite.google.com/app/apikey) |

## How It Works

### Configuration Storage

API keys are stored in `~/.vibetrees/zen-mcp-config.json`:

```json
{
  "version": "1.0",
  "providers": {
    "openrouter": { "apiKey": "sk-or-...", "enabled": true },
    "openai": { "apiKey": "sk-...", "enabled": true }
  }
}
```

- File permissions: `0600` (owner read/write only)
- Keys are never logged or exposed in the UI (masked display)

### Worktree Integration

When creating a worktree, if at least one provider is configured:

1. McpManager checks `zenMcp.isConfigured()`
2. If true, adds "zen" to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "zen": {
      "command": "bash",
      "args": [
        "-c",
        "for p in $(which uvx 2>/dev/null) $HOME/.local/bin/uvx /opt/homebrew/bin/uvx /usr/local/bin/uvx uvx; do [ -x \"$p\" ] && exec \"$p\" --from git+https://github.com/BeehiveInnovations/zen-mcp-server.git zen-mcp-server; done; echo 'uvx not found' >&2; exit 1"
      ],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-...",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

### Available Tools

Once configured, Claude Code in your worktree can use:

- `mcp__zen__chat` - Multi-model chat and collaborative thinking
- `mcp__zen__thinkdeep` - Multi-stage investigation and deep reasoning
- `mcp__zen__codereview` - Systematic code review with expert validation
- `mcp__zen__consensus` - Multi-model consensus building through structured debate
- `mcp__zen__debug` - Systematic debugging and root cause analysis
- `mcp__zen__planner` - Complex task breakdown with interactive planning
- `mcp__zen__precommit` - Git change validation before committing
- `mcp__zen__challenge` - Critical thinking to prevent reflexive agreement
- `mcp__zen__clink` - Link to external AI CLIs (Gemini, Codex, etc.)
- `mcp__zen__apilookup` - Current API/SDK documentation lookup
- `mcp__zen__listmodels` - List available AI models and capabilities

## API Reference

### Configuration Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/zen-mcp/config` | GET | Get configuration (masked keys) |
| `/api/zen-mcp/config` | POST | Save API key |
| `/api/zen-mcp/config/:provider` | DELETE | Remove API key |
| `/api/zen-mcp/test` | POST | Test connection |
| `/api/zen-mcp/status` | GET | Installation status |

### Example API Calls

```bash
# Get current config
curl http://localhost:3335/api/zen-mcp/config

# Test a key
curl -X POST http://localhost:3335/api/zen-mcp/test \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","apiKey":"sk-..."}'

# Save a key
curl -X POST http://localhost:3335/api/zen-mcp/config \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","apiKey":"sk-..."}'

# Remove a key
curl -X DELETE http://localhost:3335/api/zen-mcp/config/openai

# Check installation status
curl http://localhost:3335/api/zen-mcp/status
```

### Request/Response Examples

**GET /api/zen-mcp/config**

Response:
```json
{
  "configured": true,
  "providers": {
    "openrouter": { "enabled": true, "masked": "sk-or-...1234" },
    "openai": { "enabled": true, "masked": "sk-...5678" },
    "anthropic": { "enabled": false },
    "google": { "enabled": false }
  }
}
```

**POST /api/zen-mcp/test**

Request:
```json
{
  "provider": "openai",
  "apiKey": "sk-proj-..."
}
```

Success Response:
```json
{
  "success": true,
  "message": "Connection successful"
}
```

Error Response:
```json
{
  "success": false,
  "error": "Invalid API key"
}
```

**POST /api/zen-mcp/config**

Request:
```json
{
  "provider": "openai",
  "apiKey": "sk-proj-..."
}
```

Response:
```json
{
  "success": true,
  "message": "API key saved successfully"
}
```

## Troubleshooting

### Key Not Working

1. Verify the key is valid at the provider's website
2. Check the key has the required permissions
3. Try the "Test" button to see specific errors
4. For OpenRouter: Ensure you have credits/balance
5. For OpenAI: Check the key starts with `sk-proj-` (project keys)

### Zen MCP Not Appearing in Worktree

1. Check at least one provider is configured (status shows "X/4 configured")
2. Create a NEW worktree (existing worktrees don't auto-update)
3. Verify `.claude/settings.json` contains "zen" entry
4. Check file permissions on `~/.vibetrees/zen-mcp-config.json` (should be 0600)

### Installation Issues

Zen MCP is automatically installed via `uvx` from [BeehiveInnovations/zen-mcp-server](https://github.com/BeehiveInnovations/zen-mcp-server) on first use. If installation fails:

**Requirements:**
- Python 3.10+ (`python3 --version`)
- uvx (part of the `uv` package manager)

**Install uvx:**
```bash
# Install uv (includes uvx)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Verify uvx is available
uvx --version
```

**Test Zen MCP:**
```bash
# Run zen-mcp-server directly
uvx --from git+https://github.com/BeehiveInnovations/zen-mcp-server.git zen-mcp-server --help
```

### Permission Errors

If you see permission errors accessing the config file:

```bash
# Fix permissions
chmod 600 ~/.vibetrees/zen-mcp-config.json

# Verify ownership
ls -la ~/.vibetrees/zen-mcp-config.json
```

### Testing Individual Providers

You can test each provider independently:

```bash
# Test OpenRouter
curl -X POST http://localhost:3335/api/zen-mcp/test \
  -H "Content-Type: application/json" \
  -d '{"provider":"openrouter","apiKey":"sk-or-..."}'

# Test OpenAI
curl -X POST http://localhost:3335/api/zen-mcp/test \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","apiKey":"sk-proj-..."}'

# Test Anthropic
curl -X POST http://localhost:3335/api/zen-mcp/test \
  -H "Content-Type: application/json" \
  -d '{"provider":"anthropic","apiKey":"sk-ant-..."}'

# Test Google
curl -X POST http://localhost:3335/api/zen-mcp/test \
  -H "Content-Type: application/json" \
  -d '{"provider":"google","apiKey":"..."}'
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Web UI                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │           Zen MCP Panel (sidebar)               │   │
│  │  - Provider cards (OpenRouter, OpenAI, etc.)   │   │
│  │  - Test/Save buttons                            │   │
│  │  - Status indicator (X/4 configured)            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  API Endpoints                          │
│  GET/POST /api/zen-mcp/config                          │
│  POST /api/zen-mcp/test                                │
│  DELETE /api/zen-mcp/config/:provider                  │
│  GET /api/zen-mcp/status                               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  ZenMcpFacade                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐  │
│  │ ZenMcpConfig│ │ZenMcpInstall│ │ZenMcpConnection │  │
│  │             │ │             │ │                 │  │
│  │ - load()    │ │ - check()   │ │ - test()        │  │
│  │ - save()    │ │ - ensure()  │ │                 │  │
│  │ - get()     │ │             │ │                 │  │
│  └─────────────┘ └─────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              ~/.vibetrees/zen-mcp-config.json          │
│              (permissions: 0600)                        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Worktree Creation Flow                     │
│  1. McpManager.setupMcpServers()                       │
│  2. zenMcp.isConfigured() → true                       │
│  3. Generate .claude/settings.json with zen entry      │
└─────────────────────────────────────────────────────────┘
```

## Security

- **File Permissions**: Config stored with `0600` (owner read/write only)
- **Masked Display**: Keys shown as `sk-...1234` in UI
- **No Logging**: Keys never written to logs
- **Pre-Save Testing**: Connection validated before persisting
- **Per-Worktree Isolation**: Each worktree gets own environment copy
- **No Key Transmission**: Keys only sent server-side for testing

### Best Practices

1. **Rotate Keys Regularly**: Use provider dashboards to rotate keys periodically
2. **Use Project Keys**: For OpenAI, prefer project-scoped keys over user keys
3. **Limit Permissions**: Configure keys with minimum required permissions
4. **Monitor Usage**: Check provider dashboards for unexpected usage
5. **Backup Config**: Consider backing up `~/.vibetrees/zen-mcp-config.json` securely

## Use Cases

### Multi-Model Code Review

Use `mcp__zen__consensus` to get multiple perspectives on code changes:

```javascript
// In Claude Code within a worktree
// Automatically uses configured Zen MCP models
"Review this authentication implementation from multiple security perspectives"
```

### Deep Debugging

Use `mcp__zen__debug` for systematic root cause analysis:

```javascript
// Investigates with hypothesis testing
"Why is the webhook endpoint returning 500 errors intermittently?"
```

### Complex Planning

Use `mcp__zen__planner` for breaking down large features:

```javascript
// Interactive planning with revision support
"Plan the migration from REST to GraphQL for our API"
```

### Pre-Commit Validation

Use `mcp__zen__precommit` before committing:

```javascript
// Validates changes for security, performance, tests
"Validate my staged changes before I commit"
```

## Integration with Other Features

### With Vibe Bridge

Zen MCP works alongside Vibe Bridge for cross-worktree operations:

```javascript
// Vibe Bridge: list worktrees
mcp__vibe_bridge__list_worktrees

// Zen MCP: analyze with multi-model consensus
mcp__zen__consensus "Compare authentication approaches in main vs feature-oauth"
```

### With Agent System

Zen MCP complements built-in agents (Claude Code, Shell):

- **Claude Code**: Primary development agent
- **Zen MCP**: Multi-model reasoning and validation
- **Shell Agent**: Command execution and automation

### With Smart Reload

Zen MCP can help validate changes during smart reload:

```javascript
// After git sync with dependency changes
mcp__zen__codereview "Review the updated authentication flow after sync"
```

## Configuration File Format

Complete schema for `~/.vibetrees/zen-mcp-config.json`:

```json
{
  "version": "1.0",
  "providers": {
    "openrouter": {
      "apiKey": "sk-or-v1-...",
      "enabled": true
    },
    "openai": {
      "apiKey": "sk-proj-...",
      "enabled": true
    },
    "anthropic": {
      "apiKey": "sk-ant-...",
      "enabled": true
    },
    "google": {
      "apiKey": "AIza...",
      "enabled": true
    }
  }
}
```

### Provider-Specific Configuration

Each provider can have additional settings (future):

```json
{
  "openrouter": {
    "apiKey": "sk-or-...",
    "enabled": true,
    "defaultModel": "anthropic/claude-3.5-sonnet",
    "budget": 10.00
  }
}
```

## Development

### Adding New Providers

To add support for a new provider:

1. Add provider to `ZenMcpConfig.SUPPORTED_PROVIDERS`
2. Update UI in `scripts/worktree-web/public/index.html`
3. Add connection test in `ZenMcpConnection`
4. Update documentation

### Testing Zen MCP Integration

```bash
# Run integration tests
npm test -- zen-mcp

# Test specific provider
npm test -- zen-mcp-config

# Test installation checks
npm test -- zen-mcp-install
```

## Related Documentation

- [MCP Integration](mcp-integration.md) - General MCP server configuration
- [Adding Agents](adding-agents.md) - Custom AI agents for worktrees
- [Terminal Persistence](terminal-persistence.md) - Terminal session management

## FAQ

**Q: Can I use Zen MCP without VibeTrees?**
A: Yes, Zen MCP is a standalone MCP server. VibeTrees just automates its configuration per worktree.

**Q: Do I need all four providers configured?**
A: No, configure only the providers you want to use. Even one provider is sufficient.

**Q: Are API keys shared between worktrees?**
A: Yes, all worktrees use the same keys from `~/.vibetrees/zen-mcp-config.json`, but each gets an isolated environment copy.

**Q: Can I update keys for existing worktrees?**
A: Updating keys in the UI affects new worktrees. For existing worktrees, manually update their `.claude/settings.json`.

**Q: What happens if a key becomes invalid?**
A: Zen MCP tools will fail with authentication errors. Update the key in the UI and recreate affected worktrees.

**Q: Can I disable Zen MCP for specific worktrees?**
A: Yes, delete the "zen" entry from that worktree's `.claude/settings.json`.

**Q: How much do API calls cost?**
A: Costs vary by provider and model. Check provider documentation:
- OpenRouter: Pay-per-token, varies by model
- OpenAI: [pricing](https://openai.com/pricing)
- Anthropic: [pricing](https://www.anthropic.com/pricing)
- Google: [pricing](https://ai.google.dev/pricing)

**Q: Can I use custom MCP servers alongside Zen MCP?**
A: Yes, Zen MCP works alongside other MCP servers like Vibe Bridge, filesystem, etc.

**Q: Is there a limit on concurrent requests?**
A: Limits depend on your provider's rate limits. Zen MCP doesn't impose additional limits.

**Q: Can I switch providers mid-conversation?**
A: Yes, Zen MCP tools accept model parameters. You can use different providers for different tasks.
