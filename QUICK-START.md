# 🚀 VibeTrees Quick Start

**Get up and running in 2 minutes!**

---

## The Easiest Way to Launch

### Step 1: Install (One-Time Setup)

```bash
# Clone the repo
git clone https://github.com/tim4net/VibeTrees.git
cd VibeTrees

# Install dependencies
npm install

# Link globally (so you can run 'vibe' from anywhere)
npm link
```

### Step 2: Stay Up-to-Date

```bash
# Update to latest version (do this regularly!)
cd VibeTrees
git pull origin main
npm install  # Update dependencies if needed
```

### Step 3: Launch

```bash
# Go to your project directory
cd ~/your-project

# Start VibeTrees
vibe
```

That's it! Open **http://localhost:3335** in your browser.

---

## 🔄 Updating to Latest Version

VibeTrees is actively developed. To get the latest features:

### Option 1: Use the Update Script (Easiest!)

```bash
# Navigate to VibeTrees directory
cd ~/path/to/VibeTrees

# Run the update script
./update.sh
```

The script will:
- ✅ Pull latest changes from GitHub
- ✅ Update dependencies automatically if needed
- ✅ Show you what's new
- ✅ Warn you if you have uncommitted changes

### Option 2: Manual Update

```bash
# Navigate to VibeTrees directory
cd ~/path/to/VibeTrees

# Pull latest changes
git pull origin main

# Update dependencies (if package.json changed)
npm install

# That's it! The next time you run 'vibe', you'll have the latest version
```

**How often should you update?**
- Check for updates weekly if you're actively using VibeTrees
- Always update before reporting bugs (your issue might already be fixed!)
- Watch the [GitHub repository](https://github.com/tim4net/VibeTrees) for release announcements

---

## Alternative: Run Without Installing

If you don't want to install globally:

```bash
# From the VibeTrees directory
npm run web

# Or if you're in a different directory
node /path/to/VibeTrees/scripts/worktree-web/server.mjs
```

---

## What Happens When You Launch?

```
🚀 Starting Vibe Worktrees...
📁 Working directory: /Users/you/your-project

🐳 Container runtime: docker (docker compose)
🔌 MCP servers discovered: 0
🤖 AI agents available: claude, codex, gemini, shell
🔍 Finding available port...
✓ Port 3335 is available

🚀 Worktree Manager running at http://localhost:3335
   Listening on localhost only (use --listen to allow network access)

Open this URL in your browser to manage worktrees
```

Then just **click the URL** or open your browser to http://localhost:3335

---

## Quick Commands

```bash
# Normal start (localhost only)
vibe

# Allow network access (for team collaboration)
vibe --listen

# Use a different port
vibe --port 8080

# Show help
vibe --help

# Show version
vibe --version

# Stop the server
Ctrl+C
```

---

## Your First Worktree

Once the web UI is open:

1. **Click "Create Worktree"**
2. **Enter a branch name**: e.g., `feature/my-feature`
3. **Select an AI agent**: Claude Code, Codex, Gemini, or Shell
4. **Click "Create"**

Done! Your new worktree is created with:
- ✅ Isolated git branch
- ✅ Unique Docker ports (no conflicts)
- ✅ AI agent running in terminal
- ✅ Services starting automatically

---

## Troubleshooting

### Port Already in Use?

```bash
# Use a different port
vibe --port 3336
```

### Docker Not Running?

Make sure Docker is running:
```bash
docker ps
```

If you see an error, start Docker Desktop or run:
```bash
sudo systemctl start docker  # Linux
```

### Can't Run `vibe` Command?

If `npm link` didn't work, try:
```bash
# Make the binary executable
chmod +x bin/vibe.mjs

# Link again
npm link

# Or add to your PATH manually
export PATH="$PATH:/path/to/VibeTrees/bin"
```

### Need to Uninstall?

```bash
npm unlink vibetrees
```

---

## Next Steps

- 📖 Read the [Full Documentation](README.md)
- 🧪 Check out [Terminal Persistence Testing](TERMINAL-PERSISTENCE-TEST-PLAN.md)
- 🔧 Learn about [Branch Management](FRONTEND-IMPLEMENTATION-COMPLETE.md)
- 📊 See [Phase Completion Status](PHASE-COMPLETION-STATUS.md)

---

## Tips

**💡 Pro Tip #1**: Keep VibeTrees running in a dedicated terminal window. It shows helpful logs.

**💡 Pro Tip #2**: Use `vibe --listen` if you want to access the UI from other devices on your network (like a tablet or phone).

**💡 Pro Tip #3**: Each worktree gets unique ports automatically. No more "port 3000 is already in use"!

**💡 Pro Tip #4**: Terminal sessions survive browser refresh. Close your browser, come back later, and your terminal history is still there!

---

**That's it!** You're ready to rock with parallel development. 🎸

Have fun! 🎉
