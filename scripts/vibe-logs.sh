#!/bin/bash
# View VibeTrees server logs

set -e

# Check if running
if ! pm2 describe vibe-worktrees > /dev/null 2>&1; then
  echo "VibeTrees is not running."
  echo "To start: npm run vibe:start"
  exit 1
fi

echo "Showing VibeTrees logs (Ctrl+C to exit)..."
echo ""

# Follow logs
pm2 logs vibe-worktrees --lines 50
