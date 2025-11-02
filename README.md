# VibeTrees

**Work on multiple git branches simultaneously—each with its own AI assistant, isolated services, and persistent terminals.**

No more port conflicts. No more stashing work. No more losing context when you switch branches.

## Quick Start

### 1. Install

```bash
# Clone the repository
git clone https://github.com/tim4net/VibeTrees.git
cd VibeTrees

# Install dependencies and link globally
npm install
npm install -g .

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
# Using the global vibe command
vibe --status      # Check if running
vibe --logs        # View logs
vibe --stop        # Stop server
vibe --restart     # Restart server
vibe --update      # Update to latest version

# Or using npm scripts (from the VibeTrees directory)
npm run vibe:status   # Check server status
npm run vibe:logs     # View logs (Ctrl+C to exit)
npm run vibe:restart  # Restart server
npm run vibe:stop     # Stop server
npm run vibe:update   # Update to latest version
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
npm run vibe:restart

# Check logs for errors
npm run vibe:logs

# Check server status
npm run vibe:status

# Clean restart
npm run vibe:stop
npm run vibe:start

# Or using the global command
vibe --restart
vibe --logs
vibe --status

# Check PM2 directly
pm2 status vibe-worktrees
pm2 logs vibe-worktrees --lines 50
```

## License

MIT
