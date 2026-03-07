const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/config');
const { JWT_SECRET } = require('../routes/auth');

/**
 * Timing-safe comparison for two strings.
 * Prevents timing attacks when validating API keys.
 */
function safeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Public paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/logout', '/health', '/api-docs', '/api/webhook/document'];

// Import document model for user existence check
const documentModel = require('../models/document');

/**
 * Centralized auth + setup check middleware.
 *
 * @param {object} setupService - The setupService instance (injected for testability)
 * @returns {Function} Express middleware
 */
function createAuthSetupMiddleware(setupService) {
  return async (req, res, next) => {
    // Skip auth for always-public paths
    if (PUBLIC_PATHS.some((p) => req.path === p || req.path.startsWith(p + '/'))) {
      return next();
    }

    // /setup is only public during initial setup (no users in DB)
    if (req.path === '/setup' || req.path.startsWith('/setup/')) {
      try {
        const users = await documentModel.getUsers();
        if (!users || users.length === 0) {
          return next();
        }
      } catch (error) {
        console.error('Error checking users for setup auth:', error.message);
      }
      // Users exist — fall through to normal auth
    }

    // Auth: API key or JWT
    const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];
    const apiKey = req.headers['x-api-key'];

    if (apiKey && config.apiKey && safeCompare(apiKey, config.apiKey)) {
      req.user = { apiKey: true };
    } else if (!token) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      return res.redirect('/login');
    } else {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
      } catch (_error) {
        res.clearCookie('jwt');
        if (req.path.startsWith('/api/')) {
          return res.status(403).json({ message: 'Invalid or expired token' });
        }
        return res.redirect('/login');
      }
    }

    // Setup check: redirect to setup/settings if not configured
    try {
      const isConfigured = await setupService.isConfigured();
      if (
        !isConfigured &&
        (!config.initialSetup || config.initialSetup === 'no') &&
        !req.path.startsWith('/setup')
      ) {
        return res.redirect('/setup');
      } else if (
        !isConfigured &&
        config.initialSetup === 'yes' &&
        !req.path.startsWith('/settings')
      ) {
        return res.redirect('/settings');
      }
    } catch (error) {
      console.error('Error checking setup configuration:', error);
      return res.status(500).send('Internal Server Error');
    }

    next();
  };
}

module.exports = { createAuthSetupMiddleware, PUBLIC_PATHS };
