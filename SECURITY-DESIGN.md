# Security Design

**Threat Model & Mitigations**
**Based on GPT-5 Security Analysis**
**Status**: Planning

---

## Threat Model

### Assets to Protect
- **User code and data**: Source code, databases, secrets
- **Host system**: Files, processes, network
- **Credentials**: API keys, tokens, Docker/Podman socket
- **User privacy**: Conversations with AI, usage patterns

### Threat Actors
- **Malicious AI agents**: Rogue or compromised AI making destructive changes
- **Malicious MCP servers**: Third-party code execution
- **Compromised dependencies**: Supply chain attacks
- **Untrusted users**: If multi-user mode added later
- **Network attackers**: If WebSocket exposed remotely

### Attack Vectors
1. Path traversal via agent file operations
2. Command injection through AI-generated commands
3. Privilege escalation via Docker socket access
4. Data exfiltration through MCP servers
5. XSS/CSRF on WebSocket endpoints
6. Secret exposure in logs or UI
7. Resource exhaustion (CPU/mem/disk)

---

## Security Principles

### 1. Least Privilege
- Agents get minimal necessary permissions
- MCP servers isolated from host
- Containers run rootless by default
- No privileged containers

### 2. Defense in Depth
- Multiple layers of validation
- Fail closed (deny by default)
- Explicit user confirmation for destructive ops
- Audit logging

### 3. Zero Trust
- Don't trust AI agent decisions
- Don't trust MCP server behavior
- Don't trust user input
- Validate everything

---

## Agent Sandboxing

### Directory Allowlist

**Config**: `.vibe/security.json`
```json
{
  "agents": {
    "allowedPaths": [
      "/src",
      "/tests",
      "/docs",
      "/scripts"
    ],
    "deniedPaths": [
      "/.env",
      "/.env.local",
      "/secrets",
      "/node_modules",
      "/.git/config"
    ],
    "requireConfirmation": {
      "delete": true,
      "write": [
        "docker-compose.yml",
        "package.json",
        ".gitignore",
        "*.sql"  // Database migrations
      ],
      "execute": [
        "rm",
        "git push",
        "npm publish",
        "docker"
      ]
    }
  }
}
```

### Implementation

```javascript
class AgentSandbox {
  constructor(config) {
    this.allowedPaths = config.agents.allowedPaths.map(p => path.resolve(p));
    this.deniedPaths = config.agents.deniedPaths.map(p => path.resolve(p));
    this.confirmationRules = config.agents.requireConfirmation;
  }

  /**
   * Validate file operation
   */
  canAccessFile(filePath, operation) {
    const resolved = path.resolve(filePath);

    // Deny if in denied list
    for (const denied of this.deniedPaths) {
      if (resolved.startsWith(denied)) {
        return {
          allowed: false,
          reason: `Access denied: ${filePath} is in restricted area`
        };
      }
    }

    // Allow if in allowed list
    for (const allowed of this.allowedPaths) {
      if (resolved.startsWith(allowed)) {
        // Check if confirmation needed
        if (this.needsConfirmation(filePath, operation)) {
          return {
            allowed: true,
            requiresConfirmation: true,
            reason: `${operation} on ${filePath} requires user confirmation`
          };
        }
        return { allowed: true };
      }
    }

    // Deny by default
    return {
      allowed: false,
      reason: `${filePath} is outside allowed directories`
    };
  }

  /**
   * Validate command execution
   */
  canExecuteCommand(command) {
    // Check against dangerous patterns
    const dangerous = [
      /rm\s+-rf\s+\//,  // Delete root
      /:\(\)\{.*;\};/,  // Fork bomb
      /sudo/,           // Privilege escalation
      /docker\s+/,      // Docker manipulation
      /chmod\s+777/,    // Insecure permissions
      /eval\s+/,        // Code injection
      />\s*\/dev\/sd/,  // Direct disk access
    ];

    for (const pattern of dangerous) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: `Dangerous command blocked: matches pattern ${pattern}`
        };
      }
    }

    // Check if confirmation needed
    for (const pattern of this.confirmationRules.execute) {
      if (command.includes(pattern)) {
        return {
          allowed: true,
          requiresConfirmation: true,
          reason: `Command contains '${pattern}' - requires confirmation`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Rate limiting
   */
  async checkRateLimit(agentId, operation) {
    const key = `${agentId}:${operation}`;
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, 60);  // 1 minute window
    }

    const limit = this.getRateLimit(operation);
    if (count > limit) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${count}/${limit} ${operation}s per minute`
      };
    }

    return { allowed: true, remaining: limit - count };
  }

  getRateLimit(operation) {
    const limits = {
      'file:write': 100,   // 100 writes/min
      'file:delete': 20,   // 20 deletes/min
      'command:exec': 50,  // 50 commands/min
      'api:call': 200      // 200 API calls/min
    };
    return limits[operation] || 10;
  }
}
```

### Agent Wrapper

**Intercept and validate all agent operations**:

```javascript
class SecureAgentWrapper {
  constructor(agent, sandbox) {
    this.agent = agent;
    this.sandbox = sandbox;
    this.auditLog = new AuditLogger();
  }

