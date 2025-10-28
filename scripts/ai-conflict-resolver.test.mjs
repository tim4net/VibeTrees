/**
 * Tests for AI Conflict Resolver
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Mock fs and child_process modules
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}));

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

// Import after mocking
const { AIConflictResolver } = await import('./ai-conflict-resolver.mjs');

describe('AIConflictResolver', () => {
  const mockWorktreePath = '/test/worktree';
  let resolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new AIConflictResolver(mockWorktreePath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with worktree path', () => {
      expect(resolver.worktreePath).toBe(mockWorktreePath);
    });
  });

  describe('getConflicts', () => {
    it('should return empty array when no conflicts exist', () => {
      execSync.mockReturnValue('');

      const conflicts = resolver.getConflicts();

      expect(conflicts).toEqual([]);
      expect(execSync).toHaveBeenCalledWith(
        'git diff --name-only --diff-filter=U',
        expect.objectContaining({ cwd: mockWorktreePath })
      );
    });

    it('should return array of conflicts with metadata', () => {
      execSync.mockReturnValue('src/app.js\npackage.json\n');
      readFileSync.mockImplementation((path) => {
        if (path.includes('app.js')) {
          return `function test() {
<<<<<<< HEAD
  return 'version1';
=======
  return 'version2';
>>>>>>> main
}`;
        }
        if (path.includes('package.json')) {
          return `{
<<<<<<< HEAD
  "version": "1.0.0"
=======
  "version": "1.0.1"
>>>>>>> main
}`;
        }
        return '';
      });

      const conflicts = resolver.getConflicts();

      expect(conflicts).toHaveLength(2);
      expect(conflicts[0]).toMatchObject({
        file: 'src/app.js',
        category: 'code'
      });
      expect(conflicts[1]).toMatchObject({
        file: 'package.json',
        category: 'dependency'
      });
    });

    it('should handle git command errors gracefully', () => {
      execSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });

      const conflicts = resolver.getConflicts();

      expect(conflicts).toEqual([]);
    });

    it('should categorize conflicts correctly', () => {
      execSync.mockReturnValue('src/app.js\nconfig.yml\nREADME.md\npackage.json\nstyle.css\n');
      readFileSync.mockReturnValue('no conflicts');

      const conflicts = resolver.getConflicts();

      expect(conflicts[0].category).toBe('code'); // app.js
      expect(conflicts[1].category).toBe('config'); // config.yml
      expect(conflicts[2].category).toBe('documentation'); // README.md
      expect(conflicts[3].category).toBe('dependency'); // package.json
      expect(conflicts[4].category).toBe('documentation'); // style.css
    });
  });

  describe('_categorizeConflict', () => {
    it('should categorize dependency files', () => {
      expect(resolver._categorizeConflict('package.json')).toBe('dependency');
      expect(resolver._categorizeConflict('package-lock.json')).toBe('dependency');
    });

    it('should categorize config files', () => {
      expect(resolver._categorizeConflict('config.yml')).toBe('config');
      expect(resolver._categorizeConflict('settings.yaml')).toBe('config');
      expect(resolver._categorizeConflict('data.json')).toBe('config');
      expect(resolver._categorizeConflict('pyproject.toml')).toBe('config');
    });

    it('should categorize code files', () => {
      expect(resolver._categorizeConflict('app.js')).toBe('code');
      expect(resolver._categorizeConflict('component.jsx')).toBe('code');
      expect(resolver._categorizeConflict('types.ts')).toBe('code');
      expect(resolver._categorizeConflict('App.tsx')).toBe('code');
      expect(resolver._categorizeConflict('script.py')).toBe('code');
      expect(resolver._categorizeConflict('main.go')).toBe('code');
      expect(resolver._categorizeConflict('app.rb')).toBe('code');
      expect(resolver._categorizeConflict('index.php')).toBe('code');
      expect(resolver._categorizeConflict('lib.rs')).toBe('code');
    });

    it('should categorize documentation files', () => {
      expect(resolver._categorizeConflict('README.md')).toBe('documentation');
      expect(resolver._categorizeConflict('notes.txt')).toBe('documentation');
      expect(resolver._categorizeConflict('index.html')).toBe('documentation');
      expect(resolver._categorizeConflict('style.css')).toBe('documentation');
    });

    it('should categorize unknown files as other', () => {
      expect(resolver._categorizeConflict('image.png')).toBe('other');
      expect(resolver._categorizeConflict('.gitignore')).toBe('other');
      expect(resolver._categorizeConflict('Makefile')).toBe('other');
    });
  });

  describe('_getConflictContent', () => {
    it('should parse conflict markers correctly', () => {
      const fileContent = `function test() {
<<<<<<< HEAD
  const a = 1;
  return a;
=======
  const b = 2;
  return b;
>>>>>>> main
}`;

      readFileSync.mockReturnValue(fileContent);

      const content = resolver._getConflictContent('test.js');

      expect(content.conflictCount).toBe(1);
      expect(content.conflicts[0].ours).toEqual(['  const a = 1;', '  return a;']);
      expect(content.conflicts[0].theirs).toEqual(['  const b = 2;', '  return b;']);
      expect(content.fullContent).toBe(fileContent);
    });

    it('should handle multiple conflicts in same file', () => {
      const fileContent = `
<<<<<<< HEAD
line1
=======
line2
>>>>>>> main
middle line
<<<<<<< HEAD
line3
=======
line4
>>>>>>> main
`;

      readFileSync.mockReturnValue(fileContent);

      const content = resolver._getConflictContent('test.js');

      expect(content.conflictCount).toBe(2);
      expect(content.conflicts[0].ours).toEqual(['line1']);
      expect(content.conflicts[0].theirs).toEqual(['line2']);
      expect(content.conflicts[1].ours).toEqual(['line3']);
      expect(content.conflicts[1].theirs).toEqual(['line4']);
    });

    it('should handle file read errors gracefully', () => {
      readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const content = resolver._getConflictContent('nonexistent.js');

      expect(content.error).toBe('File not found');
      expect(content.conflictCount).toBe(0);
      expect(content.conflicts).toEqual([]);
    });

    it('should handle empty conflict markers', () => {
      const fileContent = `
<<<<<<< HEAD
=======
>>>>>>> main
`;

      readFileSync.mockReturnValue(fileContent);

      const content = resolver._getConflictContent('test.js');

      expect(content.conflictCount).toBe(1);
      expect(content.conflicts[0].ours).toEqual([]);
      expect(content.conflicts[0].theirs).toEqual([]);
    });
  });

  describe('_isWhitespaceConflict', () => {
    it('should detect whitespace-only conflicts', () => {
      const content = {
        conflicts: [
          {
            ours: ['const x = 1;'],
            theirs: ['  const x = 1;  ']
          }
        ]
      };

      expect(resolver._isWhitespaceConflict(content)).toBe(true);
    });

    it('should detect non-whitespace conflicts', () => {
      const content = {
        conflicts: [
          {
            ours: ['const x = 1;'],
            theirs: ['const y = 2;']
          }
        ]
      };

      expect(resolver._isWhitespaceConflict(content)).toBe(false);
    });

    it('should return false when no conflicts exist', () => {
      const content = {
        conflicts: []
      };

      expect(resolver._isWhitespaceConflict(content)).toBe(false);
    });

    it('should handle mixed whitespace and tabs', () => {
      const content = {
        conflicts: [
          {
            ours: ['	const x = 1;'],
            theirs: ['    const x = 1;']
          }
        ]
      };

      expect(resolver._isWhitespaceConflict(content)).toBe(true);
    });
  });

  describe('_isAutoResolvable', () => {
    it('should detect whitespace conflicts as auto-resolvable', () => {
      readFileSync.mockReturnValue(`
<<<<<<< HEAD
const x = 1;
=======
  const x = 1;
>>>>>>> main
`);

      const result = resolver._isAutoResolvable('test.js');

      expect(result).toBe('whitespace');
    });

    it('should detect dependency conflicts as auto-resolvable', () => {
      readFileSync.mockReturnValue(`{
<<<<<<< HEAD
  "version": "1.0.0"
=======
  "version": "1.0.1"
>>>>>>> main
}`);

      const result = resolver._isAutoResolvable('package.json');

      expect(result).toBe('dependency_version');
    });

    it('should not auto-resolve config conflicts', () => {
      readFileSync.mockReturnValue(`
<<<<<<< HEAD
port: 3000
=======
port: 3001
>>>>>>> main
`);

      const result = resolver._isAutoResolvable('config.yml');

      expect(result).toBe(false);
    });

    it('should not auto-resolve code conflicts', () => {
      readFileSync.mockReturnValue(`
<<<<<<< HEAD
function old() {}
=======
function new() {}
>>>>>>> main
`);

      const result = resolver._isAutoResolvable('app.js');

      expect(result).toBe(false);
    });
  });

  describe('autoResolve', () => {
    it('should resolve whitespace conflicts', async () => {
      readFileSync.mockReturnValue(`
<<<<<<< HEAD
const x = 1;
=======
  const x = 1;
>>>>>>> main
`);
      writeFileSync.mockReturnValue(undefined);
      execSync.mockReturnValue('');

      const result = await resolver.autoResolve('test.js', 'whitespace');

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('whitespace');
      expect(writeFileSync).toHaveBeenCalled();
      expect(execSync).toHaveBeenCalledWith('git add test.js', expect.any(Object));
    });

    it('should resolve dependency conflicts with theirs strategy', async () => {
      readFileSync.mockReturnValue(`{
<<<<<<< HEAD
  "version": "1.0.0"
=======
  "version": "1.0.1"
>>>>>>> main
}`);
      execSync.mockReturnValue('');

      const result = await resolver.autoResolve('package.json', 'theirs');

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('dependency_theirs');
      expect(execSync).toHaveBeenCalledWith('git checkout --theirs package.json', expect.any(Object));
      expect(execSync).toHaveBeenCalledWith('git add package.json', expect.any(Object));
    });

    it('should resolve dependency conflicts with ours strategy', async () => {
      readFileSync.mockReturnValue(`{
<<<<<<< HEAD
  "version": "1.0.0"
=======
  "version": "1.0.1"
>>>>>>> main
}`);
      execSync.mockReturnValue('');

      const result = await resolver.autoResolve('package.json', 'ours');

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('dependency_ours');
      expect(execSync).toHaveBeenCalledWith('git checkout --ours package.json', expect.any(Object));
    });

    it('should not resolve non-resolvable conflicts', async () => {
      readFileSync.mockReturnValue(`
<<<<<<< HEAD
function old() {}
=======
function new() {}
>>>>>>> main
`);

      const result = await resolver.autoResolve('app.js', 'auto');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Conflict not auto-resolvable');
    });

    it('should handle git command errors', async () => {
      readFileSync.mockReturnValue(`{
<<<<<<< HEAD
  "version": "1.0.0"
=======
  "version": "1.0.1"
>>>>>>> main
}`);
      execSync.mockImplementation(() => {
        throw new Error('Git error');
      });

      const result = await resolver.autoResolve('package.json', 'theirs');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Git error');
    });

    it('should return not implemented for config merge', async () => {
      readFileSync.mockReturnValue(`
port: 3000
host: localhost
`);

      // Force config_merge by mocking _isAutoResolvable
      vi.spyOn(resolver, '_isAutoResolvable').mockReturnValue('config_merge');

      const result = await resolver.autoResolve('config.yml', 'auto');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Config merge not yet implemented');
    });
  });

  describe('generateAIPrompt', () => {
    it('should generate comprehensive AI prompt', () => {
      const conflict = {
        file: 'src/app.js',
        category: 'code',
        content: {
          conflictCount: 1,
          conflicts: [
            {
              ours: ['const x = 1;', 'return x;'],
              theirs: ['const y = 2;', 'return y;']
            }
          ]
        }
      };

      const prompt = resolver.generateAIPrompt(conflict);

      expect(prompt).toContain('src/app.js');
      expect(prompt).toContain('Category: code');
      expect(prompt).toContain('Number of conflicts: 1');
      expect(prompt).toContain('const x = 1;');
      expect(prompt).toContain('const y = 2;');
      expect(prompt).toContain('Current branch (ours)');
      expect(prompt).toContain('Incoming branch (theirs)');
      expect(prompt).toContain('safest resolution strategy');
    });

    it('should format multiple conflicts correctly', () => {
      const conflict = {
        file: 'test.js',
        category: 'code',
        content: {
          conflictCount: 2,
          conflicts: [
            {
              ours: ['line1'],
              theirs: ['line2']
            },
            {
              ours: ['line3'],
              theirs: ['line4']
            }
          ]
        }
      };

      const prompt = resolver.generateAIPrompt(conflict);

      expect(prompt).toContain('Conflict #1:');
      expect(prompt).toContain('Conflict #2:');
      expect(prompt).toContain('line1');
      expect(prompt).toContain('line2');
      expect(prompt).toContain('line3');
      expect(prompt).toContain('line4');
    });

    it('should include resolution guidance in prompt', () => {
      const conflict = {
        file: 'package.json',
        category: 'dependency',
        content: {
          conflictCount: 1,
          conflicts: [{ ours: [], theirs: [] }]
        }
      };

      const prompt = resolver.generateAIPrompt(conflict);

      expect(prompt).toContain('Please analyze this conflict');
      expect(prompt).toContain('What changed in both branches');
      expect(prompt).toContain('safest resolution strategy');
      expect(prompt).toContain('For dependencies, prefer newer versions');
    });
  });

  describe('requestAIAssistance', () => {
    it('should send conflict info to terminal', async () => {
      const mockTerminal = {
        write: vi.fn()
      };

      const mockSessionId = 'test-session-id';
      const mockPtyManager = {
        _sessions: new Map([
          [mockSessionId, {
            id: mockSessionId,
            worktreeName: 'test-worktree',
            agent: 'claude',
            pty: mockTerminal,
            connected: true
          }]
        ])
      };

      const conflict = {
        file: 'src/app.js',
        category: 'code',
        content: {
          conflictCount: 2,
          conflicts: [
            { ours: ['line1'], theirs: ['line2'] }
          ]
        },
        resolvable: false
      };

      const result = await resolver.requestAIAssistance(
        conflict,
        mockPtyManager,
        'test-worktree'
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Conflict information sent to AI agent');
      expect(mockTerminal.write).toHaveBeenCalled();

      // Verify terminal output contains key information
      const writeCalls = mockTerminal.write.mock.calls.map(call => call[0]).join('');
      expect(writeCalls).toContain('Merge Conflict Detected');
      expect(writeCalls).toContain('src/app.js');
      expect(writeCalls).toContain('code');
      expect(writeCalls).toContain('2');
      expect(writeCalls).toContain('Manual resolution needed');
    });

    it('should show auto-resolvable status in terminal', async () => {
      const mockTerminal = {
        write: vi.fn()
      };

      const mockSessionId = 'test-session-id-2';
      const mockPtyManager = {
        _sessions: new Map([
          [mockSessionId, {
            id: mockSessionId,
            worktreeName: 'test-worktree',
            agent: 'claude',
            pty: mockTerminal,
            connected: true
          }]
        ])
      };

      const conflict = {
        file: 'package.json',
        category: 'dependency',
        content: {
          conflictCount: 1,
          conflicts: [
            { ours: ['"version": "1.0.0"'], theirs: ['"version": "1.0.1"'] }
          ]
        },
        resolvable: 'dependency_version'
      };

      const result = await resolver.requestAIAssistance(
        conflict,
        mockPtyManager,
        'test-worktree'
      );

      expect(result.success).toBe(true);

      const writeCalls = mockTerminal.write.mock.calls.map(call => call[0]).join('');
      expect(writeCalls).toContain('Auto-resolvable: dependency_version');
    });

    it('should return error when no AI agent is active', async () => {
      const mockPtyManager = {
        _sessions: new Map()
      };

      const conflict = {
        file: 'test.js',
        category: 'code',
        content: { conflictCount: 1 },
        resolvable: false
      };

      const result = await resolver.requestAIAssistance(
        conflict,
        mockPtyManager,
        'test-worktree'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('No active AI agent to assist');
    });

    it('should handle terminal write errors', async () => {
      const mockTerminal = {
        write: vi.fn(() => {
          throw new Error('Terminal error');
        })
      };

      const mockSessionId = 'test-session-id-3';
      const mockPtyManager = {
        _sessions: new Map([
          [mockSessionId, {
            id: mockSessionId,
            worktreeName: 'test-worktree',
            agent: 'claude',
            pty: mockTerminal,
            connected: true
          }]
        ])
      };

      const conflict = {
        file: 'test.js',
        category: 'code',
        content: {
          conflictCount: 1,
          conflicts: [
            { ours: ['code1'], theirs: ['code2'] }
          ]
        },
        resolvable: false
      };

      const result = await resolver.requestAIAssistance(
        conflict,
        mockPtyManager,
        'test-worktree'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Terminal error');
    });
  });

  describe('analyzeConflicts', () => {
    it('should analyze all conflicts and provide summary', async () => {
      execSync.mockReturnValue('src/app.js\npackage.json\nconfig.yml\n');
      readFileSync.mockImplementation((path) => {
        if (path.includes('app.js')) {
          return `<<<<<<< HEAD\ncode1\n=======\ncode2\n>>>>>>> main`;
        }
        if (path.includes('package.json')) {
          return `<<<<<<< HEAD\n"v1"\n=======\n"v2"\n>>>>>>> main`;
        }
        if (path.includes('config.yml')) {
          return `<<<<<<< HEAD\nport: 3000\n=======\nport: 3001\n>>>>>>> main`;
        }
        return '';
      });

      const analysis = await resolver.analyzeConflicts();

      expect(analysis.total).toBe(3);
      expect(analysis.autoResolvable).toBe(1); // package.json
      expect(analysis.manual).toBe(2); // app.js and config.yml
      expect(analysis.byCategory).toEqual({
        code: 1,
        dependency: 1,
        config: 1
      });
      expect(analysis.conflicts).toHaveLength(3);
    });

    it('should categorize conflicts by type', async () => {
      execSync.mockReturnValue('app.js\ntest.py\nREADME.md\n');
      readFileSync.mockReturnValue('no conflict markers');

      const analysis = await resolver.analyzeConflicts();

      expect(analysis.byCategory).toEqual({
        code: 2,
        documentation: 1
      });
    });

    it('should provide suggestions for each conflict', async () => {
      execSync.mockReturnValue('package.json\n');
      readFileSync.mockReturnValue(`{
<<<<<<< HEAD
  "version": "1.0.0"
=======
  "version": "1.0.1"
>>>>>>> main
}`);

      const analysis = await resolver.analyzeConflicts();

      expect(analysis.conflicts[0].suggestion).toContain('Auto-resolve');
      expect(analysis.conflicts[0].suggestion).toContain('newer dependency versions');
    });

    it('should return empty analysis when no conflicts exist', async () => {
      execSync.mockReturnValue('');

      const analysis = await resolver.analyzeConflicts();

      expect(analysis.total).toBe(0);
      expect(analysis.autoResolvable).toBe(0);
      expect(analysis.manual).toBe(0);
      expect(analysis.byCategory).toEqual({});
      expect(analysis.conflicts).toEqual([]);
    });
  });

  describe('_getSuggestion', () => {
    it('should suggest auto-resolve for whitespace conflicts', () => {
      const conflict = { resolvable: 'whitespace', category: 'code' };
      const suggestion = resolver._getSuggestion(conflict);

      expect(suggestion).toBe('Auto-resolve: Whitespace differences only');
    });

    it('should suggest auto-resolve for dependency versions', () => {
      const conflict = { resolvable: 'dependency_version', category: 'dependency' };
      const suggestion = resolver._getSuggestion(conflict);

      expect(suggestion).toBe('Auto-resolve: Accept newer dependency versions');
    });

    it('should suggest manual resolution for code conflicts', () => {
      const conflict = { resolvable: false, category: 'code' };
      const suggestion = resolver._getSuggestion(conflict);

      expect(suggestion).toContain('Manual');
      expect(suggestion).toContain('code changes carefully');
    });

    it('should suggest manual resolution for config conflicts', () => {
      const conflict = { resolvable: false, category: 'config' };
      const suggestion = resolver._getSuggestion(conflict);

      expect(suggestion).toContain('Manual');
      expect(suggestion).toContain('config changes');
    });

    it('should suggest manual resolution for documentation', () => {
      const conflict = { resolvable: false, category: 'documentation' };
      const suggestion = resolver._getSuggestion(conflict);

      expect(suggestion).toContain('Manual');
      expect(suggestion).toContain('documentation');
    });

    it('should provide generic suggestion for unknown conflicts', () => {
      const conflict = { resolvable: false, category: 'other' };
      const suggestion = resolver._getSuggestion(conflict);

      expect(suggestion).toBe('Manual: Review and resolve conflicts');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete workflow: detect, analyze, resolve', async () => {
      // Setup: one auto-resolvable and one manual conflict
      execSync.mockReturnValue('package.json\nsrc/app.js\n');
      readFileSync.mockImplementation((path) => {
        if (path.includes('package.json')) {
          return `{
<<<<<<< HEAD
  "version": "1.0.0"
=======
  "version": "1.0.1"
>>>>>>> main
}`;
        }
        if (path.includes('app.js')) {
          return `function test() {
<<<<<<< HEAD
  return 'old';
=======
  return 'new';
>>>>>>> main
}`;
        }
        return '';
      });

      // Step 1: Detect conflicts
      const conflicts = resolver.getConflicts();
      expect(conflicts).toHaveLength(2);

      // Step 2: Analyze
      const analysis = await resolver.analyzeConflicts();
      expect(analysis.autoResolvable).toBe(1);
      expect(analysis.manual).toBe(1);

      // Step 3: Auto-resolve the dependency
      execSync.mockReturnValue('');
      const resolveResult = await resolver.autoResolve('package.json', 'theirs');
      expect(resolveResult.success).toBe(true);

      // Step 4: Request AI help for manual conflict
      const mockSessionId = 'test-session-id-4';
      const mockPtyManager = {
        _sessions: new Map([
          [mockSessionId, {
            id: mockSessionId,
            worktreeName: 'test',
            agent: 'claude',
            pty: { write: vi.fn() },
            connected: true
          }]
        ])
      };
      const aiResult = await resolver.requestAIAssistance(
        conflicts[1],
        mockPtyManager,
        'test'
      );
      expect(aiResult.success).toBe(true);
    });

    it('should handle errors at each stage gracefully', async () => {
      // Git not available
      execSync.mockImplementation(() => {
        throw new Error('Git error');
      });

      const conflicts = resolver.getConflicts();
      expect(conflicts).toEqual([]);

      // File not readable
      readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      const content = resolver._getConflictContent('test.js');
      expect(content.error).toBe('Read error');
    });
  });
});
