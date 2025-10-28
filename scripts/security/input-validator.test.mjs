/**
 * Security Tests for Input Validator
 */

import { describe, it, expect, vi } from 'vitest';
import { InputValidator } from './input-validator.mjs';

describe('InputValidator', () => {
  describe('validateWorktreeName', () => {
    it('should accept valid worktree names', () => {
      expect(InputValidator.validateWorktreeName('feature-auth')).toBe('feature-auth');
      expect(InputValidator.validateWorktreeName('bug_fix_123')).toBe('bug_fix_123');
      expect(InputValidator.validateWorktreeName('test-branch-1')).toBe('test-branch-1');
    });

    it('should reject path traversal attempts', () => {
      expect(() => InputValidator.validateWorktreeName('../etc/passwd')).toThrow();
      expect(() => InputValidator.validateWorktreeName('../../root')).toThrow();
      expect(() => InputValidator.validateWorktreeName('..')).toThrow();
    });

    it('should reject command injection attempts', () => {
      expect(() => InputValidator.validateWorktreeName('test; rm -rf /')).toThrow();
      expect(() => InputValidator.validateWorktreeName('test && cat /etc/passwd')).toThrow();
      expect(() => InputValidator.validateWorktreeName('test|ls')).toThrow();
      expect(() => InputValidator.validateWorktreeName('test`whoami`')).toThrow();
      expect(() => InputValidator.validateWorktreeName('test$(whoami)')).toThrow();
    });

    it('should reject special characters', () => {
      expect(() => InputValidator.validateWorktreeName('test/branch')).toThrow();
      expect(() => InputValidator.validateWorktreeName('test\\branch')).toThrow();
      expect(() => InputValidator.validateWorktreeName('test:branch')).toThrow();
      expect(() => InputValidator.validateWorktreeName('test*branch')).toThrow();
      expect(() => InputValidator.validateWorktreeName('test?branch')).toThrow();
      expect(() => InputValidator.validateWorktreeName('test<branch')).toThrow();
      expect(() => InputValidator.validateWorktreeName('test>branch')).toThrow();
    });

    it('should reject reserved names', () => {
      // Windows reserved names
      expect(() => InputValidator.validateWorktreeName('.')).toThrow();
      expect(() => InputValidator.validateWorktreeName('..')).toThrow();
      expect(() => InputValidator.validateWorktreeName('CON')).toThrow();
      expect(() => InputValidator.validateWorktreeName('PRN')).toThrow();

      // Note: 'main' and 'master' are allowed as worktree names
      // They're only restricted at the application logic level
    });

    it('should reject empty or too long names', () => {
      expect(() => InputValidator.validateWorktreeName('')).toThrow();
      expect(() => InputValidator.validateWorktreeName('a'.repeat(256))).toThrow();
    });
  });

  describe('validateBranchName', () => {
    it('should accept valid branch names', () => {
      expect(InputValidator.validateBranchName('feature/auth')).toBe('feature/auth');
      expect(InputValidator.validateBranchName('bugfix/login-issue')).toBe('bugfix/login-issue');
      expect(InputValidator.validateBranchName('v1.2.3')).toBe('v1.2.3');
    });

    it('should reject invalid git branch names', () => {
      expect(() => InputValidator.validateBranchName('/invalid')).toThrow();
      expect(() => InputValidator.validateBranchName('invalid/')).toThrow();
      expect(() => InputValidator.validateBranchName('feat//bug')).toThrow();
      expect(() => InputValidator.validateBranchName('test.lock')).toThrow();
      expect(() => InputValidator.validateBranchName('test..branch')).toThrow();
    });

    it('should reject command injection in branch names', () => {
      expect(() => InputValidator.validateBranchName('test; rm -rf /')).toThrow();
      expect(() => InputValidator.validateBranchName('test && ls')).toThrow();
    });
  });

  describe('validatePath', () => {
    it('should accept paths within allowed base', () => {
      const result = InputValidator.validatePath('subdir/file.txt', '/tmp/test');
      expect(result).toContain('/tmp/test/subdir/file.txt');
    });

    it('should prevent path traversal', () => {
      expect(() => InputValidator.validatePath('../etc/passwd', '/tmp/test')).toThrow();
      expect(() => InputValidator.validatePath('../../root', '/tmp/test')).toThrow();
      expect(() => InputValidator.validatePath('/etc/passwd', '/tmp/test')).toThrow();
    });

    it('should reject null bytes', () => {
      expect(() => InputValidator.validatePath('file\0.txt', '/tmp/test')).toThrow();
      expect(() => InputValidator.validatePath('file\x00.txt', '/tmp/test')).toThrow();
    });

    it('should normalize paths', () => {
      const result = InputValidator.validatePath('./subdir/../file.txt', '/tmp/test');
      expect(result).toContain('/tmp/test/file.txt');
    });
  });

  describe('validateServiceName', () => {
    it('should accept valid service names', () => {
      expect(InputValidator.validateServiceName('postgres')).toBe('postgres');
      expect(InputValidator.validateServiceName('api-server')).toBe('api-server');
      expect(InputValidator.validateServiceName('redis_cache')).toBe('redis_cache');
    });

    it('should reject command injection attempts', () => {
      expect(() => InputValidator.validateServiceName('test; rm -rf /')).toThrow();
      expect(() => InputValidator.validateServiceName('test && ls')).toThrow();
      expect(() => InputValidator.validateServiceName('test|cat')).toThrow();
    });

    it('should reject too long names', () => {
      expect(() => InputValidator.validateServiceName('a'.repeat(101))).toThrow();
    });
  });

  describe('validatePort', () => {
    it('should accept valid port numbers', () => {
      expect(InputValidator.validatePort(3000)).toBe(3000);
      expect(InputValidator.validatePort('5432')).toBe(5432);
      expect(InputValidator.validatePort(65535)).toBe(65535);
    });

    it('should reject invalid ports', () => {
      expect(() => InputValidator.validatePort(80)).toThrow(); // Too low
      expect(() => InputValidator.validatePort(1000)).toThrow(); // Too low
      expect(() => InputValidator.validatePort(65536)).toThrow(); // Too high
      expect(() => InputValidator.validatePort(-1)).toThrow(); // Negative
      expect(() => InputValidator.validatePort('abc')).toThrow(); // Not a number
      expect(() => InputValidator.validatePort(3.14)).toThrow(); // Not an integer
    });
  });

  describe('validateEnvVarName', () => {
    it('should accept valid environment variable names', () => {
      expect(InputValidator.validateEnvVarName('PATH')).toBe('PATH');
      expect(InputValidator.validateEnvVarName('DATABASE_URL')).toBe('DATABASE_URL');
      expect(InputValidator.validateEnvVarName('_PRIVATE')).toBe('_PRIVATE');
    });

    it('should reject invalid names', () => {
      expect(() => InputValidator.validateEnvVarName('123INVALID')).toThrow();
      expect(() => InputValidator.validateEnvVarName('test-var')).toThrow();
      expect(() => InputValidator.validateEnvVarName('test var')).toThrow();
      expect(() => InputValidator.validateEnvVarName('test.var')).toThrow();
    });
  });

  describe('validateEnvVarValue', () => {
    it('should accept normal values', () => {
      expect(InputValidator.validateEnvVarValue('hello')).toBe('hello');
      expect(InputValidator.validateEnvVarValue('123')).toBe('123');
      expect(InputValidator.validateEnvVarValue('/path/to/file')).toBe('/path/to/file');
    });

    it('should reject null bytes', () => {
      expect(() => InputValidator.validateEnvVarValue('test\0value')).toThrow();
      expect(() => InputValidator.validateEnvVarValue('test\x00value')).toThrow();
    });

    it('should reject too long values', () => {
      expect(() => InputValidator.validateEnvVarValue('a'.repeat(10001))).toThrow();
    });

    it('should warn about dangerous characters', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      InputValidator.validateEnvVarValue('test$var');
      expect(warnSpy).toHaveBeenCalled();

      InputValidator.validateEnvVarValue('test`cmd`');
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('validateCommand', () => {
    it('should accept whitelisted commands', () => {
      expect(InputValidator.validateCommand('claude')).toBe('claude');
      expect(InputValidator.validateCommand('codex')).toBe('codex');
      expect(InputValidator.validateCommand('shell')).toBe('shell');
      expect(InputValidator.validateCommand('/bin/bash')).toBe('/bin/bash');
    });

    it('should reject non-whitelisted commands', () => {
      expect(() => InputValidator.validateCommand('rm')).toThrow();
      expect(() => InputValidator.validateCommand('cat /etc/passwd')).toThrow();
      expect(() => InputValidator.validateCommand('sudo')).toThrow();
      expect(() => InputValidator.validateCommand('curl http://evil.com')).toThrow();
    });
  });

  describe('sanitizeGitArgs', () => {
    it('should accept safe git arguments', () => {
      const args = ['branch', '--show-current'];
      expect(InputValidator.sanitizeGitArgs(args)).toEqual(args);
    });

    it('should reject command injection attempts', () => {
      expect(() => InputValidator.sanitizeGitArgs(['branch', '; rm -rf /'])).toThrow();
      expect(() => InputValidator.sanitizeGitArgs(['branch', '&& cat /etc/passwd'])).toThrow();
      expect(() => InputValidator.sanitizeGitArgs(['branch', '| ls'])).toThrow();
      expect(() => InputValidator.sanitizeGitArgs(['branch', '`whoami`'])).toThrow();
      expect(() => InputValidator.sanitizeGitArgs(['branch', '$(whoami)'])).toThrow();
    });
  });

  describe('validateComposeCommand', () => {
    it('should accept whitelisted compose commands', () => {
      expect(InputValidator.validateComposeCommand('up -d')).toBe('up -d');
      expect(InputValidator.validateComposeCommand('down')).toBe('down');
      expect(InputValidator.validateComposeCommand('logs -f')).toBe('logs -f');
      expect(InputValidator.validateComposeCommand('ps')).toBe('ps');
    });

    it('should reject non-whitelisted compose commands', () => {
      expect(() => InputValidator.validateComposeCommand('exec bash')).toThrow();
      expect(() => InputValidator.validateComposeCommand('run sh')).toThrow();
    });

    it('should reject command injection attempts', () => {
      expect(() => InputValidator.validateComposeCommand('up; rm -rf /')).toThrow();
      expect(() => InputValidator.validateComposeCommand('down && cat /etc/passwd')).toThrow();
      expect(() => InputValidator.validateComposeCommand('ps | grep secret')).toThrow();
    });
  });

  describe('validateSearchPattern', () => {
    it('should accept simple search patterns', () => {
      expect(InputValidator.validateSearchPattern('test')).toBe('test');
      expect(InputValidator.validateSearchPattern('[a-z]+')).toBe('[a-z]+');
      expect(InputValidator.validateSearchPattern('foo|bar')).toBe('foo|bar');
    });

    it('should reject ReDoS patterns', () => {
      expect(() => InputValidator.validateSearchPattern('.*.*.*')).toThrow();
      expect(() => InputValidator.validateSearchPattern('+*')).toThrow();
      // Note: Simple lazy quantifiers are allowed, only nested/repeated patterns are blocked
    });

    it('should reject too long patterns', () => {
      expect(() => InputValidator.validateSearchPattern('a'.repeat(501))).toThrow();
    });
  });
});
