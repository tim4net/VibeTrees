# Zen MCP

Multi-model AI access via Zen MCP server. Configure once, use in all worktrees.

## Setup

1. Open VibeTrees web UI
2. Click "Zen MCP" in the sidebar
3. Enter API key for your provider
4. Click Test, then Save
5. New worktrees automatically get Zen MCP configured

## Providers

| Provider | Get API Key |
|----------|-------------|
| OpenRouter | openrouter.ai/keys |
| OpenAI | platform.openai.com/api-keys |
| Anthropic | console.anthropic.com |
| Google AI | makersuite.google.com/app/apikey |

## Storage

Keys stored in `~/.vibetrees/zen-mcp-config.json` with 0600 permissions.

```json
{
  "providers": {
    "openrouter": { "apiKey": "sk-or-...", "enabled": true }
  }
}
```

## API

```bash
GET /api/zen-mcp/config     # Get config (keys masked)
POST /api/zen-mcp/config    # Update config
POST /api/zen-mcp/test      # Test provider connection
GET /api/zen-mcp/status     # Check if installed
```

## How it works

When creating a worktree, if any provider is configured, VibeTrees adds the zen-mcp-server to `.claude/settings.json` with your API keys injected as environment variables.
