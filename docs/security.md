# Security Guide

This guide provides comprehensive information about VibeTrees security features, configuration, and best practices.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Security Features](#security-features)
3. [Configuration](#configuration)
4. [Attack Prevention](#attack-prevention)
5. [API Reference](#api-reference)
6. [Testing](#testing)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)

## Architecture Overview

VibeTrees implements security using a defense-in-depth approach with multiple layers:

```
┌────────────────────────────────────────┐
│          User Input                     │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│    Input Validation Layer              │
│  - Path traversal prevention           │
│  - Command injection prevention        │
│  - Name sanitization                   │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│    WebSocket Security Layer            │
│  - Authentication                      │
│  - Rate limiting                       │
│  - CORS validation                     │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│    Application Logic                   │
│  - Worktree management                 │
│  - Container orchestration             │
│  - MCP bridge                          │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│    Secret Sanitization Layer           │
│  - Log sanitization                    │
│  - Terminal sanitization               │
│  - Error sanitization                  │
└────────────────────────────────────────┘
```

## Security Features

### 1. Input Validation

The `InputValidator` module prevents injection attacks by validating all user input.

#### Worktree Names

```javascript
import { InputValidator } from './scripts/security/input-validator.mjs';

// Valid
InputValidator.validateWorktreeName('feature-auth');  // ✓
InputValidator.validateWorktreeName('bug_fix_123');   // ✓

// Invalid (throws Error)
InputValidator.validateWorktreeName('../etc/passwd'); // ✗ Path traversal
InputValidator.validateWorktreeName('test; rm -rf /'); // ✗ Command injection
InputValidator.validateWorktreeName('test/branch');   // ✗ Invalid character
```

#### File Paths

```javascript
// Validate path is within allowed directory
const safePath = InputValidator.validatePath(
  'src/file.txt',
  '/home/user/project'
);
// Returns: /home/user/project/src/file.txt

// Prevents path traversal
InputValidator.validatePath('../../../etc/passwd', '/home/user/project');
// Throws: Error('Path traversal detected')
```

#### Commands

```javascript
// Whitelist-based validation
InputValidator.validateCommand('claude');  // ✓
InputValidator.validateCommand('bash');    // ✓

InputValidator.validateCommand('rm -rf /');  // ✗ Not whitelisted
InputValidator.validateCommand('curl http://evil.com'); // ✗ Not whitelisted
```

### 2. WebSocket Security

The `WebSocketSecurity` module provides authentication, rate limiting, and CORS protection.

#### Basic Setup

```javascript
import { WebSocketSecurity } from './scripts/security/websocket-security.mjs';

const security = new WebSocketSecurity({
  authEnabled: true,
  allowedOrigins: [
    'http://localhost:3335',
    'http://127.0.0.1:3335',
    'https://vibetrees.example.com'
  ],
  rateLimit: {
    maxRequests: 100,  // Max requests per window
    windowMs: 60000    // 1 minute window
  },
  connectionTimeout: 300000  // 5 minutes
});

// Start timeout monitoring
security.startTimeoutMonitoring();
```

#### Authentication

```javascript
// Authenticate WebSocket connection
wss.on('connection', (ws, req) => {
  const auth = security.authenticate(ws, req);

  if (!auth.allowed) {
    ws.send(JSON.stringify({ error: auth.error }));
    ws.close();
    return;
  }

  console.log(`Client connected: ${auth.clientId}`);
});
```

#### Generating Tokens

```javascript
// Generate authentication token
const token = security.generateToken({ userId: '123' });

// Client includes token in URL or header
const ws = new WebSocket('ws://localhost:3335/?token=' + token);
// OR
const ws = new WebSocket('ws://localhost:3335/', {
  headers: { Authorization: `Bearer ${token}` }
});
```

#### Rate Limiting

```javascript
// Check rate limit before processing message
ws.on('message', (message) => {
  const validation = security.validateMessage(ws, message);

  if (!validation.valid) {
    ws.send(JSON.stringify({ error: validation.error }));
    return;
  }

  // Process message...
});
```

### 3. Secret Sanitization

The `SecretSanitizer` module detects and removes secrets from logs, terminal output, and error messages.

#### Basic Usage

```javascript
import { SecretSanitizer, sanitize, hasSecrets } from './scripts/security/secret-sanitizer.mjs';

const sanitizer = new SecretSanitizer();

// Sanitize text
const { sanitized, detected } = sanitizer.sanitize(
  'My API key is sk-ant-api03-abc123...'
);
console.log(sanitized);  // "My API key is sk-ant-[REDACTED]"
console.log(detected);   // [{ type: 'Anthropic API Key', count: 1 }]

// Quick check
if (hasSecrets(text)) {
  console.log('⚠️  Secrets detected!');
}
```

#### Detected Secrets

The sanitizer detects:

- **API Keys**: Anthropic, OpenAI, GitHub, AWS
- **Database Credentials**: PostgreSQL, MySQL, MongoDB connection strings
- **Private Keys**: RSA, SSH, EC private keys
- **JWT Tokens**: JSON Web Tokens
- **Bearer Tokens**: OAuth bearer tokens
- **Passwords**: In URLs, environment variables, etc.
- **PII**: Credit cards, SSNs (compliance)

#### Terminal Sanitization

```javascript
// Sanitize terminal scrollback
const lines = [
  'Logging in...',
  'API_KEY=sk-secret123456',
  'Connected to database'
];

const sanitized = sanitizer.sanitizeScrollback(lines);
// ['Logging in...', 'API_KEY=[REDACTED]', 'Connected to database']
```

#### Error Sanitization

```javascript
// Sanitize error messages before displaying
try {
  connectToDatabase('postgresql://user:password@localhost/db');
} catch (error) {
  const safeError = sanitizer.sanitizeError(error);
  console.error(safeError);  // Password redacted
  logToFile(safeError);      // Safe to log
}
```

#### Environment Variables

```javascript
// Sanitize env vars before logging
const env = {
  API_KEY: 'sk-secret123',
  DATABASE_PASSWORD: 'dbPass123',
  PORT: '3000'
};

const safeEnv = sanitizer.sanitizeEnv(env);
console.log(safeEnv);
// { API_KEY: '[REDACTED]', DATABASE_PASSWORD: '[REDACTED]', PORT: '3000' }
```

### 4. Container Security

#### Command Validation

```javascript
// Validate Docker Compose commands
InputValidator.validateComposeCommand('up -d');     // ✓
InputValidator.validateComposeCommand('logs -f');   // ✓

InputValidator.validateComposeCommand('up; rm -rf /'); // ✗ Injection
InputValidator.validateComposeCommand('exec bash');    // ✗ Not whitelisted
```

#### Service Name Validation

```javascript
// Validate service names to prevent injection
InputValidator.validateServiceName('postgres');      // ✓
InputValidator.validateServiceName('api-server');    // ✓

InputValidator.validateServiceName('api; rm -rf /'); // ✗ Injection
InputValidator.validateServiceName('api && ls');     // ✗ Injection
```

## Configuration

### WebSocket Security Configuration

Create a configuration file:

```javascript
// config/security.mjs
export const securityConfig = {
  websocket: {
    authEnabled: true,
    allowedOrigins: [
      'http://localhost:3335',
      'http://127.0.0.1:3335',
      // Add your domains
      'https://vibetrees.yourdomain.com'
    ],
    rateLimit: {
      maxRequests: 100,
      windowMs: 60000
    },
    connectionTimeout: 300000
  },

  secretSanitization: {
    enabled: true,
    customPatterns: [
      // Add custom secret patterns
      {
        name: 'Custom API Key',
        pattern: /custom-[a-zA-Z0-9]{32}/g,
        replacement: 'custom-[REDACTED]'
      }
    ]
  }
};
```

### Environment Variables

Configure security via environment variables:

```bash
# Disable authentication (development only)
VIBE_AUTH_DISABLED=true

# Custom rate limit
VIBE_RATE_LIMIT_MAX=200
VIBE_RATE_LIMIT_WINDOW=120000  # 2 minutes

# Allowed origins (comma-separated)
VIBE_ALLOWED_ORIGINS="http://localhost:3335,https://app.example.com"

# Connection timeout
VIBE_CONNECTION_TIMEOUT=600000  # 10 minutes

# Enable secret sanitization
VIBE_SANITIZE_SECRETS=true
```

## Attack Prevention

### Path Traversal Prevention

**Attack**: `../../../etc/passwd`

**Prevention**:
```javascript
try {
  const safePath = InputValidator.validatePath(userPath, allowedBase);
  // Use safePath...
} catch (error) {
  console.error('Path traversal detected:', error.message);
  return { error: 'Invalid path' };
}
```

### Command Injection Prevention

**Attack**: `test; rm -rf /`

**Prevention**:
```javascript
try {
  const safeCommand = InputValidator.validateCommand(userCommand);
  // Execute safeCommand...
} catch (error) {
  console.error('Invalid command:', error.message);
  return { error: 'Command not allowed' };
}
```

### SQL Injection Prevention

VibeTrees uses connection strings, not direct SQL queries. Validation prevents malicious connection strings:

```javascript
// Malicious input
const maliciousUrl = 'postgresql://user:pass@localhost/db; DROP TABLE users;';

// Sanitized output
const { sanitized } = sanitizer.sanitize(maliciousUrl);
// 'postgresql://[REDACTED]:[REDACTED]@[host]'
```

### ReDoS Prevention

**Attack**: Expensive regex patterns causing CPU exhaustion

**Prevention**:
```javascript
try {
  const safePattern = InputValidator.validateSearchPattern(userPattern);
  // Use safePattern for search...
} catch (error) {
  console.error('Dangerous regex pattern:', error.message);
  return { error: 'Invalid search pattern' };
}
```

## API Reference

### InputValidator

#### Methods

- `validateWorktreeName(name)` - Validate worktree name (alphanumeric, hyphens, underscores)
- `validateBranchName(branch)` - Validate git branch name
- `validatePath(path, allowedBase)` - Validate file path within base directory
- `validateServiceName(name)` - Validate Docker service name
- `validatePort(port)` - Validate port number (1024-65535)
- `validateEnvVarName(name)` - Validate environment variable name
- `validateEnvVarValue(value)` - Validate environment variable value
- `validateCommand(command)` - Validate command against whitelist
- `sanitizeGitArgs(args)` - Sanitize git command arguments
- `validateComposeCommand(command)` - Validate Docker Compose command
- `validateAgentName(agentName)` - Validate AI agent name
- `validateWebSocketUrl(url)` - Validate WebSocket URL
- `validateSearchPattern(pattern)` - Validate search pattern (ReDoS prevention)

### WebSocketSecurity

#### Constructor Options

```javascript
{
  authEnabled: boolean,      // Enable authentication (default: true)
  allowedOrigins: string[],  // CORS whitelist
  rateLimit: {
    maxRequests: number,     // Max requests per window
    windowMs: number         // Time window in milliseconds
  },
  connectionTimeout: number  // Inactivity timeout in milliseconds
}
```

#### Methods

- `validateOrigin(origin)` - Check if origin is allowed
- `authenticate(ws, req)` - Authenticate WebSocket connection
- `validateMessage(ws, message)` - Validate incoming message
- `startTimeoutMonitoring()` - Start monitoring for inactive connections
- `cleanupConnection(ws)` - Clean up connection tracking
- `generateToken(metadata)` - Generate authentication token
- `getStats()` - Get security statistics

### SecretSanitizer

#### Methods

- `sanitize(text)` - Sanitize text and return { sanitized, detected }
- `sanitizeEnv(env)` - Sanitize environment variables object
- `sanitizeScrollback(lines)` - Sanitize terminal scrollback array
- `sanitizeError(error)` - Sanitize error message
- `hasSecrets(text)` - Check if text contains secrets (boolean)
- `getDetectionLog()` - Get detection log entries
- `clearDetectionLog()` - Clear detection log
- `getStats()` - Get detection statistics

## Testing

### Run Security Tests

```bash
# Run all security tests
npm test -- --grep "security|inject|sanitize|validate"

# Run input validation tests
npm test -- scripts/security/input-validator.test.mjs

# Run secret sanitizer tests
npm test -- scripts/security/secret-sanitizer.test.mjs
```

### Security Test Coverage

Our security tests cover:

- ✓ Path traversal prevention
- ✓ Command injection prevention
- ✓ SQL injection prevention
- ✓ ReDoS prevention
- ✓ Secret detection and sanitization
- ✓ Rate limiting
- ✓ Authentication
- ✓ CORS validation

### Manual Security Testing

Test path traversal:
```bash
curl -X POST http://localhost:3335/api/worktrees \
  -H "Content-Type: application/json" \
  -d '{"branchName": "../../../etc/passwd"}'
# Expected: 400 Bad Request
```

Test command injection:
```bash
curl -X POST http://localhost:3335/api/worktrees \
  -H "Content-Type: application/json" \
  -d '{"branchName": "test; rm -rf /"}'
# Expected: 400 Bad Request
```

Test rate limiting:
```bash
for i in {1..150}; do
  curl http://localhost:3335/api/worktrees &
done
# Expected: 429 Too Many Requests after 100 requests
```

## Monitoring

### Security Statistics

Monitor security metrics:

```javascript
// WebSocket security stats
const stats = security.getStats();
console.log('Active connections:', stats.activeConnections);
console.log('Active tokens:', stats.activeTokens);
console.log('Blocked clients:', stats.rateLimiter.blockedClients);

// Secret detection stats
const secretStats = sanitizer.getStats();
console.log('Total detections:', secretStats.totalDetections);
console.log('Secret types:', secretStats.secretTypes);
```

### Logging

Enable security logging:

```javascript
// Log validation failures
try {
  InputValidator.validateWorktreeName(userInput);
} catch (error) {
  console.error('[SECURITY] Invalid worktree name:', {
    input: userInput,
    error: error.message,
    timestamp: new Date().toISOString()
  });
}

// Log secret detections
const { sanitized, detected } = sanitizer.sanitize(text);
if (detected.length > 0) {
  console.warn('[SECURITY] Secrets detected:', {
    count: detected.length,
    types: detected.map(d => d.type),
    timestamp: new Date().toISOString()
  });
}
```

### Alerts

Set up alerts for security events:

```javascript
// Rate limit exceeded
rateLimiter.on('limit-exceeded', (clientId) => {
  sendAlert({
    level: 'warning',
    message: `Rate limit exceeded for ${clientId}`,
    timestamp: new Date()
  });
});

// Invalid authentication
security.on('auth-failed', (clientId, reason) => {
  sendAlert({
    level: 'error',
    message: `Authentication failed for ${clientId}: ${reason}`,
    timestamp: new Date()
  });
});
```

## Troubleshooting

### Common Issues

#### 1. WebSocket Connection Refused

**Symptom**: Cannot connect to WebSocket

**Cause**: Authentication enabled but no token provided

**Solution**:
```javascript
// Generate token
const token = await fetch('http://localhost:3335/api/auth/token').then(r => r.json());

// Connect with token
const ws = new WebSocket(`ws://localhost:3335/?token=${token.token}`);
```

#### 2. Rate Limit Exceeded

**Symptom**: 429 Too Many Requests

**Cause**: Client exceeded rate limit

**Solution**:
```javascript
// Increase rate limit
const security = new WebSocketSecurity({
  rateLimit: {
    maxRequests: 200,  // Increase from 100
    windowMs: 60000
  }
});

// Or reset rate limit for specific client
rateLimiter.reset(clientId);
```

#### 3. Secrets Not Detected

**Symptom**: Secrets visible in logs

**Cause**: Secret sanitizer disabled or pattern not recognized

**Solution**:
```javascript
// Ensure sanitizer is enabled
const sanitizer = new SecretSanitizer({ enabled: true });

// Add custom pattern
sanitizer.patterns.push({
  name: 'Custom Secret',
  pattern: /custom-[a-z0-9]{32}/g,
  replacement: 'custom-[REDACTED]'
});
```

#### 4. Path Validation Failing

**Symptom**: Valid paths rejected

**Cause**: Path contains valid but unexpected characters

**Solution**:
```javascript
// Use normalize before validation
const normalizedPath = normalize(userPath);
const safePath = InputValidator.validatePath(normalizedPath, baseDir);
```

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/archive/2023/2023_cwe_top25.html)
- [NIST Secure Coding Standards](https://www.nist.gov/cybersecurity)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

## Support

For security questions or concerns:
- Email: security@vibetrees.dev
- GitHub Issues: Use "security" label
- Documentation: https://vibetrees.dev/docs/security

---

Last updated: 2025-01-28
