import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCLI } from './claude-cli.mjs';

describe('ClaudeCLI', () => {
  let cli;

  beforeEach(() => {
    cli = new ClaudeCLI('/Users/tim/code/vibe-worktrees');
  });

  it('should build correct command for simple prompt', () => {
    const cmd = cli.buildCommand({
      prompt: 'Run tests',
      model: 'claude-sonnet-4.5',
      useContinuation: false
    });

    expect(cmd).toContain('claude');
    expect(cmd).toContain('--print');
    expect(cmd).toContain('--model claude-sonnet-4.5');
    expect(cmd).toContain('Run tests');
  });

  it('should build command with continuation flag', () => {
    const cmd = cli.buildCommand({
      prompt: 'Continue work',
      model: 'claude-sonnet-4.5',
      useContinuation: true
    });

    expect(cmd).toContain('--continue');
  });

  it('should extract session ID from output', () => {
    const output = 'Some output\nSession ID: 1234567890abcdef\nMore output';
    const sessionId = cli.extractSessionId(output);
    expect(sessionId).toBe('1234567890abcdef');
  });

  it('should handle missing session ID', () => {
    const output = 'Some output without session ID';
    const sessionId = cli.extractSessionId(output);
    expect(sessionId).toBeNull();
  });

  it('should escape single quotes in prompts', () => {
    const cmd = cli.buildCommand({
      prompt: "Don't do this",
      model: 'claude-sonnet-4.5',
      useContinuation: false
    });

    // Should escape the single quote properly for bash
    expect(cmd).toContain("'Don'\\''t do this'");
  });
});
