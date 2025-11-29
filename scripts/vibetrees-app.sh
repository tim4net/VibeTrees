#!/bin/bash
# Launch VibeTrees as a standalone app window

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
URL="http://localhost:3335"
PM2="$PROJECT_ROOT/node_modules/.bin/pm2"
APP_PROFILE="$HOME/.config/vibetrees-app"

cd "$PROJECT_ROOT"

# Start VibeTrees if not running
if ! "$PM2" describe vibe-worktrees > /dev/null 2>&1; then
    "$PM2" start ecosystem.config.cjs
    "$PM2" save
    # Wait for server to be ready
    sleep 2
fi

# Open browser in app mode with separate profile (try common browsers)
if command -v google-chrome &> /dev/null; then
    google-chrome --app="$URL" --user-data-dir="$APP_PROFILE" &
elif command -v chromium &> /dev/null; then
    chromium --app="$URL" --user-data-dir="$APP_PROFILE" &
elif command -v chromium-browser &> /dev/null; then
    chromium-browser --app="$URL" --user-data-dir="$APP_PROFILE" &
elif command -v brave-browser &> /dev/null; then
    brave-browser --app="$URL" --user-data-dir="$APP_PROFILE" &
elif command -v microsoft-edge &> /dev/null; then
    microsoft-edge --app="$URL" --user-data-dir="$APP_PROFILE" &
elif command -v vivaldi &> /dev/null; then
    vivaldi --app="$URL" --user-data-dir="$APP_PROFILE" &
elif command -v firefox &> /dev/null; then
    firefox --new-window "$URL" &
else
    xdg-open "$URL" &
fi