  async executeCommand(command, context) {
    // 1. Validate command
    const validation = this.sandbox.canExecuteCommand(command);
    if (!validation.allowed) {
      this.auditLog.denied('command', command, validation.reason);
      throw new SecurityError(validation.reason);
    }

    // 2. Request confirmation if needed
    if (validation.requiresConfirmation) {
      const confirmed = await this.requestUserConfirmation({
        type: 'command',
        command,
        reason: validation.reason
      });

      if (!confirmed) {
        this.auditLog.denied('command', command, 'User declined');
        throw new UserCancelled('Command cancelled by user');
      }
    }

    // 3. Rate limit
    const rateCheck = await this.sandbox.checkRateLimit(
      this.agent.id,
      'command:exec'
    );
    if (!rateCheck.allowed) {
      throw new RateLimitError(rateCheck.reason);
    }

    // 4. Execute with timeout
    const result = await this.executeWithTimeout(command, 30000);

    // 5. Audit log
    this.auditLog.success('command', command, result);

    return result;
  }

  async readFile(filePath) {
    const validation = this.sandbox.canAccessFile(filePath, 'read');
    if (!validation.allowed) {
      this.auditLog.denied('read', filePath, validation.reason);
      throw new SecurityError(validation.reason);
    }

    // Read with size limit
    const maxSize = 10 * 1024 * 1024;  // 10MB
    const stats = await fs.stat(filePath);
    if (stats.size > maxSize) {
      throw new SecurityError(`File too large: ${stats.size} > ${maxSize}`);
    }

    const content = await fs.readFile(filePath, 'utf-8');
    this.auditLog.success('read', filePath, { size: content.length });

    return content;
  }

  async writeFile(filePath, content) {
    const validation = this.sandbox.canAccessFile(filePath, 'write');
    if (!validation.allowed) {
      throw new SecurityError(validation.reason);
    }

    if (validation.requiresConfirmation) {
      const confirmed = await this.requestUserConfirmation({
        type: 'write',
        file: filePath,
        size: content.length,
        preview: content.substring(0, 500)
      });

      if (!confirmed) {
        throw new UserCancelled('Write cancelled by user');
      }
    }

    await fs.writeFile(filePath, content);
    this.auditLog.success('write', filePath, { size: content.length });
  }
}
```

---

## MCP Server Architecture (Centralized)

### Design Decision: Shared MCP Servers

**For local development, use centralized MCP servers** shared across all worktrees:

**Rationale**:
- ✅ Minimal resource overhead (one MCP instance per type)
- ✅ Simpler to manage and debug
- ✅ Faster startup times
- ✅ Acceptable risk for local single-user environment
- ✅ Still maintain validation and rate limiting

**Security Model**: Defense at the application layer, not container isolation

```javascript
class MCPServerManager {
  constructor() {
    this.servers = new Map();  // One instance per MCP type
    this.validator = new MCPRequestValidator();
    this.auditLog = new AuditLogger();
  }

