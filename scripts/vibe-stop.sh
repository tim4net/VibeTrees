#!/bin/bash
# Stop VibeTrees server

set -e

echo "Stopping VibeTrees server..."

# Check if running
if ! pm2 describe vibe-worktrees > /dev/null 2>&1; then
  echo "VibeTrees is not running."
  exit 0
fi

# Stop and delete from PM2
pm2 stop vibe-worktrees
pm2 delete vibe-worktrees

# Save PM2 process list
pm2 save

echo "✓ VibeTrees stopped successfully!"
