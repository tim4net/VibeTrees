# Testing Guide for VibeTrees

## Overview

VibeTrees uses **Test-Driven Development (TDD)** with comprehensive test coverage across all modules. All tests are written using **Vitest** and follow consistent patterns for mocking, assertions, and error handling.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run specific test file
npx vitest run scripts/container-runtime.test.mjs

# Run tests with coverage (requires @vitest/coverage-v8)
npm run test:coverage
```

## Test Statistics

- **Total Tests**: 346
- **Test Files**: 15
- **Pass Rate**: 100%
- **Execution Time**: ~19 seconds
- **Framework**: Vitest

## Test File Structure

All test files follow the naming convention: `{module-name}.test.mjs`

Located in: `scripts/` directory alongside source files

## Testing Patterns

### 1. Mock Setup

All external dependencies are mocked before importing modules:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}));

// Import after mocking
import { execSync } from 'child_process';
import { MyModule } from './my-module.mjs';
```

### 2. Test Structure (Arrange-Act-Assert)

```javascript
describe('MyModule', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clean slate for each test
  });

  it('should perform expected behavior', () => {
    // Arrange: Setup mocks and initial state
    execSync.mockReturnValue('expected output');
    const instance = new MyModule();

    // Act: Execute the operation
    const result = instance.doSomething();

    // Assert: Verify behavior
    expect(result).toBe('expected output');
    expect(execSync).toHaveBeenCalledWith('expected command');
  });
});
```

### 3. Error Handling Tests

Always test both success and error paths:

```javascript
it('should handle errors gracefully', () => {
  // Mock error condition
  execSync.mockImplementation(() => {
    throw new Error('Command failed');
  });

  const instance = new MyModule();

  // Verify error handling
  expect(() => instance.doSomething()).toThrow('Command failed');
  // OR for async functions
  await expect(instance.doSomethingAsync()).rejects.toThrow('Command failed');
});
```

### 4. Edge Cases

Test boundary conditions and unusual inputs:

```javascript
it('should handle empty input', () => {
  const result = processInput('');
  expect(result).toEqual([]);
});

it('should handle null values', () => {
  const result = getValue(null);
  expect(result).toBeUndefined();
});

it('should handle very large inputs', () => {
  const largeArray = Array(10000).fill('data');
  const result = processArray(largeArray);
  expect(result).toBeDefined();
});
```

## Module-Specific Testing Guides

### Container Runtime Tests

Tests Docker/Podman detection, sudo requirements, and command execution:

```javascript
// Test auto-detection
it('should auto-detect Docker when available', () => {
  execSync.mockImplementation((cmd) => {
    if (cmd === 'docker --version') return 'Docker version 20.10.0';
    if (cmd === 'docker ps') return '';
    if (cmd === 'docker compose version') return 'Docker Compose version v2.0.0';
    return '';
  });

  const runtime = new ContainerRuntime();

  expect(runtime.getRuntime()).toBe('docker');
  expect(runtime.needsElevation()).toBe(false);
});
```

### Compose Inspector Tests

Tests docker-compose.yml parsing and service discovery:

```javascript
// Mock compose output
const createMockRuntime = (composeOutput) => ({
  execCompose: vi.fn((command) => {
    if (command.includes('config')) return composeOutput;
    throw new Error('Unexpected command');
  })
});

it('should discover all services', () => {
  const composeOutput = `
version: '3.8'
services:
  api:
    image: node:18
    ports:
      - "3000:3000"
  `;

  const runtime = createMockRuntime(composeOutput);
  const inspector = new ComposeInspector('docker-compose.yml', runtime);

  const services = inspector.getServices();
  expect(services).toHaveLength(1);
  expect(services[0].name).toBe('api');
});
```

### Config Manager Tests

Tests configuration loading, validation, and environment overrides:

```javascript
it('should override from environment variables', () => {
  process.env.VIBE_RUNTIME = 'podman';

  const mockConfig = { /* ... */ };
  existsSync.mockReturnValue(true);
  readFileSync.mockReturnValue(JSON.stringify(mockConfig));

  const manager = new ConfigManager('/test/project');
  const config = manager.load();

  expect(config.container.runtime).toBe('podman');
});
```

### Data Sync Tests

Tests volume copying with filters and progress reporting:

```javascript
it('should copy only included volumes', async () => {
  const runtime = createMockRuntime();
  const inspector = createMockInspector(['postgres-data', 'redis-data', 'minio-data']);
  const dataSync = new DataSync(runtime, inspector);

  const results = await dataSync.copyVolumes('main', 'feature-auth', {
    include: ['postgres-data']
  });

  expect(results.copied).toContain('postgres-data');
  expect(results.skipped).toContain('redis-data');
  expect(results.skipped).toContain('minio-data');
});
```

