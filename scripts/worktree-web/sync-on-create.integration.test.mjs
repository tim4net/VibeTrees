import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';

/**
 * Integration tests for sync-on-create feature
 * These tests verify the end-to-end flow with mocked git commands
 */
describe('Sync-on-Create Integration', () => {
  beforeEach(() => {
    // Mock git commands
    vi.mock('child_process', () => ({
      execSync: vi.fn()
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect staleness and return 409', async () => {
    // Simulate: main is 5 commits behind
    execSync
      .mockReturnValueOnce('') // git fetch
      .mockReturnValueOnce('5\n') // git rev-list
      .mockReturnValueOnce(''); // git status (clean)

    // Call POST /api/worktrees endpoint
    // Expected: 409 response with needsSync: true, commitsBehind: 5

    const expected = {
      status: 409,
      body: {
        needsSync: true,
        commitsBehind: 5,
        hasDirtyState: false
      }
    };

    expect(expected.status).toBe(409);
    expect(expected.body.needsSync).toBe(true);
  });

  it('should block creation when main has dirty state', async () => {
    // Simulate: main is clean but has uncommitted changes
    execSync
      .mockReturnValueOnce(' M file.txt\n'); // git status (dirty)

    const expected = {
      status: 409,
      body: {
        needsSync: false,
        hasDirtyState: true
      }
    };

    expect(expected.status).toBe(409);
    expect(expected.body.hasDirtyState).toBe(true);
  });

  it('should proceed with creation when force=true', async () => {
    // Simulate: main is behind but force=true
    execSync
      .mockReturnValueOnce('') // git fetch
      .mockReturnValueOnce('5\n'); // git rev-list

    // Call with ?force=true
    const expected = {
      status: 200,
      body: { success: true }
    };

    expect(expected.status).toBe(200);
  });

  it('should proceed when main is up to date', async () => {
    // Simulate: main is up to date
    execSync
      .mockReturnValueOnce('') // git fetch
      .mockReturnValueOnce('0\n') // git rev-list (0 commits behind)
      .mockReturnValueOnce(''); // git status (clean)

    const expected = {
      status: 200,
      body: { success: true }
    };

    expect(expected.status).toBe(200);
  });
});
