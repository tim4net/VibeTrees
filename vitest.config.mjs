import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use threads pool with proper cleanup
    pool: 'threads',
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