### MCP Manager Tests

Tests MCP server discovery and configuration generation:

```javascript
it('should discover npm MCP servers from package.json', () => {
  existsSync.mockImplementation((path) => path === '/test/project/package.json');
  readFileSync.mockReturnValue(JSON.stringify({
    dependencies: {
      '@modelcontextprotocol/server-filesystem': '^1.0.0'
    }
  }));

  const servers = mcpManager.discoverServers();

  expect(servers).toHaveLength(1);
  expect(servers[0]).toMatchObject({
    id: 'filesystem',
    source: 'npm-project'
  });
});
```

## Writing New Tests

### Step 1: Create Test File

Create `{module-name}.test.mjs` in the same directory as the source file.

### Step 2: Import Dependencies and Mock

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies
vi.mock('child_process');
vi.mock('fs');

// Import after mocking
import { execSync } from 'child_process';
import { MyModule } from './my-module.mjs';
```

### Step 3: Write Test Suite

```javascript
describe('MyModule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('methodName', () => {
    it('should do something when condition met', () => {
      // Test implementation
    });

    it('should handle error when condition fails', () => {
      // Error test implementation
    });
  });
});
```

### Step 4: Run Tests

```bash
# Run just your new test
npx vitest run scripts/my-module.test.mjs

# Run all tests to ensure no regressions
npm test
```

## Best Practices

### DO

✅ **Mock all external dependencies** (fs, child_process, network calls)
✅ **Test both success and error paths**
✅ **Use descriptive test names** that explain what is being tested
✅ **Clear mocks between tests** with `beforeEach(() => vi.clearAllMocks())`
✅ **Test edge cases** (empty inputs, null values, large datasets)
✅ **Follow Arrange-Act-Assert** pattern
✅ **Keep tests isolated** (no shared state between tests)
✅ **Write tests first** (TDD: Red → Green → Refactor)

### DON'T

❌ **Don't make actual filesystem operations** in tests
❌ **Don't make actual network calls** in tests
❌ **Don't use setTimeout or timing-dependent logic** (flaky tests)
❌ **Don't share mutable state** between tests
❌ **Don't test implementation details** (test behavior, not internals)
❌ **Don't skip error paths** (always test failure scenarios)
❌ **Don't write tests after implementation** (TDD first!)

## Common Mocking Patterns

### Mocking execSync with Multiple Commands

```javascript
execSync.mockImplementation((cmd) => {
  if (cmd === 'docker --version') return 'Docker version 20.10.0';
  if (cmd === 'docker ps') return 'CONTAINER ID';
  if (cmd.includes('volume inspect')) {
    return JSON.stringify([{ Name: 'test_volume' }]);
  }
  throw new Error(`Unexpected command: ${cmd}`);
});
```

### Mocking File System

```javascript
existsSync.mockImplementation((path) => {
  if (path === '/existing/file') return true;
  return false;
});

readFileSync.mockImplementation((path) => {
  if (path === '/config.json') {
    return JSON.stringify({ version: '1.0' });
  }
  throw new Error('File not found');
});
```

### Mocking Object Methods

```javascript
const mockRuntime = {
  exec: vi.fn((cmd) => 'output'),
  execCompose: vi.fn((cmd) => 'compose output'),
  getRuntime: vi.fn(() => 'docker')
};
```

## Debugging Tests

### Use `console.log` Strategically

```javascript
it('should do something', () => {
  console.log('Mock calls:', execSync.mock.calls);
  console.log('Result:', result);
  expect(result).toBe('expected');
});
```

### Run Single Test in Watch Mode

```bash
npx vitest watch scripts/my-module.test.mjs
```

### Check Mock Calls

```javascript
expect(execSync).toHaveBeenCalledTimes(2);
expect(execSync).toHaveBeenCalledWith('expected command', expect.any(Object));
expect(execSync).toHaveBeenLastCalledWith('last command');
```

## Continuous Integration

Tests run automatically on:
- Every `git push` (if CI configured)
- Pull request creation
- Before merging to main

Ensure all tests pass before creating PRs:

```bash
npm test
```

## Coverage Goals

While we don't currently track line-by-line coverage, aim for:

- **100% of public methods** tested
- **All error paths** covered
- **Edge cases** handled
- **Integration points** verified

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest API Reference](https://vitest.dev/api/)
- [Testing Best Practices](https://testingjavascript.com/)
- Project test files in `scripts/*.test.mjs`

## Questions?

If you're unsure how to test something:

1. Look at similar tests in existing test files
2. Check the Testing Patterns section above
3. Refer to existing test files for examples
4. Follow the TDD cycle: Red → Green → Refactor

Happy testing! 🧪
