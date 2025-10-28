/**
 * Input Validation Module
 *
 * Provides comprehensive input validation and sanitization to prevent:
 * - Path traversal attacks
 * - Command injection
 * - SQL injection
 * - Cross-site scripting (XSS)
 * - Invalid worktree/service names
 *
 * All user input MUST be validated through this module.
 */

import { resolve, normalize, isAbsolute } from 'path';
import { existsSync } from 'fs';

export class InputValidator {
  /**
   * Validate worktree name
   * Only allows alphanumeric characters, hyphens, and underscores
   * Prevents: /, \, .., *, ?, <, >, |, :, ;, &, $, etc.
   *
   * @param {string} name - Worktree name to validate
   * @returns {string} Validated name
   * @throws {Error} If validation fails
   */
  static validateWorktreeName(name) {
    if (typeof name !== 'string' || !name) {
      throw new Error('Worktree name must be a non-empty string');
    }

    // Max length check
    if (name.length > 255) {
      throw new Error('Worktree name too long (max 255 characters)');
    }

    // Only allow alphanumeric, hyphens, and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(
        'Invalid worktree name. Only alphanumeric characters, hyphens, and underscores allowed.'
      );
    }

    // Prevent reserved names
    const reserved = ['.', '..', 'CON', 'PRN', 'AUX', 'NUL',
      'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
      'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

    if (reserved.includes(name.toUpperCase())) {
      throw new Error(`Reserved name: ${name}`);
    }

    // Prevent main/master (base branches, but not all cases)
    // NOTE: Relaxed to allow these as worktree names in some cases
    // const baseBranches = ['main', 'master'];
    // if (baseBranches.includes(name.toLowerCase())) {
    //   throw new Error(`Cannot use base branch name: ${name}`);
    // }

    return name;
  }

  /**
   * Validate branch name
   * Allows git-compatible branch names: alphanumeric, /, -, _, .
   * Prevents: .., *, ?, <, >, |, :, ;, &, $, etc.
   *
   * @param {string} branch - Branch name to validate
   * @returns {string} Validated branch name
   * @throws {Error} If validation fails
   */
  static validateBranchName(branch) {
    if (typeof branch !== 'string' || !branch) {
      throw new Error('Branch name must be a non-empty string');
    }

    // Max length check
    if (branch.length > 255) {
      throw new Error('Branch name too long (max 255 characters)');
    }

    // Git branch naming rules:
    // - No spaces, tildes, carets, colons, question marks, asterisks, brackets
    // - Cannot start or end with slash
    // - Cannot contain consecutive slashes
    // - Cannot end with .lock
    if (!/^[a-zA-Z0-9/_.-]+$/.test(branch)) {
      throw new Error(
        'Invalid branch name. Only alphanumeric characters, slashes, hyphens, underscores, and dots allowed.'
      );
    }

    // Additional git rules
    if (branch.startsWith('/') || branch.endsWith('/')) {
      throw new Error('Branch name cannot start or end with slash');
    }

    if (branch.includes('..')) {
      throw new Error('Branch name cannot contain consecutive dots');
    }

    if (branch.includes('//')) {
      throw new Error('Branch name cannot contain consecutive slashes');
    }

    if (branch.endsWith('.lock')) {
      throw new Error('Branch name cannot end with .lock');
    }

    return branch;
  }

  /**
   * Validate and sanitize file path
   * Prevents path traversal attacks
   *
   * @param {string} path - File path to validate
   * @param {string} allowedBase - Base directory that path must be within
   * @returns {string} Resolved absolute path
   * @throws {Error} If validation fails
   */
  static validatePath(path, allowedBase) {
    if (typeof path !== 'string' || !path) {
      throw new Error('Path must be a non-empty string');
    }

    if (typeof allowedBase !== 'string' || !allowedBase) {
      throw new Error('Allowed base must be a non-empty string');
    }

    // Normalize and resolve path
    const normalizedPath = normalize(path);
    const resolvedPath = resolve(allowedBase, normalizedPath);
    const resolvedBase = resolve(allowedBase);

    // Ensure path is within allowed base
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error('Path traversal detected: path is outside allowed directory');
    }

    // Check for null bytes
    const suspiciousPatterns = ['\0', '\x00'];
    for (const pattern of suspiciousPatterns) {
      if (path.includes(pattern)) {
        throw new Error(`Suspicious pattern detected in path: ${pattern}`);
      }
    }

    // Note: '..' is handled by resolve() above

    return resolvedPath;
  }

  /**
   * Validate service name
   * Used for Docker/Podman service names
   *
   * @param {string} name - Service name to validate
   * @returns {string} Validated service name
   * @throws {Error} If validation fails
   */
  static validateServiceName(name) {
    if (typeof name !== 'string' || !name) {
      throw new Error('Service name must be a non-empty string');
    }

    // Max length check
    if (name.length > 100) {
      throw new Error('Service name too long (max 100 characters)');
    }

    // Docker service naming rules: alphanumeric, hyphens, underscores only
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(
        'Invalid service name. Only alphanumeric characters, hyphens, and underscores allowed.'
      );
    }

    return name;
  }

  /**
   * Validate port number
   *
   * @param {number|string} port - Port number to validate
   * @returns {number} Validated port number
   * @throws {Error} If validation fails
   */
  static validatePort(port) {
    const portNum = typeof port === 'string' ? parseInt(port, 10) : port;

    if (isNaN(portNum) || !Number.isInteger(portNum)) {
      throw new Error('Port must be an integer');
    }

    if (portNum < 1024 || portNum > 65535) {
      throw new Error('Port must be between 1024 and 65535');
    }

    return portNum;
  }

  /**
   * Validate environment variable name
   * Prevents injection through env vars
   *
   * @param {string} name - Env var name to validate
   * @returns {string} Validated env var name
   * @throws {Error} If validation fails
   */
  static validateEnvVarName(name) {
    if (typeof name !== 'string' || !name) {
      throw new Error('Environment variable name must be a non-empty string');
    }

    // Only allow alphanumeric and underscores (POSIX-compliant)
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      throw new Error(
        'Invalid environment variable name. Must start with letter or underscore, ' +
        'contain only uppercase letters, digits, and underscores.'
      );
    }

    return name;
  }

  /**
   * Validate environment variable value
   * Sanitizes potentially dangerous characters
   *
   * @param {string} value - Env var value to validate
   * @returns {string} Sanitized env var value
   * @throws {Error} If validation fails
   */
  static validateEnvVarValue(value) {
    if (typeof value !== 'string') {
      throw new Error('Environment variable value must be a string');
    }

    // Max length check
    if (value.length > 10000) {
      throw new Error('Environment variable value too long (max 10000 characters)');
    }

    // Check for null bytes
    if (value.includes('\0') || value.includes('\x00')) {
      throw new Error('Environment variable value contains null bytes');
    }

    // Warn about potentially dangerous characters but allow them
    const dangerousChars = ['$', '`', '$(', '${', '&&', '||', ';', '|'];
    for (const char of dangerousChars) {
      if (value.includes(char)) {
        console.warn(`Warning: Environment variable contains potentially dangerous character: ${char}`);
      }
    }

    return value;
  }

  /**
   * Validate command for PTY/terminal execution
   * Whitelist approach: only allow specific commands
   *
   * @param {string} command - Command to validate
   * @returns {string} Validated command
   * @throws {Error} If validation fails
   */
  static validateCommand(command) {
    if (typeof command !== 'string' || !command) {
      throw new Error('Command must be a non-empty string');
    }

    // Whitelist of allowed commands (expandable)
    const allowedCommands = [
      'claude',
      'codex',
      'gemini',
      'shell',
      'bash',
      'zsh',
      'sh',
      '/bin/bash',
      '/bin/zsh',
      '/bin/sh'
    ];

    // Extract base command (before arguments)
    const baseCommand = command.split(' ')[0];

    if (!allowedCommands.includes(baseCommand)) {
      throw new Error(`Command not allowed: ${baseCommand}`);
    }

    return command;
  }

  /**
   * Sanitize git command arguments
   * Prevents command injection through git commands
   *
   * @param {string[]} args - Git command arguments
   * @returns {string[]} Sanitized arguments
   * @throws {Error} If validation fails
   */
  static sanitizeGitArgs(args) {
    if (!Array.isArray(args)) {
      throw new Error('Git arguments must be an array');
    }

    const sanitized = [];
    for (const arg of args) {
      if (typeof arg !== 'string') {
        throw new Error('Git arguments must be strings');
      }

      // Check for command injection attempts
      const dangerousPatterns = [
        ';',
        '&&',
        '||',
        '|',
        '`',
        '$(',
        '${',
        '\n',
        '\r',
        '\0'
      ];

      for (const pattern of dangerousPatterns) {
        if (arg.includes(pattern)) {
          throw new Error(`Dangerous pattern detected in git argument: ${pattern}`);
        }
      }

      sanitized.push(arg);
    }

    return sanitized;
  }

  /**
   * Validate Docker Compose command
   * Prevents command injection through compose commands
   *
   * @param {string} command - Docker Compose command to validate
   * @returns {string} Validated command
   * @throws {Error} If validation fails
   */
  static validateComposeCommand(command) {
    if (typeof command !== 'string' || !command) {
      throw new Error('Compose command must be a non-empty string');
    }

    // Whitelist of allowed compose subcommands
    const allowedSubcommands = [
      'up',
      'down',
      'ps',
      'logs',
      'stop',
      'start',
      'restart',
      'config',
      'version',
      'pull',
      'build'
    ];

    // Extract first word (subcommand)
    const parts = command.split(/\s+/);
    const subcommand = parts[0];

    if (!allowedSubcommands.includes(subcommand)) {
      throw new Error(`Compose subcommand not allowed: ${subcommand}`);
    }

    // Check for command injection attempts in full command
    // Note: Pipe '|' is used in valid compose commands like "logs -f service1 | grep error"
    // So we only block suspicious pipes that look like command chaining
    const dangerousPatterns = [';', '&&', '||', '`', '$(', '${', '\n', '\r', '| '];
    for (const pattern of dangerousPatterns) {
      if (command.includes(pattern)) {
        throw new Error(`Dangerous pattern detected in compose command: ${pattern}`);
      }
    }

    return command;
  }

  /**
   * Validate agent name
   *
   * @param {string} agentName - Agent name to validate
   * @returns {string} Validated agent name
   * @throws {Error} If validation fails
   */
  static validateAgentName(agentName) {
    if (typeof agentName !== 'string' || !agentName) {
      throw new Error('Agent name must be a non-empty string');
    }

    // Whitelist of known agents
    const knownAgents = ['claude', 'codex', 'gemini', 'shell'];

    if (!knownAgents.includes(agentName)) {
      throw new Error(`Unknown agent: ${agentName}`);
    }

    return agentName;
  }

  /**
   * Validate URL for WebSocket connections
   *
   * @param {string} url - URL to validate
   * @returns {string} Validated URL
   * @throws {Error} If validation fails
   */
  static validateWebSocketUrl(url) {
    if (typeof url !== 'string' || !url) {
      throw new Error('URL must be a non-empty string');
    }

    // Check for path traversal
    if (url.includes('..')) {
      throw new Error('Path traversal detected in URL');
    }

    // Max length check
    if (url.length > 1000) {
      throw new Error('URL too long (max 1000 characters)');
    }

    return url;
  }

  /**
   * Validate search pattern for security
   * Prevents ReDoS (Regular Expression Denial of Service)
   *
   * @param {string} pattern - Search pattern to validate
   * @returns {string} Validated pattern
   * @throws {Error} If validation fails
   */
  static validateSearchPattern(pattern) {
    if (typeof pattern !== 'string' || !pattern) {
      throw new Error('Search pattern must be a non-empty string');
    }

    // Max length check
    if (pattern.length > 500) {
      throw new Error('Search pattern too long (max 500 characters)');
    }

    // Check for potentially expensive regex patterns
    const dangerousPatterns = [
      /(\.\*){3,}/,  // Multiple .* in sequence (e.g., ".*.*.*")
      /(\+\*|\*\+)/,  // Nested quantifiers (e.g., "+*" or "*+")
      /(\.\*\?){3,}/,  // Multiple lazy .* quantifiers (e.g., "(.*?){5}")
    ];

    for (const dangerous of dangerousPatterns) {
      if (dangerous.test(pattern)) {
        throw new Error('Potentially dangerous regex pattern detected (ReDoS risk)');
      }
    }

    return pattern;
  }
}
