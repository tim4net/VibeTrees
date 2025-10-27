# Worktree Manager Test Suite

Comprehensive test suite for `worktree-manager.mjs` - a script that orchestrates git worktrees with tmux and docker-compose.

## Test Coverage

### PortRegistry Class (26 tests)

**Port Allocation:**
- Allocates base port when no conflicts exist
- Returns existing port if already allocated
- Finds next available port when base port is taken
- Handles multiple port conflicts across services
- Allocates different services independently

**Persistence:**
- Creates registry directory if missing
- Loads existing ports from JSON file
- Persists ports to disk after allocation
- Handles corrupted JSON gracefully

**Port Release:**
- Releases all ports for a worktree
- Handles releasing non-existent worktrees
- Works with empty port registry

**Port Retrieval:**
- Returns all ports for a specific worktree
- Returns empty object for worktrees with no ports
- Handles worktree names that are substrings of others

### WorktreeManager Class (29 tests)

**Tmux Integration:**
- Detects if tmux is installed
- Checks if tmux session exists
- Creates windows with correct layout (3 panes)
- Removes windows from session
- Calculates next available window index
- Parses window list with complex names (containing colons)

**Git Worktree Operations:**
- Lists existing worktrees from git
- Parses worktree paths and branches correctly
- Creates new worktrees with proper naming
- Replaces slashes in branch names
- Creates .worktrees directory if needed
- Deletes worktrees and releases ports
- Prevents deletion of main worktree
- Prevents deletion of worktrees outside .worktrees/

**Docker Compose Operations:**
- Starts services with correct environment variables
- Stops services gracefully
- Cleans up orphaned containers before starting
- Handles missing docker-compose.yml files
- Waits for services to become healthy
- Accepts exited services with exit code 0
- Times out if services don't become healthy
- Handles docker errors gracefully

### Edge Cases and Integration (4 tests)

- Concurrent port allocation across multiple worktrees
- Port reuse after release
- Worktree names with special characters
- Deeply nested branch paths

## Running the Tests

### Run all tests:
```bash
npx vitest run scripts/worktree-manager.test.mjs
```

### Run in watch mode:
```bash
npx vitest scripts/worktree-manager.test.mjs
```

### Run with coverage:
```bash
npx vitest run scripts/worktree-manager.test.mjs --coverage
```

## Test Architecture

### Mocking Strategy

The tests use comprehensive mocking for:

- **Filesystem operations** (`fs` module): `existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync`, `rmSync`
- **Child process execution** (`child_process` module): `execSync`, `spawn`
- **OS utilities** (`os` module): `homedir`

This ensures tests:
- Run quickly without actual I/O
- Don't require docker or tmux to be installed
- Don't create actual git worktrees
- Are deterministic and repeatable

### Test Structure

Each test follows the **Arrange-Act-Assert** pattern:

```javascript
it('should allocate base port when no ports are in use', () => {
  // Arrange: Setup mocks and initial state
  const portRegistry = new PortRegistry();

  // Act: Execute the operation
  const port = portRegistry.allocate('worktree1', 'api', 3000);

  // Assert: Verify behavior
  expect(port).toBe(3000);
  expect(portRegistry.ports['worktree1:api']).toBe(3000);
});
```

### Mock Implementation Patterns

**Conditional mocking** for different commands:
```javascript
mockExecSync.mockImplementation((cmd) => {
  if (cmd === 'which tmux') return '/usr/bin/tmux';
  if (cmd.includes('git worktree list')) return gitOutput;
  return '';
});
```

**State tracking** for filesystem operations:
```javascript
let mockPorts = {};
vi.mocked(writeFileSync).mockImplementation((path, data) => {
  mockPorts = JSON.parse(data);
});
```

## Key Test Scenarios

### Port Conflict Resolution

Tests verify that the port allocation algorithm correctly finds available ports:

1. First worktree gets base port (3000)
2. Second worktree gets next port (3001)
3. After releasing first worktree, base port (3000) can be reused

### Docker Health Checking

Tests verify the service health check logic:

- Parses docker compose JSON output (one object per line)
- Accepts `running` and `exited` (code 0) states
- Retries on errors or unhealthy states
- Times out after specified duration

### Tmux Window Naming

Tests verify correct parsing of window names containing colons:

Input: `1:feature-test [api:3000 ui:5173]`

Must parse as:
- Index: `1`
- Name: `feature-test [api:3000 ui:5173]` (preserving colons in name)

### Git Worktree Safety

Tests verify safety constraints:

- Cannot delete main worktree
- Cannot delete worktrees outside `.worktrees/` directory
- Docker services stopped before worktree deletion
- Ports released after successful deletion

## Common Patterns

### Testing Error Handling

```javascript
it('should handle docker compose failure', () => {
  mockExecSync.mockImplementation((cmd) => {
    if (cmd === 'sudo docker compose up -d') throw new Error('Docker error');
    return '';
  });

  const result = manager.startDockerCompose('/path', {});
  expect(result).toBe(false);
});
```

### Testing Async Operations

```javascript
it('should wait for services to be healthy', () => {
  let callCount = 0;
  mockExecSync.mockImplementation((cmd) => {
    if (cmd.includes('ps --format json')) {
      callCount++;
      if (callCount >= 3) return JSON.stringify({ State: 'running' });
      throw new Error('Not ready');
    }
    if (cmd === 'sleep 1') return '';
    return '';
  });

  const result = manager.waitForServices('/path', 10000);
  expect(result).toBe(true);
});
```

## Maintenance Notes

### When to Update Tests

Update tests when:

1. **Adding new features**: Add corresponding test cases
2. **Changing behavior**: Update assertions to match new behavior
3. **Fixing bugs**: Add regression test for the bug
4. **Refactoring**: Ensure tests still pass and cover same scenarios

### Known Limitations

These tests verify the **logic** of the worktree manager but do not test:

- Actual tmux session creation
- Real docker-compose operations
- Actual git worktree commands
- File system persistence across runs

For end-to-end testing, consider:
- Manual testing with actual worktrees
- Integration tests with real tmux/docker/git
- Smoke tests in CI environment

## Test Metrics

- **Total Tests**: 59
- **Test Suites**: 3 (PortRegistry, WorktreeManager, Edge Cases)
- **Average Runtime**: ~525ms
- **Coverage**: All public methods and major code paths

## Dependencies

- **vitest**: Test framework (v1.0.0+)
- **Node.js**: 16+ (ES modules support)

No additional test dependencies required - uses built-in mocking from vitest.
