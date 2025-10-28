/**
 * Secret Detection and Sanitization Module
 *
 * Detects and sanitizes secrets from:
 * - Terminal output and scrollback
 * - Log files
 * - Error messages
 * - Environment variables
 *
 * Prevents accidental exposure of:
 * - API keys
 * - Passwords
 * - Private keys
 * - Tokens
 * - Database credentials
 */

/**
 * Secret patterns to detect
 */
const SECRET_PATTERNS = [
  // JWT Tokens (put first to avoid matching by other patterns)
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    replacement: '[JWT-REDACTED]'
  },

  // API Keys
  {
    name: 'Anthropic API Key',
    pattern: /sk-ant-[a-zA-Z0-9_-]{95,}/g,
    replacement: 'sk-ant-[REDACTED]'
  },
  {
    name: 'OpenAI API Key',
    pattern: /\bsk-[a-zA-Z0-9]{40,}\b/g,  // Must be at word boundary, longer length
    replacement: 'sk-[REDACTED]'
  },
  {
    name: 'GitHub Token',
    pattern: /gh[pousr]_[a-zA-Z0-9]{36,}/g,
    replacement: 'gh[p|o|u|s|r]_[REDACTED]'
  },
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: 'AKIA[REDACTED]'
  },
  // AWS Secret Key pattern disabled - too many false positives with JWT and base64
  // {
  //   name: 'AWS Secret Key',
  //   pattern: /[0-9a-zA-Z/+=]{40}/g,  // Be careful with this one (high false positive rate)
  //   replacement: '[REDACTED]',
  //   contextRequired: true  // Only match if preceded by AWS context
  // },

  // Generic API Keys (common patterns)
  // Disabled - too broad and causes false positives
  // {
  //   name: 'Generic API Key',
  //   pattern: /\b[A-Za-z0-9_-]{32,}\b/g,
  //   replacement: '[REDACTED]',
  //   contextRequired: true  // Only match if preceded by "api_key", "apikey", etc.
  // },

  // Database credentials
  {
    name: 'PostgreSQL Connection String',
    pattern: /postgresql:\/\/[^:]+:[^@]+@[^\s'"]+/g,
    replacement: 'postgresql://[REDACTED]:[REDACTED]@[host]'
  },
  {
    name: 'MySQL Connection String',
    pattern: /mysql:\/\/[^:]+:[^@]+@[^\s'"]+/g,
    replacement: 'mysql://[REDACTED]:[REDACTED]@[host]'
  },
  {
    name: 'MongoDB Connection String',
    pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@[^\s'"]+/g,
    replacement: 'mongodb://[REDACTED]:[REDACTED]@[host]'
  },

  // Private Keys
  {
    name: 'RSA Private Key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]+?-----END RSA PRIVATE KEY-----/g,
    replacement: '-----BEGIN RSA PRIVATE KEY-----\n[REDACTED]\n-----END RSA PRIVATE KEY-----'
  },
  {
    name: 'SSH Private Key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]+?-----END OPENSSH PRIVATE KEY-----/g,
    replacement: '-----BEGIN OPENSSH PRIVATE KEY-----\n[REDACTED]\n-----END OPENSSH PRIVATE KEY-----'
  },
  {
    name: 'EC Private Key',
    pattern: /-----BEGIN EC PRIVATE KEY-----[\s\S]+?-----END EC PRIVATE KEY-----/g,
    replacement: '-----BEGIN EC PRIVATE KEY-----\n[REDACTED]\n-----END EC PRIVATE KEY-----'
  },

  // JWT Tokens already added at the top of SECRET_PATTERNS

  // Docker / Container Secrets
  {
    name: 'Docker Registry Auth',
    pattern: /"auth":\s*"[a-zA-Z0-9+/=]+"/g,
    replacement: '"auth": "[REDACTED]"'
  },

  // Credit Card Numbers (PCI compliance)
  {
    name: 'Credit Card',
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: '[CREDIT-CARD-REDACTED]'
  },

  // Social Security Numbers
  {
    name: 'SSN',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN-REDACTED]'
  },

  // Bearer tokens
  {
    name: 'Bearer Token',
    pattern: /Bearer\s+[a-zA-Z0-9_-]+/g,
    replacement: 'Bearer [REDACTED]'
  },

  // Passwords in various formats
  {
    name: 'Password in URL',
    pattern: /:\/\/[^:]+:([^@]+)@/g,
    replacement: '://[user]:[REDACTED]@',
    captureGroups: [1]
  },
  {
    name: 'Password in environment',
    pattern: /(PASSWORD|PWD|PASSWD)=["']?([^"'\s]+)["']?/gi,
    replacement: '$1=[REDACTED]'
  }
];

/**
 * Context patterns that indicate a secret is present
 */
const SECRET_CONTEXT_KEYWORDS = [
  'api_key',
  'apikey',
  'api-key',
  'secret',
  'token',
  'password',
  'passwd',
  'pwd',
  'auth',
  'credential',
  'private_key',
  'privatekey'
];

/**
 * Secret Sanitizer
 */
export class SecretSanitizer {
  constructor(options = {}) {
    this.patterns = options.patterns || SECRET_PATTERNS;
    this.contextKeywords = options.contextKeywords || SECRET_CONTEXT_KEYWORDS;
    this.detectionLog = [];
    this.enabled = options.enabled !== false;
  }

  /**
   * Sanitize text by replacing detected secrets
   * @param {string} text - Text to sanitize
   * @returns {Object} { sanitized: string, detected: Array }
   */
  sanitize(text) {
    if (!this.enabled || !text || typeof text !== 'string') {
      return { sanitized: text, detected: [] };
    }

    let sanitized = text;
    const detected = [];

    for (const { name, pattern, replacement, contextRequired } of this.patterns) {
      // Skip if context required and not found
      if (contextRequired && !this._hasSecretContext(text)) {
        continue;
      }

      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        // Log detection (but don't log the actual secret!)
        detected.push({
          type: name,
          count: matches.length,
          positions: this._getMatchPositions(text, pattern)
        });

        // Replace with redacted version
        sanitized = sanitized.replace(pattern, replacement);
      }
    }

    // Log to detection log
    if (detected.length > 0) {
      this.detectionLog.push({
        timestamp: new Date().toISOString(),
        detected
      });
    }

    return { sanitized, detected };
  }

  /**
   * Check if text contains secret context keywords
   * @param {string} text - Text to check
   * @returns {boolean} True if context found
   * @private
   */
  _hasSecretContext(text) {
    const lowerText = text.toLowerCase();
    return this.contextKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Get positions of pattern matches
   * @param {string} text - Text to search
   * @param {RegExp} pattern - Pattern to match
   * @returns {Array<number>} Array of match positions
   * @private
   */
  _getMatchPositions(text, pattern) {
    const positions = [];
    const regex = new RegExp(pattern);
    let match;

    while ((match = regex.exec(text)) !== null) {
      positions.push(match.index);
    }

    return positions;
  }

  /**
   * Sanitize environment variables
   * @param {Object} env - Environment variables object
   * @returns {Object} Sanitized environment variables
   */
  sanitizeEnv(env) {
    if (!env || typeof env !== 'object') {
      return env;
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(env)) {
      // Check if key suggests it's a secret
      const keyLower = key.toLowerCase();
      const isSecret = this.contextKeywords.some(keyword => keyLower.includes(keyword));

      if (isSecret && typeof value === 'string') {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitize(value).sanitized;
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize terminal scrollback buffer
   * @param {Array<string>} lines - Array of terminal lines
   * @returns {Array<string>} Sanitized lines
   */
  sanitizeScrollback(lines) {
    if (!Array.isArray(lines)) {
      return lines;
    }

    return lines.map(line => this.sanitize(line).sanitized);
  }

  /**
   * Sanitize error message
   * @param {Error|string} error - Error to sanitize
   * @returns {string} Sanitized error message
   */
  sanitizeError(error) {
    if (!error) {
      return error;
    }

    const errorMessage = error.message || error.toString();
    const { sanitized } = this.sanitize(errorMessage);

    // Also sanitize stack trace if present
    if (error.stack) {
      const { sanitized: sanitizedStack } = this.sanitize(error.stack);
      return `${sanitized}\n${sanitizedStack}`;
    }

    return sanitized;
  }

  /**
   * Check if text contains secrets (without sanitizing)
   * @param {string} text - Text to check
   * @returns {boolean} True if secrets detected
   */
  hasSecrets(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }

    for (const { pattern, contextRequired } of this.patterns) {
      if (contextRequired && !this._hasSecretContext(text)) {
        continue;
      }

      if (pattern.test(text)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get detection log
   * @returns {Array} Detection log entries
   */
  getDetectionLog() {
    return [...this.detectionLog];
  }

  /**
   * Clear detection log
   */
  clearDetectionLog() {
    this.detectionLog = [];
  }

  /**
   * Get detection stats
   * @returns {Object} Detection statistics
   */
  getStats() {
    const totalDetections = this.detectionLog.length;
    const secretTypes = {};

    for (const entry of this.detectionLog) {
      for (const detection of entry.detected) {
        secretTypes[detection.type] = (secretTypes[detection.type] || 0) + detection.count;
      }
    }

    return {
      totalDetections,
      secretTypes,
      logSize: this.detectionLog.length
    };
  }
}

/**
 * Global secret sanitizer instance
 */
export const secretSanitizer = new SecretSanitizer();

/**
 * Helper function to sanitize text
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitize(text) {
  return secretSanitizer.sanitize(text).sanitized;
}

/**
 * Helper function to check for secrets
 * @param {string} text - Text to check
 * @returns {boolean} True if secrets found
 */
export function hasSecrets(text) {
  return secretSanitizer.hasSecrets(text);
}
