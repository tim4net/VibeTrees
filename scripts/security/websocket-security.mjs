/**
 * WebSocket Security Module
 *
 * Provides:
 * - Authentication token system
 * - CORS configuration
 * - Rate limiting per client
 * - Connection timeout handling
 * - Message validation
 */

import crypto from 'crypto';

/**
 * Authentication Manager
 * Manages session tokens for WebSocket connections
 */
export class AuthManager {
  constructor() {
    this.tokens = new Map(); // token -> { created, expires, userId, metadata }
    this.tokenExpiry = 24 * 60 * 60 * 1000; // 24 hours
    this._startCleanup();
  }

  /**
   * Generate a secure authentication token
   * @param {Object} metadata - Optional metadata to store with token
   * @returns {string} Authentication token
   */
  generateToken(metadata = {}) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    this.tokens.set(token, {
      created: now,
      expires: now + this.tokenExpiry,
      metadata
    });

    return token;
  }

  /**
   * Validate an authentication token
   * @param {string} token - Token to validate
   * @returns {boolean} True if valid
   */
  validateToken(token) {
    if (!token || typeof token !== 'string') {
      return false;
    }

    const tokenData = this.tokens.get(token);
    if (!tokenData) {
      return false;
    }

    // Check if expired
    if (Date.now() > tokenData.expires) {
      this.tokens.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Revoke a token
   * @param {string} token - Token to revoke
   */
  revokeToken(token) {
    this.tokens.delete(token);
  }

  /**
   * Cleanup expired tokens periodically
   * @private
   */
  _startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [token, data] of this.tokens.entries()) {
        if (now > data.expires) {
          this.tokens.delete(token);
        }
      }
    }, 60 * 60 * 1000); // Clean every hour
  }

  /**
   * Get token count (for monitoring)
   * @returns {number} Number of active tokens
   */
  getTokenCount() {
    return this.tokens.size;
  }
}

/**
 * Rate Limiter
 * Limits requests per client to prevent abuse
 */
export class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 100; // Max requests per window
    this.windowMs = options.windowMs || 60000; // 1 minute window
    this.clients = new Map(); // clientId -> { requests: [], blocked: false }
  }

  /**
   * Check if a client is rate limited
   * @param {string} clientId - Client identifier (IP or token)
   * @returns {Object} { allowed: boolean, remaining: number, resetAt: number }
   */
  check(clientId) {
    const now = Date.now();
    let clientData = this.clients.get(clientId);

    if (!clientData) {
      clientData = { requests: [], blocked: false, blockUntil: 0 };
      this.clients.set(clientId, clientData);
    }

    // Check if client is blocked
    if (clientData.blocked && now < clientData.blockUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: clientData.blockUntil
      };
    } else if (clientData.blocked && now >= clientData.blockUntil) {
      // Unblock client
      clientData.blocked = false;
      clientData.requests = [];
    }

    // Remove old requests outside the window
    clientData.requests = clientData.requests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    // Check if limit exceeded
    if (clientData.requests.length >= this.maxRequests) {
      clientData.blocked = true;
      clientData.blockUntil = now + this.windowMs;

      return {
        allowed: false,
        remaining: 0,
        resetAt: clientData.blockUntil
      };
    }

    // Add current request
    clientData.requests.push(now);

    return {
      allowed: true,
      remaining: this.maxRequests - clientData.requests.length,
      resetAt: now + this.windowMs
    };
  }

  /**
   * Reset rate limit for a client
   * @param {string} clientId - Client identifier
   */
  reset(clientId) {
    this.clients.delete(clientId);
  }

  /**
   * Get rate limit stats
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      totalClients: this.clients.size,
      blockedClients: Array.from(this.clients.values()).filter(c => c.blocked).length
    };
  }
}

/**
 * WebSocket Security Manager
 * Coordinates authentication, rate limiting, and CORS
 */
export class WebSocketSecurity {
  constructor(options = {}) {
    this.authEnabled = options.authEnabled !== false; // Default: enabled
    this.authManager = new AuthManager();
    this.rateLimiter = new RateLimiter(options.rateLimit);
    this.allowedOrigins = options.allowedOrigins || [
      'http://localhost:3335',
      'http://127.0.0.1:3335'
    ];
    this.connectionTimeout = options.connectionTimeout || 300000; // 5 minutes
    this.connections = new Map(); // ws -> { clientId, connectedAt, lastActivity }
  }

  /**
   * Validate origin for CORS
   * @param {string} origin - Origin header
   * @returns {boolean} True if allowed
   */
  validateOrigin(origin) {
    // Allow same-origin (no Origin header)
    if (!origin) {
      return true;
    }

    // Check against whitelist
    return this.allowedOrigins.some(allowed => {
      if (allowed === '*') {
        return true;
      }

      // Exact match
      if (allowed === origin) {
        return true;
      }

      // Wildcard subdomain match (e.g., *.example.com)
      if (allowed.startsWith('*.')) {
        const domain = allowed.substring(2);
        return origin.endsWith(domain);
      }

      return false;
    });
  }

