export const phase1Cleanup = {
  number: 1,
  name: 'Cleanup & Setup',
  estimatedDays: '3-4 days',

  tasks: [
    {
      taskNumber: 1,
      description: 'Remove tmux CLI interface',
      prompt: `Remove the tmux CLI interface as specified in REFACTORING-PLAN.md Phase 1.

Delete these files:
- scripts/worktree-manager.mjs
- scripts/worktree-manager.test.mjs
- scripts/worktree-manager.test.README.md

Update package.json to remove CLI scripts (start, attach, manage, kill).
Keep only the web interface scripts.

Run tests after changes to ensure web interface still works.`,
      maxRetries: 2,
      runTestsAfter: true
    },
    {
      taskNumber: 2,
      description: 'Add --listen parameter to web server',
      prompt: `Add a --listen parameter to the web server (scripts/worktree-web/server.mjs).

Requirements from PLANNING-SUMMARY-V2.md:
- Default: listen only on localhost (127.0.0.1)
- --listen flag: listen on all network interfaces (0.0.0.0)
- Update server startup to respect this flag
- Add command-line argument parsing

Example usage:
- npm run web            # localhost only
- npm run web -- --listen  # all interfaces

Follow TDD: write test first, implement, verify tests pass.`,
      maxRetries: 2,
      runTestsAfter: true
    },
    {
      taskNumber: 3,
      description: 'Create first-run wizard',
      prompt: `Create a first-run wizard that appears when VibeTrees is started for the first time.

Requirements:
- Detect first run (no ~/.vibetrees/config.json)
- Prompt for:
  1. Repository root directory
  2. Preferred AI agent (Claude, Codex, or both)
  3. Container runtime (Docker or Podman)
  4. Default network interface (localhost or all)
- Save configuration to ~/.vibetrees/config.json
- Display welcome message with next steps

Follow TDD principles. Create test file first.

Reference: REFACTORING-PLAN.md Phase 1, Task 3`,
      maxRetries: 2,
      runTestsAfter: true
    },
    {
      taskNumber: 4,
      description: 'Update documentation for Phase 1 changes',
      prompt: `Update all documentation to reflect Phase 1 changes:

1. README.md - Remove tmux references, document new --listen flag
2. CLAUDE.md - Update architecture section (no CLI, only web)
3. package.json - Ensure scripts are correct

Verify all docs are consistent with the new architecture.`,
      maxRetries: 1,
      runTestsAfter: false
    }
  ],

  checkpoint: {
    message: `Phase 1 (Cleanup & Setup) complete!

Changes:
- ✓ Removed tmux CLI interface
- ✓ Added --listen parameter for network configuration
- ✓ Created first-run wizard
- ✓ Updated documentation

Next: Phase 2 (Make Codebase-Agnostic) - 29-31 days
This is the longest phase with Docker/Podman abstraction and terminal persistence.

Ready to proceed?`,
    requiresApproval: true
  }
};
