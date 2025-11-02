#!/bin/bash
# Restart VibeTrees server

set -e

echo "Restarting VibeTrees server..."

# Check if running
if ! pm2 describe vibe-worktrees > /dev/null 2>&1; then
  echo "VibeTrees is not running. Starting it instead..."
  exec "$(dirname "$0")/vibe-start.sh"
fi

# Restart with PM2
pm2 restart vibe-worktrees

echo "✓ VibeTrees restarted successfully!"
echo ""
echo "Access at: http://localhost:3335"
