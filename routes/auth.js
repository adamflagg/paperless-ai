const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Generate an ephemeral secret when JWT_SECRET is not configured (e.g. first-run setup wizard).
// Sessions signed with this secret will not survive restarts.
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(64).toString('hex');
  console.warn(
    'JWT_SECRET not set — using random ephemeral secret. Sessions will not persist across restarts.'
  );
}

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

// JWT middleware to verify token
const authenticateJWT = (req, res, next) => {
  const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];
  const apiKey = req.headers['x-api-key'];

  if (apiKey && process.env.API_KEY && safeCompare(apiKey, process.env.API_KEY)) {
    req.user = { apiKey: true };
    return next();
  }

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (_error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

const isAuthenticated = (req, res, next) => {
  const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];
  const apiKey = req.headers['x-api-key'];

  if (apiKey && process.env.API_KEY && safeCompare(apiKey, process.env.API_KEY)) {
    req.user = { apiKey: true };
    return next();
  }

  if (!token) {
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (_error) {
    res.clearCookie('jwt');
    return res.redirect('/login');
  }
};

module.exports = { authenticateJWT, isAuthenticated, JWT_SECRET };
