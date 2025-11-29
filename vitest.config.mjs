import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude Playwright E2E tests (they run separately with playwright test)
    exclude: ['**/node_modules/**', '**/tests/e2e/**'],
    // Use threads by default; fall back to forks for native-module specs
    pool: 'threads',
    // Run node-pty dependent tests in a single forked worker to avoid
    // ERR_DLOPEN_FAILED self-registration issues when parallelized.
    poolMatchGlobs: [
      ['scripts/worktree-web/server.test.mjs', 'forks'],
      ['scripts/agents/agent-registry.test.mjs', 'forks']
    ],
    poolOptions: {
      threads: {
        // Use fewer threads to reduce resource usage
        minThreads: 1,
        maxThreads: 4,
        // Isolate each test file in its own thread
        isolate: true,
        // Ensure threads are killed after tests complete
        singleThread: false,
      },
      forks: {
        singleFork: true
      }
    },
    // Set reasonable timeouts to prevent hanging
    testTimeout: 10000, // 10 seconds per test
    hookTimeout: 10000, // 10 seconds for before/after hooks
    teardownTimeout: 5000, // 5 seconds for cleanup
    // Gracefully exit after tests complete
    forceExit: true,
    // Disable watch mode file watching to prevent extra processes
    watchExclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
  },
});
