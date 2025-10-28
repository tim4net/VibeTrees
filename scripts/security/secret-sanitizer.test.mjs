/**
 * Security Tests for Secret Sanitizer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecretSanitizer, sanitize, hasSecrets } from './secret-sanitizer.mjs';

describe('SecretSanitizer', () => {
  let sanitizer;

  beforeEach(() => {
    sanitizer = new SecretSanitizer();
  });

  describe('API Keys', () => {
    it('should detect and sanitize Anthropic API keys', () => {
      const text = 'My key is sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw';
      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('sk-ant-api03');
      expect(sanitized).toContain('[REDACTED]');
      expect(detected).toHaveLength(1);
      expect(detected[0].type).toBe('Anthropic API Key');
    });

    it('should detect and sanitize OpenAI API keys', () => {
      const text = 'My OpenAI key: sk-abcdefghijklmnopqrstuvwxyz1234567890abcd';
      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234567890abcd');
      expect(sanitized).toContain('[REDACTED]');
      expect(detected.length).toBeGreaterThan(0);
    });

    it('should detect and sanitize GitHub tokens', () => {
      const text = 'GitHub token: ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('ghp_1234567890');
      expect(sanitized).toContain('[REDACTED]');
      expect(detected).toHaveLength(1);
    });

    it('should detect AWS access keys', () => {
      const text = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('Database Credentials', () => {
    it('should sanitize PostgreSQL connection strings', () => {
      const text = 'Connection: postgresql://user:password123@localhost:5432/mydb';
      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('password123');
      expect(sanitized).toContain('[REDACTED]');
      expect(detected.length).toBeGreaterThan(0);
      // May detect both PostgreSQL connection string and password pattern
    });

    it('should sanitize MySQL connection strings', () => {
      const text = 'mysql://root:secretPass@db.example.com:3306/database';
      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('secretPass');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should sanitize MongoDB connection strings', () => {
      const text = 'mongodb://admin:mongoPass@mongo.example.com:27017/db';
      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('mongoPass');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('Private Keys', () => {
    it('should sanitize RSA private keys', () => {
      const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAx+Kf9L7v+gqO0WnU3H8vVQYdOTGqEZfJ9...
-----END RSA PRIVATE KEY-----`;

      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('MIIEpAIBAAKCAQEAx+Kf9L7v');
      expect(sanitized).toContain('[REDACTED]');
      expect(detected).toHaveLength(1);
      expect(detected[0].type).toBe('RSA Private Key');
    });

    it('should sanitize SSH private keys', () => {
      const text = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ...
-----END OPENSSH PRIVATE KEY-----`;

      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('b3BlbnNzaC1rZXktdjE');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('JWT Tokens', () => {
    it('should sanitize JWT tokens', () => {
      const text = 'Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const { sanitized, detected } = sanitizer.sanitize(text);

      // Check that the JWT is redacted (note: pattern only matches 10+ char segments)
      expect(sanitized).toContain('[JWT-REDACTED]');
      expect(sanitized).not.toContain('eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ');
      expect(detected.length).toBeGreaterThan(0);
      // Note: Header may remain if shorter than 10 chars after base64url encoding
    });
  });

  describe('Bearer Tokens', () => {
    it('should sanitize bearer tokens', () => {
      const text = 'Authorization: Bearer abc123def456ghi789';
      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('abc123def456ghi789');
      expect(sanitized).toContain('Bearer [REDACTED]');
    });
  });

  describe('Passwords', () => {
    it('should sanitize passwords in environment variables', () => {
      const text = 'PASSWORD=mySecretPass123';
      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('mySecretPass123');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should sanitize passwords in various formats', () => {
      const tests = [
        'PASSWORD="secretPass"',
        "PASSWORD='secretPass'",
        'PWD=secretPass',
        'PASSWD=secretPass'
      ];

      for (const test of tests) {
        const { sanitized } = sanitizer.sanitize(test);
        expect(sanitized).not.toContain('secretPass');
        expect(sanitized).toContain('[REDACTED]');
      }
    });
  });

  describe('PII (Personally Identifiable Information)', () => {
    it('should sanitize credit card numbers', () => {
      const text = 'Card: 4532-1234-5678-9012';
      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('4532-1234-5678-9012');
      expect(sanitized).toContain('[CREDIT-CARD-REDACTED]');
    });

    it('should sanitize SSN numbers', () => {
      const text = 'SSN: 123-45-6789';
      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('123-45-6789');
      expect(sanitized).toContain('[SSN-REDACTED]');
    });
  });

  describe('Environment Variables', () => {
    it('should sanitize environment variable objects', () => {
      const env = {
        PATH: '/usr/bin:/bin',
        API_KEY: 'sk-secret123456789',
        DATABASE_PASSWORD: 'dbPass123',
        PORT: '3000'
      };

      const sanitized = sanitizer.sanitizeEnv(env);

      expect(sanitized.PATH).toBe('/usr/bin:/bin');
      expect(sanitized.API_KEY).toBe('[REDACTED]');
      expect(sanitized.DATABASE_PASSWORD).toBe('[REDACTED]');
      expect(sanitized.PORT).toBe('3000');
    });
  });

  describe('Terminal Scrollback', () => {
    it('should sanitize scrollback buffer', () => {
      const lines = [
        'Logging in...',
        'API_KEY=sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw',
        'Connected to database',
        'postgresql://user:pass@localhost/db'
      ];

      const sanitized = sanitizer.sanitizeScrollback(lines);

      expect(sanitized[0]).toBe('Logging in...');
      expect(sanitized[1]).toContain('[REDACTED]');
      expect(sanitized[2]).toBe('Connected to database');
      expect(sanitized[3]).not.toContain('pass');
    });
  });

  describe('Error Messages', () => {
    it('should sanitize error messages', () => {
      const error = new Error('Failed to connect to postgresql://user:pass@localhost/db');
      const sanitized = sanitizer.sanitizeError(error);

      expect(sanitized).not.toContain('pass');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should sanitize error stack traces', () => {
      const error = new Error('API key sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw is invalid');
      error.stack = 'Error: API key sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw is invalid\n    at validateKey (auth.js:10:15)';

      const sanitized = sanitizer.sanitizeError(error);

      expect(sanitized).not.toContain('sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('Detection', () => {
    it('should detect secrets without sanitizing', () => {
      expect(hasSecrets('API_KEY=sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw')).toBe(true);
      expect(hasSecrets('Just a normal message')).toBe(false);
    });

    it('should count detected secrets', () => {
      const text = 'Key1: sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw Pass: PASSWORD=secret123';
      const { detected } = sanitizer.sanitize(text);

      expect(detected.length).toBeGreaterThan(0);
    });

    it('should log detections', () => {
      sanitizer.clearDetectionLog();
      sanitizer.sanitize('API_KEY=sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw');
      const log = sanitizer.getDetectionLog();

      expect(log.length).toBeGreaterThan(0);
      expect(log[0]).toHaveProperty('timestamp');
      expect(log[0]).toHaveProperty('detected');
    });

    it('should provide detection stats', () => {
      sanitizer.clearDetectionLog();
      sanitizer.sanitize('API_KEY=sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw');
      sanitizer.sanitize('postgresql://user:pass@localhost/db');

      const stats = sanitizer.getStats();

      expect(stats.totalDetections).toBe(2);
      expect(stats.secretTypes).toHaveProperty('Anthropic API Key');
      expect(stats.secretTypes).toHaveProperty('PostgreSQL Connection String');
    });
  });

  describe('Helper Functions', () => {
    it('should provide sanitize helper', () => {
      const result = sanitize('API_KEY=sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw');
      expect(result).not.toContain('sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw');
    });

    it('should provide hasSecrets helper', () => {
      expect(hasSecrets('API_KEY=sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw')).toBe(true);
      expect(hasSecrets('Normal text')).toBe(false);
    });
  });

  describe('Multiple Secrets', () => {
    it('should detect and sanitize multiple different secrets', () => {
      const text = `
        API_KEY=sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw
        DATABASE_URL=postgresql://user:pass@localhost/db
        JWT_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature
        GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz
      `;

      const { sanitized, detected } = sanitizer.sanitize(text);

      expect(sanitized).not.toContain('sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890def123ghi456jkl789mno012pqr345stu678vw');
      expect(sanitized).not.toContain('pass');
      expect(sanitized).not.toContain('ghp_1234567890abcdefghijklmnopqrstuvwxyz');
      expect(detected.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const { sanitized, detected } = sanitizer.sanitize('');
      expect(sanitized).toBe('');
      expect(detected).toHaveLength(0);
    });

    it('should handle null/undefined', () => {
      const { sanitized: sanitized1 } = sanitizer.sanitize(null);
      const { sanitized: sanitized2 } = sanitizer.sanitize(undefined);

      expect(sanitized1).toBe(null);
      expect(sanitized2).toBe(undefined);
    });

    it('should handle non-string input', () => {
      const { sanitized } = sanitizer.sanitize(123);
      expect(sanitized).toBe(123);
    });

    it('should be disabled when configured', () => {
      const disabledSanitizer = new SecretSanitizer({ enabled: false });
      const text = 'API_KEY=sk-secret123';
      const { sanitized, detected } = disabledSanitizer.sanitize(text);

      expect(sanitized).toBe(text);
      expect(detected).toHaveLength(0);
    });
  });
});
