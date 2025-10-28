# Multi-stage Dockerfile for VibeTrees
# Optimized for size and security

# Stage 1: Build dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev for potential build steps)
RUN npm ci --production=false

# Copy source code
COPY scripts/ ./scripts/
COPY docs/ ./docs/
COPY CLAUDE.md README.md LICENSE ./

# Remove dev dependencies
RUN npm prune --production

# Stage 2: Runtime
FROM node:20-alpine

# Install git and docker CLI (needed for operations)
RUN apk add --no-cache \
    git \
    docker-cli \
    ca-certificates \
    tini

# Create non-root user
RUN addgroup -g 1001 -S vibetrees && \
    adduser -u 1001 -S vibetrees -G vibetrees

WORKDIR /app

# Copy from builder
COPY --from=builder --chown=vibetrees:vibetrees /app/node_modules ./node_modules
COPY --from=builder --chown=vibetrees:vibetrees /app/scripts ./scripts
COPY --from=builder --chown=vibetrees:vibetrees /app/docs ./docs
COPY --chown=vibetrees:vibetrees package*.json CLAUDE.md README.md LICENSE ./

# Create directories
RUN mkdir -p /home/vibetrees/.vibetrees/logs && \
    chown -R vibetrees:vibetrees /home/vibetrees/.vibetrees

# Switch to non-root user
USER vibetrees

# Expose web server port
EXPOSE 3335

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3335/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Use tini as entrypoint (proper signal handling)
ENTRYPOINT ["/sbin/tini", "--"]

# Start web server
CMD ["node", "scripts/worktree-web/server.mjs"]
