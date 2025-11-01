# PM2 Process Management for VibeTrees

PM2 keeps VibeTrees running reliably, automatically restarting after crashes or computer sleep/wake cycles.

## Installation

```bash
npm install -g pm2
```

## Quick Start

```bash
# Start VibeTrees with PM2
npm run pm2:start

# Check status
npm run pm2:status

# View logs (live)
npm run pm2:logs

# Stop
npm run pm2:stop
```

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run pm2:start` | Start the server with PM2 |
| `npm run pm2:stop` | Stop the server |
| `npm run pm2:restart` | Restart the server (kills and restarts) |
| `npm run pm2:reload` | Reload without downtime (0-second reload) |
| `npm run pm2:delete` | Remove from PM2 process list |
| `npm run pm2:logs` | View live logs (Ctrl+C to exit) |
| `npm run pm2:monit` | Monitor CPU/memory usage |
| `npm run pm2:status` | Check if running |
| `npm run pm2:save` | Save PM2 process list |

## Auto-Start on Boot (Optional)

To make VibeTrees start automatically when your computer boots:

```bash
# Start with PM2
npm run pm2:start

# Save the process list
npm run pm2:save

# Generate startup script (one-time setup)
pm2 startup

# Follow the instructions PM2 prints
# It will show a command to run (with sudo) - copy and run it
```

## Log Files

PM2 stores logs at:
- **Output:** `~/.vibetrees/logs/output.log`
- **Errors:** `~/.vibetrees/logs/error.log`

View logs:
```bash
# Live tail
npm run pm2:logs

# View specific log file
tail -f ~/.vibetrees/logs/output.log
tail -f ~/.vibetrees/logs/error.log

# View all PM2 logs for all apps
pm2 logs
```

## Configuration

The PM2 configuration is in `ecosystem.config.js`:

- **Auto-restart:** Enabled
- **Max memory:** 500MB (restarts if exceeded)
- **Max restarts:** 10 in 1 minute (prevents crash loops)
- **Port:** 3335

## Monitoring

### Real-time monitoring
```bash
npm run pm2:monit
```

Shows live CPU, memory, and restart count.

### Web dashboard (optional)
```bash
pm2 plus
```

Free web dashboard at pm2.io for monitoring.

## Troubleshooting

### Server won't start
```bash
# Check PM2 status
npm run pm2:status

# View error logs
npm run pm2:logs

# Try stopping and starting fresh
npm run pm2:delete
npm run pm2:start
```

### Check if port 3335 is in use
```bash
lsof -ti:3335
# If something is using it, kill it
lsof -ti:3335 | xargs kill
```

### Clear PM2 logs
```bash
pm2 flush
```

### View detailed process info
```bash
pm2 describe vibe-worktrees
```

## Development vs Production

The ecosystem config has two environments:

**Production (default):**
```bash
npm run pm2:start
```

**Development (with file watching):**
```bash
pm2 start ecosystem.config.js --env development
```

## Switching from npm run web

If you're currently using `npm run web`, switch to PM2:

```bash
# Stop any running npm processes (Ctrl+C)

# Start with PM2 instead
npm run pm2:start

# VibeTrees is now running in background
# Close your terminal - it keeps running!
```

## Benefits Over npm run web

- ✅ Survives computer sleep/wake
- ✅ Auto-restarts on crashes
- ✅ Runs in background (no terminal needed)
- ✅ Centralized logs
- ✅ Memory monitoring
- ✅ Can auto-start on boot
- ✅ Zero-downtime reloads

## Stop Using PM2

If you want to go back to `npm run web`:

```bash
npm run pm2:delete
npm run web
```

## Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [PM2 Cluster Mode](https://pm2.keymetrics.io/docs/usage/cluster-mode/) (for multi-core scaling)
- [PM2 Plus Monitoring](https://pm2.io/) (free tier available)
