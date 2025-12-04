# PAL MCP

Multi-model AI access via PAL MCP server. Configure once, use in all worktrees.

PAL MCP (Provider Abstraction Layer) was formerly known as Zen MCP.
See: https://github.com/BeehiveInnovations/pal-mcp-server

## Setup

1. Open VibeTrees web UI
2. Click "PAL MCP" in the sidebar
3. Enter API key for your provider
4. Click Test, then Save
5. New worktrees automatically get PAL MCP configured

## Providers

| Provider | Get API Key |
|----------|-------------|
| OpenRouter | openrouter.ai/keys |
| OpenAI | platform.openai.com/api-keys |
| Anthropic | console.anthropic.com |
| Google AI | makersuite.google.com/app/apikey |

## Storage

Keys stored in `~/.vibetrees/pal-mcp-config.json` with 0600 permissions.

```json
{
  "providers": {
    "openrouter": { "apiKey": "sk-or-...", "enabled": true }
  }
}
```

## API

```bash
GET /api/pal-mcp/config     # Get config (keys masked)
POST /api/pal-mcp/config    # Update config
POST /api/pal-mcp/test      # Test provider connection
GET /api/pal-mcp/status     # Check if installed
```

## How it works

When creating a worktree, if any provider is configured, VibeTrees adds the pal-mcp-server to `.claude/settings.json` with your API keys injected as environment variables.
