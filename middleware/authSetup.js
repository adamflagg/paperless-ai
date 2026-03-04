const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../routes/auth');

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/logout',
  '/setup',
  '/health',
  '/api-docs',
  '/api/webhook/document',
];

/**
 * Centralized auth + setup check middleware.
 *
 * @param {object} setupService - The setupService instance (injected for testability)
 * @returns {Function} Express middleware
 */
function createAuthSetupMiddleware(setupService) {
  return async (req, res, next) => {
    // Skip auth for public paths
    if (PUBLIC_PATHS.some((p) => req.path === p || req.path.startsWith(p + '/'))) {
      return next();
    }

    // Auth: API key or JWT
    const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];
    const apiKey = req.headers['x-api-key'];

    if (apiKey && apiKey === process.env.API_KEY) {
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
        (!process.env.PAPERLESS_AI_INITIAL_SETUP ||
          process.env.PAPERLESS_AI_INITIAL_SETUP === 'no') &&
        !req.path.startsWith('/setup')
      ) {
        return res.redirect('/setup');
      } else if (
        !isConfigured &&
        process.env.PAPERLESS_AI_INITIAL_SETUP === 'yes' &&
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