  /**
   * Get or start centralized MCP server
   */
  async getMCPServer(serverName) {
    if (!this.servers.has(serverName)) {
      console.log(`Starting centralized MCP server: ${serverName}`);

      const server = await this.startMCPProcess(serverName);

      // Wrap with validation layer
      const wrappedServer = this.wrapWithValidation(server);

      this.servers.set(serverName, wrappedServer);
    }

    return this.servers.get(serverName);
  }

  /**
   * Start MCP server as local process
   */
  async startMCPProcess(serverName) {
    const config = this.getServerConfig(serverName);

    // Start via npx (auto-installs if needed)
    const process = spawn('npx', ['-y', config.package], {
      cwd: this.getMCPWorkingDir(),
      env: {
        ...process.env,
        ...config.env
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Setup JSON-RPC communication
    const rpcClient = new JsonRpcClient(process.stdin, process.stdout);

    return {
      name: serverName,
      process,
      rpcClient,
      config
    };
  }

  /**
   * Route request with worktree context
   */
  async handleRequest(worktreeName, serverName, request) {
    const server = await this.getMCPServer(serverName);

    // Add worktree context
    const contextualRequest = {
      ...request,
      context: {
        worktree: worktreeName,
        workingDirectory: this.getWorktreePath(worktreeName)
      }
    };

    // Validate request
    await this.validator.validate(contextualRequest, server.config);

    // Forward to MCP server
    const response = await server.rpcClient.request(contextualRequest);

    // Audit log
    this.auditLog.record({
      worktree: worktreeName,
      server: serverName,
      method: request.method,
      params: this.redactSecrets(request.params),
      timestamp: Date.now()
    });

    return response;
  }
}
```

### Request Validation Layer

**All MCP requests go through validation**:

```javascript
class MCPRequestValidator {
  /**
   * Validate MCP request before forwarding
   */
  async validate(request, serverConfig) {
    // 1. Validate worktree access
    if (request.context?.workingDirectory) {
      const worktreePath = request.context.workingDirectory;

      // Ensure path is within allowed worktrees directory
      if (!this.isValidWorktreePath(worktreePath)) {
        throw new SecurityError(`Invalid worktree path: ${worktreePath}`);
      }
    }

    // 2. Validate file paths in request
    if (request.params?.path) {
      const validation = this.validateFilePath(
        request.params.path,
        serverConfig.allowedPaths || []
      );

      if (!validation.allowed) {
        throw new SecurityError(validation.reason);
      }
    }

    // 3. Rate limiting
    const rateCheck = await this.checkRateLimit(
      request.context.worktree,
      serverConfig.name,
      request.method
    );

    if (!rateCheck.allowed) {
      throw new RateLimitError(rateCheck.reason);
    }

    // 4. Method allowlist (per server config)
    if (serverConfig.allowedMethods) {
      if (!serverConfig.allowedMethods.includes(request.method)) {
        throw new SecurityError(
          `Method ${request.method} not allowed for ${serverConfig.name}`
        );
      }
    }

    return { valid: true };
  }

  validateFilePath(filePath, allowedPaths) {
    const normalized = path.normalize(filePath);

    // Block directory traversal
    if (normalized.includes('..')) {
      return {
        allowed: false,
        reason: 'Directory traversal not allowed'
      };
    }

    // Block absolute paths outside worktree
    if (path.isAbsolute(normalized)) {
      return {
        allowed: false,
        reason: 'Absolute paths outside worktree not allowed'
      };
    }

    // Check against allowed paths
    if (allowedPaths.length > 0) {
      const isAllowed = allowedPaths.some(allowed =>
        normalized.startsWith(allowed)
      );

      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Path ${filePath} not in allowed paths`
        };
      }
    }

    return { allowed: true };
  }
}
```

### MCP Server Configuration

**Configure each MCP server with permissions**:

```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "package": "@modelcontextprotocol/server-filesystem",
        "enabled": true,
        "allowedPaths": [
          "src/",
          "tests/",
          "docs/"
        ],
        "deniedPaths": [
          ".env",
          ".env.local",
          "secrets/",
          ".git/config"
        ],
        "allowedMethods": [
          "read_file",
          "write_file",
          "list_directory"
        ],
        "rateLimit": {
          "requestsPerMinute": 100
        }
      },
      "github": {
        "package": "@modelcontextprotocol/server-github",
        "enabled": true,
        "allowedMethods": [
          "create_issue",
          "create_pr",
          "list_issues",
          "get_pr"
        ],
        "rateLimit": {
          "requestsPerMinute": 50
        },
        "env": {
          "GITHUB_TOKEN": "${GITHUB_TOKEN}"
        }
      },
      "postgres": {
        "package": "@modelcontextprotocol/server-postgres",
        "enabled": true,
        "allowedMethods": [
          "query"
        ],
        "deniedMethods": [
          "execute_ddl",  // No DROP TABLE, etc.
          "execute_dml"   // No INSERT/UPDATE/DELETE
        ],
        "rateLimit": {
          "requestsPerMinute": 30
        },
        "env": {
          "DATABASE_URL": "postgresql://readonly@localhost:${POSTGRES_PORT}/${WORKTREE_NAME}"
        }
      }
    }
  }
}
```

---

## Container Security

### Rootless by Default

```javascript
class ContainerRuntime {
  getSecurityOptions() {
    return {
      // Run as non-root user
      user: '1000:1000',

      // Drop all capabilities
      capDrop: ['ALL'],

      // No new privileges
      securityOpt: ['no-new-privileges'],

      // Read-only root filesystem (where possible)
      readOnlyRootFilesystem: true,

      // Seccomp profile
      seccompProfile: 'docker-default',

      // SELinux/AppArmor
      selinuxLabel: 'container_runtime_t'
    };
  }

  async startService(service, worktree) {
    const securityOpts = this.getSecurityOptions();

    // Override if service explicitly requires privileges
    if (service.privileged) {
      const confirmed = await this.requestUserConfirmation({
        type: 'privileged-container',
        service: service.name,
        warning: 'This service requires elevated privileges. Only allow if necessary.'
      });

      if (!confirmed) {
        throw new SecurityError('Privileged container rejected by user');
      }
    }

    // Never allow host Docker socket by default
    if (service.volumes?.includes('/var/run/docker.sock')) {
      throw new SecurityError(
        'Mounting Docker socket is not allowed for security reasons'
      );
    }

    return this.startWithSecurityOptions(service, securityOpts);
  }
}
```

### Network Isolation

**Each worktree gets isolated network**:

```javascript
async createWorktree(name, options) {
  // Create dedicated network
  await this.runtime.exec(
    `${this.runtime.getCommand()} network create vibe-${name}`
  );

  // Set project name for volume/network isolation
  const projectName = `vibe-${name}`;

  // Start services in isolated network
  await this.runtime.exec(
    `${this.runtime.getComposeCommand()} up -d`,
    {
      env: {
        COMPOSE_PROJECT_NAME: projectName
      }
    }
  );
}
```

---

## WebSocket Security

### Authentication

```javascript
class WebSocketAuth {
  constructor() {
    this.sessions = new Map();
    this.tokenExpiry = 15 * 60 * 1000;  // 15 minutes
  }

  async createSession() {
    const token = crypto.randomBytes(32).toString('hex');
    const session = {
      id: generateId(),
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.tokenExpiry
    };

    this.sessions.set(token, session);
    return token;
  }

  validateToken(token) {
    const session = this.sessions.get(token);

    if (!session) {
      return { valid: false, reason: 'Invalid token' };
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return { valid: false, reason: 'Token expired' };
    }

    return { valid: true, session };
  }

  async handleConnection(ws, request) {
    // Extract token from query string or header
    const token = this.extractToken(request);

    const validation = this.validateToken(token);
    if (!validation.valid) {
      ws.close(4001, validation.reason);
      return;
    }

    // Attach session to websocket
    ws.session = validation.session;

    // Refresh token on activity
    ws.on('message', () => this.refreshSession(token));
  }
}
```

### Rate Limiting

```javascript
class WebSocketRateLimiter {
  constructor() {
    this.limits = {
      messagesPerMinute: 100,
      bytesPerMinute: 10 * 1024 * 1024  // 10MB
    };

    this.counters = new Map();
  }

  async checkLimit(sessionId, messageSize) {
    const key = `${sessionId}:${Math.floor(Date.now() / 60000)}`;

    if (!this.counters.has(key)) {
      this.counters.set(key, { messages: 0, bytes: 0 });
      setTimeout(() => this.counters.delete(key), 61000);
    }

    const counter = this.counters.get(key);
    counter.messages++;
    counter.bytes += messageSize;

    if (counter.messages > this.limits.messagesPerMinute) {
      return {
        allowed: false,
        reason: 'Message rate limit exceeded'
      };
    }

    if (counter.bytes > this.limits.bytesPerMinute) {
      return {
        allowed: false,
        reason: 'Bandwidth limit exceeded'
      };
    }

    return { allowed: true };
  }
}
```

### CSRF Protection

```javascript
// Generate CSRF token with session
app.get('/api/session', (req, res) => {
  const token = wsAuth.createSession();
  const csrfToken = crypto.randomBytes(32).toString('hex');

  res.cookie('CSRF-TOKEN', csrfToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  });

  res.json({ token, csrfToken });
});

// Validate CSRF on WebSocket upgrade
wss.on('upgrade', (request, socket, head) => {
  const csrfToken = request.headers['x-csrf-token'];
  const cookieToken = parseCookie(request.headers.cookie)['CSRF-TOKEN'];

  if (csrfToken !== cookieToken) {
    socket.destroy();
    return;
  }

  // Proceed with WebSocket handshake
});
```

---

## Secrets Management

### OS Keychain Integration

```javascript
class SecretsManager {
  constructor() {
    // Use platform-specific keychain
    this.keychain = this.detectKeychain();
  }

  detectKeychain() {
    if (process.platform === 'darwin') {
      return new MacOSKeychain();
    } else if (process.platform === 'linux') {
      return new LinuxSecretService();
    } else if (process.platform === 'win32') {
      return new WindowsCredentialManager();
    }
    throw new Error('Unsupported platform for secure storage');
  }

  async storeSecret(name, value) {
    await this.keychain.setPassword('vibe-worktrees', name, value);
  }

  async getSecret(name) {
    return await this.keychain.getPassword('vibe-worktrees', name);
  }

  async deleteSecret(name) {
    await this.keychain.deletePassword('vibe-worktrees', name);
  }
}
```

### Secret Redaction

```javascript
class SecretRedactor {
  constructor() {
    this.patterns = [
      /([A-Za-z0-9_-]{20,})/,  // API keys
      /(sk-[A-Za-z0-9]{48})/,  // OpenAI keys
      /(ghp_[A-Za-z0-9]{36})/,  // GitHub tokens
      /(xox[baprs]-[A-Za-z0-9-]{40,})/  // Slack tokens
    ];
  }

  redact(text) {
    let redacted = text;

    for (const pattern of this.patterns) {
      redacted = redacted.replace(pattern, (match) => {
        const visible = match.substring(0, 4);
        return `${visible}${'*'.repeat(match.length - 4)}`;
      });
    }

    return redacted;
  }

  redactObject(obj) {
    const redacted = { ...obj };

    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'apiKey'];

    for (const [key, value] of Object.entries(redacted)) {
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        redacted[key] = this.redact(value);
      }
    }

    return redacted;
  }
}
```

---

## Audit Logging

```javascript
class AuditLogger {
  constructor() {
    this.logFile = path.join(homedir(), '.vibe-worktrees', 'audit.log');
  }

  log(event) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: event.type,
      actor: event.actor,
      action: event.action,
      target: event.target,
      result: event.result,
      reason: event.reason
    };

    // Redact secrets
    const redacted = this.redactor.redactObject(entry);

    // Append to log file
    fs.appendFileSync(
      this.logFile,
      JSON.stringify(redacted) + '\n'
    );

    // Also send to monitoring if configured
    if (this.monitoring) {
      this.monitoring.send(redacted);
    }
  }

  success(action, target, metadata = {}) {
    this.log({
      type: 'success',
      actor: this.getCurrentActor(),
      action,
      target,
      result: 'allowed',
      ...metadata
    });
  }

  denied(action, target, reason) {
    this.log({
      type: 'security',
      actor: this.getCurrentActor(),
      action,
      target,
      result: 'denied',
      reason
    });
  }
}
```

---

## Implementation Checklist

### Phase 4: Security (Immediately)
- [ ] Implement AgentSandbox with directory allowlist
- [ ] Add command validation and rate limiting
- [ ] Create SecureAgentWrapper for all agent operations
- [ ] Implement audit logging for all security events
- [ ] Add user confirmation flow for destructive operations

### Phase 4: MCP Security
- [ ] Container-based MCP server isolation
- [ ] MCP server verification and signature checking
- [ ] Network policy enforcement
- [ ] Resource limits per MCP server

### Phase 4: Container Security
- [ ] Rootless containers by default
- [ ] Capability dropping
- [ ] Network isolation per worktree
- [ ] Deny Docker socket mounting

### Phase 4: WebSocket Security
- [ ] Token-based authentication
- [ ] CSRF protection
- [ ] Rate limiting
- [ ] TLS for remote access

### Phase 4: Secrets
- [ ] OS keychain integration
- [ ] Secret redaction in logs/UI
- [ ] Secure storage for API keys
- [ ] Never persist plaintext secrets

---

## Security Testing

### Tests to Add

```javascript
describe('Security', () => {
  describe('AgentSandbox', () => {
    it('denies access to .env files', () => {
      const result = sandbox.canAccessFile('/.env', 'read');
      expect(result.allowed).toBe(false);
    });

    it('blocks dangerous commands', () => {
      const result = sandbox.canExecuteCommand('rm -rf /');
      expect(result.allowed).toBe(false);
    });

    it('enforces rate limits', async () => {
      for (let i = 0; i < 101; i++) {
        await sandbox.checkRateLimit('agent1', 'file:write');
      }

      const result = await sandbox.checkRateLimit('agent1', 'file:write');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Path Traversal', () => {
    it('blocks directory traversal attempts', () => {
      const result = sandbox.canAccessFile('../../../etc/passwd', 'read');
      expect(result.allowed).toBe(false);
    });

    it('normalizes paths correctly', () => {
      const result = sandbox.canAccessFile('./src/../../../etc/passwd', 'read');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Secret Redaction', () => {
    it('redacts API keys in logs', () => {
      const log = 'Using key sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234';
      const redacted = redactor.redact(log);
      expect(redacted).toContain('sk-a***');
      expect(redacted).not.toContain('abc123');
    });
  });
});
```

---

## Security Review Checklist

Before Phase 7 (Release):
- [ ] Security audit by external reviewer
- [ ] Penetration testing on agent sandbox
- [ ] Dependency vulnerability scan
- [ ] Container image security scan
- [ ] Secret detection in codebase
- [ ] WebSocket security review
- [ ] Documentation review for security guidance

---

**Document Version**: 1.0
**Last Updated**: 2025-10-26
**Status**: Ready for Implementation
