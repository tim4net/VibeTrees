#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR_DIR="$SCRIPT_DIR/orchestrator"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🌳 VibeTrees Semi-Attended Orchestrator"
echo ""

# Check if orchestrator dependencies installed
if [ ! -d "$ORCHESTRATOR_DIR/node_modules" ]; then
    echo "📦 Installing orchestrator dependencies..."
    cd "$ORCHESTRATOR_DIR"
    npm install
fi

# Navigate to orchestrator
cd "$ORCHESTRATOR_DIR"

# Pass all arguments to orchestrator
exec npm start -- "$@"
