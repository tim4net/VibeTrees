# Security Quick Reference Card

**Quick reference for developers working with VibeTrees security features**

---

## Input Validation

### Always validate user input

```javascript
import { InputValidator } from './scripts/security/input-validator.mjs';

// Worktree names
const safeName = InputValidator.validateWorktreeName(userInput);

// Branch names
const safeBranch = InputValidator.validateBranchName(userInput);

// File paths (with base directory check)
const safePath = InputValidator.validatePath(userInput, allowedBase);

// Service names
const safeService = InputValidator.validateServiceName(userInput);

// Ports (1024-65535)
const safePort = InputValidator.validatePort(userInput);

// Commands (whitelist only)
const safeCommand = InputValidator.validateCommand(userInput);
```

---

## Secret Sanitization

### Always sanitize before logging

```javascript
import { SecretSanitizer, sanitize, hasSecrets } from './scripts/security/secret-sanitizer.mjs';

// Quick sanitization
const safeText = sanitize('API_KEY=sk-secret123');
// "API_KEY=[REDACTED]"

// Check for secrets
if (hasSecrets(text)) {
  console.warn('⚠️ Secrets detected - sanitizing');
}

// Full sanitization with detection info
const sanitizer = new SecretSanitizer();
const { sanitized, detected } = sanitizer.sanitize(text);

// Sanitize environment variables
const safeEnv = sanitizer.sanitizeEnv(process.env);

// Sanitize errors
try {
  riskyOperation();
} catch (error) {
  const safeError = sanitizer.sanitizeError(error);
  console.error(safeError); // Safe to log
}

// Sanitize terminal output
terminal.onData((data) => {
  const { sanitized } = sanitizer.sanitize(data);
  ws.send(sanitized);
});
```

---

## WebSocket Security

### Always authenticate connections

```javascript
import { WebSocketSecurity } from './scripts/security/websocket-security.mjs';

// Initialize
const security = new WebSocketSecurity({
  authEnabled: true,
  allowedOrigins: ['http://localhost:3335'],
  rateLimit: { maxRequests: 100, windowMs: 60000 }
});

// Authenticate connection
wss.on('connection', (ws, req) => {
  const auth = security.authenticate(ws, req);

  if (!auth.allowed) {
    ws.send(JSON.stringify({ error: auth.error }));
    ws.close();
    return;
  }

  // Connection authenticated ✅
});

// Validate messages
ws.on('message', (message) => {
  const validation = security.validateMessage(ws, message);

  if (!validation.valid) {
    ws.send(JSON.stringify({ error: validation.error }));
    return;
  }

  // Message valid ✅
});

// Cleanup on close
ws.on('close', () => {
  security.cleanupConnection(ws);
});
```

---

## Common Patterns

### Pattern 1: Validate All Endpoints

```javascript
app.post('/api/worktrees', async (req, res) => {
  try {
    // 1. Validate inputs
    const branchName = InputValidator.validateBranchName(req.body.branchName);
    const fromBranch = InputValidator.validateBranchName(req.body.fromBranch);

    // 2. Process safely
    const result = await createWorktree(branchName, fromBranch);

    // 3. Sanitize response
    res.json(result);

  } catch (error) {
    // 4. Sanitize errors
    const safeError = sanitizer.sanitizeError(error);
    res.status(400).json({ error: safeError });
  }
});
```

### Pattern 2: Secure Command Execution

```javascript
// ❌ NEVER do this:
execSync(`git branch ${userInput}`);

// ✅ ALWAYS do this:
const safeBranch = InputValidator.validateBranchName(userInput);
const safeArgs = InputValidator.sanitizeGitArgs(['branch', safeBranch]);
execSync(`git ${safeArgs.join(' ')}`);
```

### Pattern 3: Secure Path Operations

```javascript
// ❌ NEVER do this:
const path = join(baseDir, userInput);
readFileSync(path);

// ✅ ALWAYS do this:
const safePath = InputValidator.validatePath(userInput, baseDir);
readFileSync(safePath);
```

---

## Cheat Sheet

### Validation Methods

| Input Type | Validator Method | Allowed Characters |
|------------|------------------|-------------------|
| Worktree name | `validateWorktreeName()` | `[a-zA-Z0-9_-]` |
| Branch name | `validateBranchName()` | `[a-zA-Z0-9/_.-]` |
| File path | `validatePath()` | Any, checked against base |
| Service name | `validateServiceName()` | `[a-zA-Z0-9_-]` |
| Port | `validatePort()` | `1024-65535` |
| Command | `validateCommand()` | Whitelist only |
| Env var name | `validateEnvVarName()` | `[A-Z_][A-Z0-9_]*` |

### Detected Secrets

- API Keys (Anthropic, OpenAI, GitHub, AWS)
- Database URLs (PostgreSQL, MySQL, MongoDB)
- Private Keys (RSA, SSH, EC)
- JWT Tokens
- Bearer Tokens
- Passwords
- Credit Cards
- SSNs

