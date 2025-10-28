#!/bin/bash

# VibeTrees Update Script
# Updates to the latest version from GitHub

set -e  # Exit on error

echo "🔄 Updating VibeTrees..."
echo ""

# Get the script directory (where VibeTrees is installed)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📁 Location: $SCRIPT_DIR"
echo ""

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "⚠️  Warning: You have uncommitted changes"
    echo ""
    git status --short
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Update cancelled"
        exit 1
    fi
fi

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
git pull origin main

# Check if package.json changed
if git diff HEAD@{1} --name-only | grep -q "package.json"; then
    echo ""
    echo "📦 package.json changed, updating dependencies..."
    npm install
fi

echo ""
echo "✅ VibeTrees updated successfully!"
echo ""
echo "🚀 Next time you run 'vibe', you'll have the latest version"
echo ""

# Show what changed
COMMITS=$(git rev-list --count HEAD@{1}..HEAD 2>/dev/null || echo "0")
if [ "$COMMITS" != "0" ]; then
    echo "📝 New commits:"
    git log --oneline HEAD@{1}..HEAD | head -10
    if [ "$COMMITS" -gt 10 ]; then
        echo "   ... and $((COMMITS - 10)) more"
    fi
fi
