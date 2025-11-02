#!/bin/bash
# Update VibeTrees to latest version

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Updating VibeTrees..."
echo ""

cd "$PROJECT_ROOT"

# Check if running
WAS_RUNNING=false
if pm2 describe vibe-worktrees > /dev/null 2>&1; then
  WAS_RUNNING=true
  echo "Stopping server for update..."
  pm2 stop vibe-worktrees
  echo ""
fi

# Stash local changes if any
HAS_CHANGES=false
if ! git diff-index --quiet HEAD --; then
  HAS_CHANGES=true
  echo "Stashing local changes..."
  git stash push -m "Auto-stash before update $(date)"
  echo ""
fi

# Pull latest changes
echo "Pulling latest changes from GitHub..."
git pull origin main
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install
echo ""

# Restore stashed changes if any
if [ "$HAS_CHANGES" = true ]; then
  echo "Restoring local changes..."
  if git stash pop; then
    echo "✓ Local changes restored"
  else
    echo "⚠ Could not auto-restore changes. Please check 'git stash list'"
  fi
  echo ""
fi

# Restart if it was running
if [ "$WAS_RUNNING" = true ]; then
  echo "Restarting server..."
  pm2 restart vibe-worktrees
  echo ""
  echo "✓ VibeTrees updated and restarted successfully!"
  echo "  Access at: http://localhost:3335"
else
  echo "✓ VibeTrees updated successfully!"
  echo "  To start: npm run vibe:start"
fi
