#!/bin/bash
# Start VibeTrees server in background with PM2

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Starting VibeTrees server..."

cd "$PROJECT_ROOT"

# Check if already running
if pm2 describe vibe-worktrees > /dev/null 2>&1; then
  echo "VibeTrees is already running."
  echo "Use 'npm run vibe:restart' to restart or 'npm run vibe:stop' to stop it first."
  exit 1
fi

# Start with PM2
pm2 start ecosystem.config.cjs

# Save PM2 process list
pm2 save

echo ""
echo "✓ VibeTrees started successfully!"
echo ""
echo "Access at: http://localhost:3335"
echo ""
echo "Management commands:"
echo "  npm run vibe:status   - Check server status"
echo "  npm run vibe:logs     - View logs"
echo "  npm run vibe:restart  - Restart server"
echo "  npm run vibe:stop     - Stop server"
