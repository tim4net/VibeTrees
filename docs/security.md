# Security

VibeTrees runs locally with defense-in-depth protections.

## Input validation

All user input is validated:
- **Path traversal** - blocked via allowlist of valid paths
- **Command injection** - shell args are escaped
- **Name sanitization** - worktree names are slugified

```javascript
// Example validation
const safeName = name.replace(/[^a-z0-9-]/gi, '-');
const safePath = path.resolve(allowedRoot, userPath);
if (!safePath.startsWith(allowedRoot)) throw new Error('Invalid path');
```

## WebSocket security

- Origin validation (blocks cross-site requests)
- Rate limiting on connection attempts
- Session tokens for terminal access

## Secrets handling

Sensitive data is scrubbed from:
- Log output
- Terminal streams
- Error messages
- API responses

Patterns scrubbed: API keys, tokens, passwords, connection strings.

## Container isolation

Each worktree gets isolated Docker containers:
- Separate networks
- No shared volumes (except project code)
- Unique ports per worktree

## File access

Worktree operations are confined to:
- `.worktrees/` directory
- `~/.vibetrees/` config
- Project root (read-only for main)

Cannot delete main worktree or access paths outside project.
