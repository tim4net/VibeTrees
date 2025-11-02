#!/bin/bash
# Check VibeTrees server status

set -e

echo "VibeTrees Server Status:"
echo "========================"
echo ""

# Check if PM2 process exists
if pm2 describe vibe-worktrees > /dev/null 2>&1; then
  pm2 describe vibe-worktrees | grep -E "(name|status|uptime|memory|cpu|restarts)"
  echo ""
  echo "✓ Server is running"
  echo "  Access at: http://localhost:3335"
else
  echo "✗ Server is not running"
  echo ""
  echo "To start: npm run vibe:start"
fi