### Security Headers

Automatically added by middleware:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security`
- `Access-Control-Allow-Origin` (CORS)

---

## Testing

### Run Security Tests

```bash
# All security tests
npm run test:security

# Watch mode
npm run test:security:watch

# Full test suite
npm test

# Security audit
npm run security:audit
```

### Manual Testing

```bash
# Test path traversal prevention
curl -X POST http://localhost:3335/api/worktrees \
  -d '{"branchName": "../../../etc/passwd"}'
# Expected: 400 Bad Request

# Test command injection prevention
curl -X POST http://localhost:3335/api/worktrees \
  -d '{"branchName": "test; rm -rf /"}'
# Expected: 400 Bad Request

# Test rate limiting
for i in {1..150}; do curl http://localhost:3335/api/worktrees & done
# Expected: 429 Too Many Requests after 100
```

---

## Configuration

### Environment Variables

```bash
# Disable auth (dev only!)
VIBE_AUTH_DISABLED=true

# Rate limiting
VIBE_RATE_LIMIT_MAX=100
VIBE_RATE_LIMIT_WINDOW=60000

# Allowed origins
VIBE_ALLOWED_ORIGINS="http://localhost:3335,https://app.example.com"

# Connection timeout
VIBE_CONNECTION_TIMEOUT=300000

# Secret sanitization
VIBE_SANITIZE_SECRETS=true
```

### Config File

```javascript
// .vibe/config.json
{
  "security": {
    "websocket": {
      "authEnabled": true,
      "allowedOrigins": ["http://localhost:3335"],
      "rateLimit": {
        "maxRequests": 100,
        "windowMs": 60000
      }
    },
    "secretSanitization": {
      "enabled": true
    }
  }
}
```

---

## Common Mistakes

### ❌ Don't Do This

```javascript
// Command injection risk
execSync(`docker compose ${userCommand}`);

// Path traversal risk
readFileSync(join('/tmp', userPath));

// Secret exposure
console.log('API_KEY:', process.env.API_KEY);

// No validation
app.post('/api/worktrees', (req, res) => {
  createWorktree(req.body.name); // ❌
});

// No authentication
wss.on('connection', (ws) => {
  // Anyone can connect ❌
});
```

### ✅ Do This Instead

```javascript
// Validate commands
const safeCmd = InputValidator.validateComposeCommand(userCommand);
execSync(`docker compose ${safeCmd}`);

// Validate paths
const safePath = InputValidator.validatePath(userPath, '/tmp');
readFileSync(safePath);

// Sanitize secrets
const { sanitized } = sanitizer.sanitizeEnv(process.env);
console.log(sanitized);

// Always validate
app.post('/api/worktrees', (req, res) => {
  const safeName = InputValidator.validateWorktreeName(req.body.name);
  createWorktree(safeName); // ✅
});

// Always authenticate
wss.on('connection', (ws, req) => {
  const auth = security.authenticate(ws, req);
  if (!auth.allowed) {
    ws.close();
    return;
  }
  // ✅
});
```

---

## Monitoring

### Security Stats

```javascript
// WebSocket stats
const stats = security.getStats();
console.log({
  connections: stats.activeConnections,
  tokens: stats.activeTokens,
  blockedClients: stats.rateLimiter.blockedClients
});

// Secret detection stats
const secretStats = sanitizer.getStats();
console.log({
  detections: secretStats.totalDetections,
  types: secretStats.secretTypes
});
```

### Logging Security Events

```javascript
// Log validation failures
try {
  InputValidator.validateWorktreeName(input);
} catch (error) {
  console.error('[SECURITY] Invalid input:', {
    type: 'validation_failure',
    input: input,
    error: error.message
  });
}

// Log secret detections
const { detected } = sanitizer.sanitize(text);
if (detected.length > 0) {
  console.warn('[SECURITY] Secrets detected:', {
    count: detected.length,
    types: detected.map(d => d.type)
  });
}
```

---

## Emergency Response

### If you discover a security issue:

1. **Don't panic** - Follow the process
2. **Don't push to GitHub** - Report first
3. **Report via email**: security@vibetrees.dev
4. **Include**: Type, location, reproduction steps
5. **Wait for response**: 48 hours max

### If secrets are exposed:

1. **Rotate credentials immediately**
2. **Check git history** for exposure
3. **Review logs** for unauthorized access
4. **Update secret detection patterns** if needed

---

## Resources

- **Full Guide**: `docs/security.md`
- **Security Policy**: `SECURITY.md`
- **Audit Report**: `docs/security-audit-report.md`
- **OWASP Top 10**: https://owasp.org/www-project-top-ten/

---

**Keep this card handy while developing!**

*Last updated: 2025-01-28*
