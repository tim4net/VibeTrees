# VibeTrees

**Work on multiple git branches simultaneously—each with its own AI assistant, isolated services, and persistent terminals.**

No more port conflicts. No more stashing work. No more losing context when you switch branches.

## Quick Start

### 1. Install

```bash
# Install VibeTrees globally
npm install -g git+https://github.com/tim4net/VibeTrees.git

# Install PM2 (process manager)
npm install -g pm2
```

### 2. Start

```bash
vibe
```

That's it! The server starts in the background using PM2 and automatically opens at **http://localhost:3335**

### 3. Manage

```bash
vibe --status      # Check if running
vibe --logs        # View logs
vibe --stop        # Stop server
vibe --restart     # Restart server
vibe --update      # Update to latest version
```

## Requirements

- **Node.js 18+** - Runtime environment
- **PM2** - Process manager (installed above)
- **Git 2.35+** - For worktree support
- **Docker or Podman** - For isolated service containers (optional)

## Features

### PM2 Background Server
- Runs in the background automatically
- Survives terminal closes and system restarts
- Zero-downtime updates with `vibe --update`
- Built-in process monitoring and logs

### Web-Based UI
- Modern web interface on port 3335
- Persistent terminals that survive browser refresh
- Real-time updates via WebSockets
- Multiple AI agents per worktree (Claude Code, Codex, Gemini)

### Worktree Management
- Create and delete git worktrees from the UI
- Automatic port allocation (no conflicts)
- Isolated Docker/Podman services per worktree
- Database import/export workflows

## Network Mode

Share with your team on the local network:

```bash
vibe --listen        # Allow network access
vibe --port 8080     # Custom port
```

## Updates

VibeTrees checks for updates automatically every hour. When an update is available:

1. Click the update badge in the status bar, or
2. Run `vibe --update` from terminal

## Troubleshooting

```bash
# Server not responding?
vibe --restart

# Check logs for errors
vibe --logs

# Clean restart
vibe --stop
vibe

# Check PM2 status directly
pm2 status vibe-worktrees
pm2 logs vibe-worktrees
```

## License

MIT
