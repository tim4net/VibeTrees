# VibeTrees

**Stop switching branches. Start switching contexts.**

Work on multiple features simultaneously—each with its own AI assistant, isolated Docker services, and persistent terminals. No more port conflicts, no more stashing work, no more losing your place.

---

## Why VibeTrees?

Ever had to:
- Pause work on a feature to fix an urgent bug?
- Switch branches and lose your terminal history?
- Fight Docker port conflicts between branches?
- Juggle multiple feature branches in your head?

**VibeTrees solves all of this.** Each git worktree gets:
- ✅ Its own AI agent (Claude Code, Codex, or Gemini)
- ✅ Isolated Docker ports (auto-assigned, no conflicts)
- ✅ Persistent terminal sessions (survive browser refresh)
- ✅ Independent services (databases, APIs, etc.)

Switch between worktrees with one click. Work on 5 features in parallel. Your context stays intact.

---

## Quick Start

### Option 1: Try with npx (No Install!)

```bash
cd ~/your-project
npx github:tim4net/VibeTrees
```

Opens at **http://localhost:3335**

### Option 2: Global Install (Recommended)

```bash
npm install -g github:tim4net/VibeTrees
cd ~/your-project
vibe
```

### Option 3: Clone for Development

```bash
git clone https://github.com/tim4net/VibeTrees.git
cd VibeTrees
npm install && npm link
cd ~/your-project
vibe
```

---

## What You Get

| Feature | What It Does |
|---------|--------------|
| **Multi-Project** | Manage multiple git repositories with one server instance |
| **Multi-Worktree** | Work on `feature-a`, `bugfix-b`, and `main` simultaneously |
| **AI Agents** | Claude Code, Codex, or Gemini running in each worktree's terminal |
| **Port Isolation** | Auto-assigned unique ports per worktree (3000 → 3001 → 3002...) |
| **Terminal Persistence** | Close browser, come back later—history is still there |
| **Branch Selector** | Browse and search all git branches (local + remote) |
| **Service Management** | Docker Compose per worktree with one-click start/stop |
| **Diagnostics** | 10 health checks with auto-fix for common issues |
| **Network Mode** | Share with your team on LAN with `--listen` |

---

## Features

### Multi-Project Management
Manage multiple git repositories from a single VibeTrees instance. Switch between projects seamlessly while keeping all worktrees, terminals, and services isolated per project.

**How it works:**
- One PM2 server manages all projects
- Project dropdown in the sidebar (next to "Worktrees" title)
- Click "+New" to add a new project
- Switch projects instantly—worktrees auto-load
- Projects persisted to `~/.vibetrees/projects.json`

**Perfect for:**
- Managing multiple client projects
- Working on related microservices
- Switching between work and personal repos
- Testing across different codebases

### Terminal Persistence
Your terminal sessions survive browser crashes. Even system reboots. State is saved every 5 seconds.

### Smart Port Management
VibeTrees automatically assigns unique ports to each worktree's services. No more `EADDRINUSE` errors.

```
main:           API=3000 DB=5432 Console=3001
feature-auth:   API=3002 DB=5433 Console=3003
bugfix-login:   API=3004 DB=5434 Console=3005
```

### Multi-Agent Support
Choose your AI assistant per worktree:
- **Claude Code** - Best for complex refactoring and architecture
- **Codex** - Fast code generation with OpenAI
- **Gemini** - Google's multimodal AI
- **Shell** - Just a terminal, no AI

### Branch Management
- Create worktrees from new or existing branches
- Import worktrees created outside VibeTrees
- Safe branch deletion with merge detection
- Sync with remote and auto-reload services

### Network Sharing
```bash
vibe --listen  # Share with team on your network
```

Shows all IPs to connect from:
```
🌐 http://192.168.1.100:3335  (en0)
🌐 http://172.16.0.1:3335     (en1)
```

macOS firewall configuration handled automatically (or guided manual setup).

---

## Usage Examples

### Start VibeTrees
```bash
# Local only (default, secure)
vibe

# Network mode (team collaboration)
vibe --listen

# Custom port
vibe --port 8080
```

### Add a New Project
1. Click "+New" button (next to project dropdown in sidebar)
2. Enter project name: "My API Server"
3. Enter project path: `/Users/you/projects/api-server`
4. Click "Create Project"

VibeTrees automatically switches to your new project and loads its worktrees.

### Switch Between Projects
1. Click the project dropdown in the sidebar
2. Select a different project
3. Worktrees refresh automatically

All terminals, services, and state remain intact when you switch back.

### Create Worktree
1. Click "Create Worktree"
2. Enter branch: `feature/user-auth`
3. Select agent: Claude Code
4. Click "Create"

Done! Claude Code is running in an isolated environment with unique ports.

### Import Existing Worktree
Already created a worktree with `git worktree add`?

1. Click "Import"
2. Select your worktrees
3. VibeTrees detects containers and assigns ports

### Close Worktree
Right-click worktree → "Close Worktree" → Optionally delete branch

---

## Requirements

- **Node.js** 18+ (20+ recommended)
- **Git** 2.35+ (worktree support)
- **Docker** or **Podman** (for service isolation)
- **Optional**: Claude Code CLI, Codex CLI, or Gemini CLI for AI features

---

## Update to Latest

```bash
cd VibeTrees
./update.sh
```

Or manually:
```bash
git pull origin main && npm install
```

Or with npx (always latest):
```bash
npx github:tim4net/VibeTrees@latest
```

---

## Documentation

- **[User Guide](USER-GUIDE.md)** - Complete manual with all features
- **[Quick Start](QUICK-START.md)** - Detailed installation walkthrough
- **[NPX Usage](NPX-USAGE.md)** - Using without installation
- **[Network Access](docs/network-access.md)** - Firewall and security guide
- **[Terminal Persistence](docs/terminal-persistence.md)** - How sessions work

---

## Troubleshooting

**Port in use?**
```bash
vibe --port 3336
```

**Docker not running?**
```bash
docker ps
```

**Can't access from network?**

See [Network Access Guide](docs/network-access.md) for firewall setup.

**More help?**

Check the [User Guide](USER-GUIDE.md) or [open an issue](https://github.com/tim4net/VibeTrees/issues).

---

## Contributing

Pull requests welcome! VibeTrees is actively developed.

1. Fork the repo
2. Create feature branch
3. Make changes
4. Run `npm test` (468 tests must pass)
5. Submit PR

---

## License

MIT

---

**Made with ❤️ by developers who hate context switching**