  /**
   * Authenticate WebSocket connection
   * @param {WebSocket} ws - WebSocket instance
   * @param {Object} req - HTTP request object
   * @returns {Object} { allowed: boolean, clientId: string, error?: string }
   */
  authenticate(ws, req) {
    // Extract client identifier (IP address)
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                     req.socket.remoteAddress;

    // Check origin
    const origin = req.headers.origin || req.headers.referer;
    if (origin && !this.validateOrigin(origin)) {
      return {
        allowed: false,
        error: 'Origin not allowed'
      };
    }

    // Check authentication token (if enabled)
    if (this.authEnabled) {
      const token = this._extractToken(req);
      if (!token || !this.authManager.validateToken(token)) {
        return {
          allowed: false,
          error: 'Invalid or missing authentication token'
        };
      }
    }

    // Check rate limit
    const rateLimit = this.rateLimiter.check(clientIp);
    if (!rateLimit.allowed) {
      return {
        allowed: false,
        error: `Rate limit exceeded. Try again after ${new Date(rateLimit.resetAt).toISOString()}`
      };
    }

    // Track connection
    this.connections.set(ws, {
      clientId: clientIp,
      connectedAt: Date.now(),
      lastActivity: Date.now()
    });

    return {
      allowed: true,
      clientId: clientIp
    };
  }

  /**
   * Extract authentication token from request
   * @param {Object} req - HTTP request object
   * @returns {string|null} Token or null
   * @private
   */
  _extractToken(req) {
    // Try query parameter
    const url = new URL(req.url, `http://${req.headers.host}`);
    const queryToken = url.searchParams.get('token');
    if (queryToken) {
      return queryToken;
    }

    // Try Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * Validate WebSocket message
   * @param {WebSocket} ws - WebSocket instance
   * @param {*} message - Message to validate
   * @returns {Object} { valid: boolean, error?: string }
   */
  validateMessage(ws, message) {
    const connData = this.connections.get(ws);
    if (!connData) {
      return {
        valid: false,
        error: 'Connection not tracked'
      };
    }

    // Update last activity
    connData.lastActivity = Date.now();

    // Check message size (max 1MB)
    const messageSize = Buffer.byteLength(message);
    if (messageSize > 1024 * 1024) {
      return {
        valid: false,
        error: 'Message too large (max 1MB)'
      };
    }

    // Check rate limit
    const rateLimit = this.rateLimiter.check(connData.clientId);
    if (!rateLimit.allowed) {
      return {
        valid: false,
        error: 'Rate limit exceeded'
      };
    }

    return { valid: true };
  }

  /**
   * Handle connection timeout
   * Periodically check for inactive connections
   */
  startTimeoutMonitoring() {
    setInterval(() => {
      const now = Date.now();

      for (const [ws, data] of this.connections.entries()) {
        if (now - data.lastActivity > this.connectionTimeout) {
          console.log(`Closing inactive connection: ${data.clientId}`);
          ws.close(1000, 'Connection timeout due to inactivity');
          this.connections.delete(ws);
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Clean up connection tracking
   * @param {WebSocket} ws - WebSocket instance
   */
  cleanupConnection(ws) {
    this.connections.delete(ws);
  }

  /**
   * Generate session token (public method for login endpoints)
   * @param {Object} metadata - Optional metadata
   * @returns {string} Token
   */
  generateToken(metadata) {
    return this.authManager.generateToken(metadata);
  }

  /**
   * Get security stats (for monitoring)
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      activeConnections: this.connections.size,
      activeTokens: this.authManager.getTokenCount(),
      rateLimiter: this.rateLimiter.getStats()
    };
  }
}

/**
 * Security middleware for Express
 * Adds security headers and token generation endpoint
 */
export function createSecurityMiddleware(security) {
  return {
    /**
     * Security headers middleware
     */
    headers: (req, res, next) => {
      // CORS headers
      const origin = req.headers.origin;
      if (origin && security.validateOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      // Security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

      // Handle preflight
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }

      next();
    },

    /**
     * Token generation endpoint (POST /api/auth/token)
     */
    tokenEndpoint: (req, res) => {
      // In a real app, this would verify user credentials
      // For now, generate a token for localhost connections only
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                       req.socket.remoteAddress;

      // Only allow localhost/127.0.0.1
      if (!clientIp.includes('127.0.0.1') && !clientIp.includes('::1') && !clientIp.includes('localhost')) {
        return res.status(403).json({
          error: 'Token generation only allowed from localhost'
        });
      }

      const token = security.generateToken({ ip: clientIp });

      res.json({
        success: true,
        token,
        expiresIn: 86400 // 24 hours
      });
    }
  };
}
