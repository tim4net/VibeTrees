# VibeTrees

**Work on multiple features at the same time. Each with its own AI assistant and isolated services.**

No more switching branches. No more port conflicts. No more "stashing" work.

---

## Quick Start

### 1. Install

```bash
git clone https://github.com/tim4net/VibeTrees.git
cd VibeTrees
npm install
npm link
```

### 2. Launch

```bash
cd ~/your-project
vibe
```

### 3. Open Browser

Open **http://localhost:3335**

That's it! 🎉

---

## What You Get

- **Multiple worktrees** - Work on `feature-a` and `bugfix-b` simultaneously
- **AI assistants** - Claude Code, Codex, or Gemini in each worktree
- **Isolated services** - Each worktree gets unique ports (no conflicts!)
- **Browser terminals** - Full terminal access in your browser
- **Persistent sessions** - Terminal history survives browser refresh

---

## Usage

### Start VibeTrees

```bash
# Local only (default)
vibe

# Allow network access (share with team)
vibe --listen
```

When using `--listen`, you'll see:
```
🚀 Worktree Manager is running!

   📡 Network Mode: Listening on ALL interfaces (--listen)

   Connect from any device on your network:

      http://192.168.1.100:3335  (en0)
      http://172.16.0.1:3335     (en1)

   💡 Tip: Share any of these URLs with teammates!
```

### Create a Worktree

1. Click **"Create Worktree"**
2. Enter branch name: `feature/my-feature`
3. Choose AI agent: Claude, Codex, Gemini, or Shell
4. Click **"Create"**

Done! Your worktree is ready with:
- Isolated git branch
- Unique Docker ports
- AI agent in terminal
- Services starting

### Browse Existing Branches

1. Click **"Create Worktree"**
2. Switch to **"Existing Branch"** tab
3. Search and select a branch
4. Click **"Create"**

### Import Existing Worktrees

Have worktrees created outside VibeTrees?

1. Click **"Import"** button
2. Select worktrees to import
3. Click **"Import"**

VibeTrees automatically:
- Detects running containers
- Allocates ports
- Registers worktrees

### Close a Worktree

1. Right-click worktree in sidebar
2. Click **"Close Worktree"**
3. Choose if you want to delete the branch too
4. Confirm

### Run Diagnostics

Having issues?

1. Right-click worktree
2. Click **"Run Diagnostics"**
3. Click **"Auto-Fix"** for fixable issues

Or check system health:
1. Click **"Diagnostics"** button in header
2. View system-wide health
3. Fix issues with one click

---

## Update

### Option 1: Update Script (Easiest)

```bash
cd VibeTrees
./update.sh
```

### Option 2: Manual

```bash
cd VibeTrees
git pull origin main
npm install
```

---

## Advanced Usage

### Custom Port

```bash
vibe --port 8080
```

### Help

```bash
vibe --help
```

### Version

```bash
vibe --version
```

---

## Requirements

- **Node.js** 18+
- **Git** 2.35+
- **Docker** or **Podman**
- **Optional**: Claude Code CLI, Codex CLI, or Gemini CLI for AI features

---

## Features

✅ **Terminal Persistence** - Sessions survive browser refresh
✅ **Auto-Reconnection** - Recovers from network issues automatically
✅ **Branch Selector** - Browse and search all branches
✅ **Safe Branch Cleanup** - Delete branches with merge detection
✅ **Import Worktrees** - Add existing worktrees seamlessly
✅ **System Diagnostics** - 10 health checks with auto-fix
✅ **Port Management** - No more port conflicts
✅ **Multi-Agent Support** - Claude, Codex, Gemini, or custom agents

---

## Troubleshooting

**Port already in use?**
```bash
vibe --port 3336
```

**Docker not running?**
```bash
docker ps  # Check Docker is running
```

**Can't run `vibe` command?**
```bash
# Re-link the package
cd VibeTrees
npm link
```

**Need help?**
- Check [QUICK-START.md](QUICK-START.md) for detailed guide
- Check [TERMINAL-PERSISTENCE-TEST-PLAN.md](TERMINAL-PERSISTENCE-TEST-PLAN.md) for testing
- Report issues: https://github.com/tim4net/VibeTrees/issues

---

## Documentation

- [Quick Start Guide](QUICK-START.md) - Detailed installation and usage
- [NPX Usage](NPX-USAGE.md) - Using with npx (no install needed)
- [Phase Completion Status](PHASE-COMPLETION-STATUS.md) - Development progress
- [Terminal Persistence](TERMINAL-PERSISTENCE-SUCCESS.md) - How terminals work
- [Frontend Features](FRONTEND-IMPLEMENTATION-COMPLETE.md) - UI capabilities

---

## Contributing

VibeTrees is actively developed. Pull requests welcome!

1. Fork the repository
2. Create your feature branch
3. Make your changes
4. Test with `npm test`
5. Submit a pull request

---

## License

MIT

---

**Made with ❤️ by developers who hate context switching**
