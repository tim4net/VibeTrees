# Security Policy

## Overview

VibeTrees takes security seriously. This document outlines our security practices, vulnerability reporting process, and security features.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: security@vibetrees.dev (or the repository owner's email)

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the following information:

- Type of issue (e.g., command injection, path traversal, etc.)
- Full paths of source file(s) related to the issue
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

This information will help us triage your report more quickly.

## Security Features

VibeTrees implements multiple security layers:

### Input Validation

- **Path traversal prevention**: All file paths validated against allowed base directories
- **Command injection prevention**: Whitelist-based command validation
- **Service name sanitization**: Only alphanumeric, hyphens, and underscores allowed
- **Branch name validation**: Git-compliant naming rules enforced
- **Port number validation**: Only ports 1024-65535 allowed

### WebSocket Security

- **Authentication**: Token-based authentication for WebSocket connections
- **Rate limiting**: 100 requests per minute per client (configurable)
- **CORS protection**: Origin validation against whitelist
- **Connection timeout**: Automatic cleanup of inactive connections (5 minutes)
- **Message size limits**: Maximum 1MB per message

### Container Security

- **Command sanitization**: Docker/Podman commands validated against whitelist
- **Environment variable validation**: Safe env var handling
- **Service isolation**: Each worktree gets unique ports and network isolation
- **Sudo validation**: Minimal sudo usage, validated commands only

### Secret Protection

- **Automatic detection**: Scans for API keys, passwords, tokens, private keys
- **Terminal sanitization**: Secrets removed from terminal scrollback
- **Log sanitization**: Secrets removed from error messages and logs
- **Environment sanitization**: Sensitive env vars redacted in logs

### MCP Bridge Security

- **Read-only access**: Bridge provides read-only access to other worktrees
- **Path validation**: Prevents access outside worktree directories
- **File size limits**: Maximum 1MB per file read
- **Sandboxing**: Each worktree operates in isolated sandbox

## Security Best Practices

### For Users

1. **Keep VibeTrees updated**: Always use the latest version for security patches
2. **Use authentication**: Enable WebSocket authentication in production environments
3. **Restrict network access**: Use `npm run web` (localhost only) unless you need network access
4. **Review environment variables**: Don't expose sensitive credentials in `.env` files
5. **Use OS keychain**: Store API keys in system keychain when possible
6. **Monitor logs**: Check for suspicious activity in application logs
7. **Limit access**: Only allow trusted users to access the web interface

### For Developers

1. **Validate all input**: Use `InputValidator` for all user-provided data
2. **Sanitize secrets**: Use `SecretSanitizer` before logging or displaying data
3. **Check authentication**: Verify WebSocket authentication for sensitive operations
4. **Use parameterized commands**: Never concatenate user input into shell commands
5. **Follow principle of least privilege**: Minimize sudo usage
6. **Test security**: Run security tests (`npm run test:security`) before releases

## Known Limitations

1. **Local execution only**: VibeTrees is designed for local development, not production deployment
2. **Sudo requirement**: Docker mode may require sudo on some systems (consider Podman for rootless)
3. **Single-user focused**: Multi-user authentication not yet implemented
4. **No audit logging**: Advanced audit logging not yet implemented

## Security Testing

Run security tests:

```bash
# Run all tests including security
npm test

# Run only security tests
npm test -- --grep "security|inject|sanitize|validate"
```

## Dependency Security

VibeTrees regularly audits dependencies for vulnerabilities:

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix
```

## Encryption

- **At rest**: API keys stored in OS keychain when available (encrypted)
- **In transit**: Use HTTPS when deploying web interface (recommended)
- **In memory**: Secrets cleared from memory after use when possible

## Authentication & Authorization

### Current Implementation

- **WebSocket authentication**: Optional token-based authentication
- **Origin validation**: CORS protection with configurable whitelist
- **Rate limiting**: Prevents abuse and DoS attacks

### Future Enhancements

- User accounts with role-based access control (RBAC)
- Multi-factor authentication (MFA)
- Session management with secure cookies
- OAuth2 integration for team collaboration

## Incident Response

If a security vulnerability is discovered:

1. **Immediate**: Issue will be triaged within 48 hours
2. **Assessment**: Security team assesses severity and impact
3. **Fix Development**: Patch developed and tested (timeline depends on severity)
4. **Release**: Security release published with advisory
5. **Disclosure**: Public disclosure 7-14 days after patch release

## Security Advisories

Security advisories are published at:
- GitHub Security Advisories: [link to repo security tab]
- Project website: https://vibetrees.dev/security
- Email notifications to users (if opted in)

## Compliance

VibeTrees follows industry best practices including:

- **OWASP Top 10**: Protection against common web vulnerabilities
- **CWE/SANS Top 25**: Mitigation of most dangerous software errors
- **NIST Guidelines**: Following secure coding standards

## Security Checklist

Before each release, we verify:

- [ ] All user input validated
- [ ] Command injection prevented
- [ ] Path traversal prevented
- [ ] Secrets sanitized from logs
- [ ] Rate limiting functional
- [ ] Authentication working
- [ ] Dependencies updated
- [ ] Security tests passing
- [ ] Code review completed
- [ ] Vulnerability scan clean

## Contact

For security-related questions or concerns:
- Email: security@vibetrees.dev
- GitHub Security Advisories: [Use GitHub's security reporting feature]

## Acknowledgments

We thank the security researchers and community members who have responsibly disclosed vulnerabilities to help improve VibeTrees security.

## Version History

- **v1.0.0** (2025-01-28): Initial security policy and implementation
  - Input validation module
  - WebSocket security
  - Secret sanitization
  - Container security

---

Last updated: 2025-01-28
