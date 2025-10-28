# Deployment Guide

This guide covers deploying VibeTrees in various environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
- [Configuration](#configuration)
- [Running in Production](#running-in-production)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

- **Node.js** - Version 18.x, 20.x, or 22.x
- **Git** - Version 2.30 or higher
- **Container Runtime** - Docker 20.x+ or Podman 4.x+

### Optional

- **Docker Compose** - For multi-service projects (Docker installs this by default)
- **Podman Compose** - For Podman users: `pip install podman-compose`
- **GitHub CLI** - For branch cleanup features: `gh` command

### Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **macOS** | ✅ Fully supported | Both Intel and Apple Silicon |
| **Linux** | ✅ Fully supported | Ubuntu, Debian, Fedora, Arch, etc. |
| **Windows** | ⚠️ WSL2 recommended | Native Windows not tested |

---

## Installation Methods

### Method 1: From Source (Recommended)

```bash
# Clone repository
git clone https://github.com/yourusername/vibe-worktrees.git
cd vibe-worktrees

# Install dependencies
npm install

# Run first-time setup
npm run web

# Follow the setup wizard to configure runtime, etc.
```

### Method 2: Docker (Self-Contained)

```bash
# Pull image
docker pull ghcr.io/yourusername/vibe-worktrees:latest

# Run container
docker run -d \
  --name vibetrees \
  -p 3335:3335 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ~/.vibetrees:/home/vibetrees/.vibetrees \
  -v ~/code:/workspace \
  ghcr.io/yourusername/vibe-worktrees:latest
```

### Method 3: npm (Future)

```bash
# Install globally
npm install -g vibetrees

# Run
vibetrees web
```

---

## Configuration

### First Run Setup

On first run, VibeTrees will guide you through setup:

1. **Container Runtime Detection** - Auto-detects Docker or Podman
2. **Git Configuration** - Verifies git is installed
3. **Default Agent** - Choose default AI agent (Claude, Codex, etc.)
4. **Telemetry Opt-in** - Optional usage tracking

Configuration is saved to `~/.vibetrees/config.json`.

### Manual Configuration

Edit `~/.vibetrees/config.json`:

```json
{
  "version": "1.0",
  "project": {
    "name": "my-app",
    "description": "My application"
  },
  "container": {
    "runtime": "docker",
    "composeFile": "docker-compose.yml",
    "sudo": "auto"
  },
  "agents": {
    "default": "claude",
    "available": ["claude", "codex", "gemini", "shell"]
  },
  "mcp": {
    "autoInstall": true,
    "servers": []
  },
  "logging": {
    "level": "INFO",
    "format": "json",
    "outputs": ["console", "file"]
  },
  "telemetry": {
    "enabled": false
  }
}
```

### Environment Variables

Override configuration via environment:

```bash
# Container runtime
export VIBE_RUNTIME=docker        # or 'podman'
export VIBE_SUDO=never            # or 'always', 'auto'

# Logging
export LOG_LEVEL=DEBUG            # DEBUG, INFO, WARN, ERROR, FATAL
export LOG_FORMAT=json            # json or text
export LOG_OUTPUTS=console,file   # comma-separated

# Telemetry
export VIBE_TELEMETRY=false       # true or false

# Web server
export VIBE_PORT=3335             # Default: 3335
export VIBE_HOST=localhost        # Default: localhost (use 0.0.0.0 for all interfaces)
```

---

## Running in Production

### Systemd Service (Linux)

Create `/etc/systemd/system/vibetrees.service`:

```ini
[Unit]
Description=VibeTrees Web Server
After=network.target docker.service

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/vibe-worktrees
Environment="NODE_ENV=production"
Environment="LOG_LEVEL=INFO"
Environment="VIBE_PORT=3335"
ExecStart=/usr/bin/node scripts/worktree-web/server.mjs
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable vibetrees
sudo systemctl start vibetrees
sudo systemctl status vibetrees
```

View logs:

```bash
sudo journalctl -u vibetrees -f
```

### LaunchAgent (macOS)

Create `~/Library/LaunchAgents/com.vibetrees.web.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.vibetrees.web</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/youruser/vibe-worktrees/scripts/worktree-web/server.mjs</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/youruser/vibe-worktrees</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/youruser/.vibetrees/logs/vibetrees.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/youruser/.vibetrees/logs/vibetrees-error.log</string>
</dict>
</plist>
```

Load and start:

```bash
launchctl load ~/Library/LaunchAgents/com.vibetrees.web.plist
launchctl start com.vibetrees.web
```

### Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start scripts/worktree-web/server.mjs --name vibetrees

# Save configuration
pm2 save

# Setup startup script
pm2 startup
```

Manage with PM2:

```bash
pm2 status vibetrees
pm2 logs vibetrees
pm2 restart vibetrees
pm2 stop vibetrees
```

---

## Docker Deployment

### Using Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  vibetrees:
    image: ghcr.io/yourusername/vibe-worktrees:latest
    container_name: vibetrees
    ports:
      - "3335:3335"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ~/.vibetrees:/home/vibetrees/.vibetrees
      - ~/code:/workspace
    environment:
      - LOG_LEVEL=INFO
      - VIBE_TELEMETRY=false
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3335/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

Deploy:

```bash
docker-compose up -d
docker-compose logs -f vibetrees
```

### Building Custom Image

```bash
# Build image
docker build -t vibetrees:custom .

# Run custom image
docker run -d \
  --name vibetrees \
  -p 3335:3335 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ~/.vibetrees:/home/vibetrees/.vibetrees \
  vibetrees:custom
```

### Multi-Stage Build

The included `Dockerfile` uses multi-stage builds for optimization:

- **Stage 1 (builder)** - Install dependencies, copy source
- **Stage 2 (runtime)** - Minimal runtime image with Node.js, git, docker CLI

Image size: ~150MB (alpine-based)

---

## Cloud Deployment

### AWS EC2

#### Launch Instance

```bash
# Launch Ubuntu 22.04 instance
aws ec2 run-instances \
  --image-id ami-0c7217cdde317cfec \
  --instance-type t3.medium \
  --key-name your-key \
  --security-group-ids sg-xxxxx
```

#### Setup Script

```bash
#!/bin/bash
set -e

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu

# Install git
sudo apt install -y git

# Clone VibeTrees
git clone https://github.com/yourusername/vibe-worktrees.git
cd vibe-worktrees
npm install

# Setup systemd service
sudo cp deploy/vibetrees.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable vibetrees
sudo systemctl start vibetrees
```

#### Security Group Rules

- **Inbound**: Port 3335 (TCP) from your IP only
- **Outbound**: All traffic

### Google Cloud Run

#### Dockerfile for Cloud Run

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY scripts/ ./scripts/
COPY docs/ ./docs/

ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "scripts/worktree-web/server.mjs"]
```

#### Deploy

```bash
# Build and push
gcloud builds submit --tag gcr.io/PROJECT_ID/vibetrees

# Deploy
gcloud run deploy vibetrees \
  --image gcr.io/PROJECT_ID/vibetrees \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

### Azure Container Instances

```bash
az container create \
  --resource-group myResourceGroup \
  --name vibetrees \
  --image ghcr.io/yourusername/vibe-worktrees:latest \
  --dns-name-label vibetrees \
  --ports 3335
```

---

## Monitoring

### Health Checks

Monitor application health:

```bash
# Local
curl http://localhost:3335/health

# Remote
curl https://your-domain.com/health
```

### Metrics Collection

#### Prometheus

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'vibetrees'
    scrape_interval: 30s
    static_configs:
      - targets: ['localhost:3335']
    metrics_path: '/metrics'
    params:
      format: ['prometheus']
```

#### Grafana Dashboard

Import dashboard from `deploy/grafana-dashboard.json`

Key metrics:
- Uptime
- Active worktrees
- Container count
- Operation duration
- Memory usage

### Log Aggregation

#### Centralized Logging (ELK Stack)

**Filebeat configuration:**

```yaml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - ~/.vibetrees/logs/*.log
    json.keys_under_root: true
    json.add_error_key: true

output.elasticsearch:
  hosts: ["localhost:9200"]
```

#### CloudWatch (AWS)

Install CloudWatch agent:

```bash
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb
```

Configure to watch `~/.vibetrees/logs/`

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3335
lsof -i :3335

# Kill process
kill -9 <PID>

# Or use different port
VIBE_PORT=8080 npm run web
```

### Docker Socket Permission Denied

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Re-login for changes to take effect
newgrp docker

# Or use podman (rootless by default)
export VIBE_RUNTIME=podman
```

### Memory Issues

```bash
# Check memory usage
free -h

# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run web
```

### Container Runtime Not Found

```bash
# Check Docker
docker --version

# Check Podman
podman --version

# Install Docker
curl -fsSL https://get.docker.com | sh

# Or install Podman
sudo apt install podman podman-compose  # Ubuntu/Debian
brew install podman podman-compose      # macOS
```

---

## Security Best Practices

### Network Security

1. **Use firewall** - Only allow port 3335 from trusted IPs
2. **Enable HTTPS** - Use reverse proxy (nginx, caddy) for TLS
3. **Authentication** - Add authentication layer if exposing publicly

### Container Security

1. **Read-only Docker socket** - Mount with `:ro` flag
2. **Non-root user** - Container runs as non-root by default
3. **Resource limits** - Set CPU and memory limits

### Data Security

1. **Encrypt at rest** - Use encrypted volumes for `~/.vibetrees`
2. **Secure secrets** - Use environment variables, not config files
3. **Regular backups** - Backup configuration and port registry

---

## Performance Tuning

### Node.js Optimization

```bash
# Increase memory for large projects
NODE_OPTIONS="--max-old-space-size=4096" npm run web

# Enable clustering (future)
NODE_CLUSTER_WORKERS=4 npm run web
```

### Database Optimization

For projects with many worktrees:

1. Use SSD for `~/.vibetrees` directory
2. Increase inotify limits (Linux):

```bash
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Container Optimization

1. **Use buildkit** - `export DOCKER_BUILDKIT=1`
2. **Layer caching** - Order Dockerfile commands efficiently
3. **Multi-stage builds** - Reduce final image size

---

## Backup and Recovery

### What to Backup

1. **Configuration** - `~/.vibetrees/config.json`
2. **Port registry** - `~/.vibetrees/ports.json`
3. **Logs** (optional) - `~/.vibetrees/logs/`
4. **Telemetry** (optional) - `~/.vibetrees/telemetry/`

### Backup Script

```bash
#!/bin/bash
BACKUP_DIR="~/backups/vibetrees-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp ~/.vibetrees/config.json "$BACKUP_DIR/"
cp ~/.vibetrees/ports.json "$BACKUP_DIR/"

tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

echo "Backup created: $BACKUP_DIR.tar.gz"
```

### Recovery

```bash
# Extract backup
tar -xzf vibetrees-20251028-103045.tar.gz

# Restore configuration
cp vibetrees-20251028-103045/*.json ~/.vibetrees/

# Restart service
sudo systemctl restart vibetrees
```

---

## Related Documentation

- [Monitoring Guide](monitoring.md)
- [Architecture](architecture.md)
- [Configuration](configuration.md)
- [API Reference](api.md)
