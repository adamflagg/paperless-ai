import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import jwt from 'jsonwebtoken';

// Use createRequire so we get the same CJS module instance that
// auth.js loads, allowing us to read its JWT_SECRET export.
const require_ = createRequire(import.meta.url);

describe('routes/auth.js', () => {
  let authenticateJWT;
  let isAuthenticated;
  let JWT_SECRET;

  beforeEach(() => {
    // Fresh require each test so env mutations don't leak
    vi.resetModules();

    // Set a known API_KEY for API-key tests
    process.env.API_KEY = 'test-api-key-12345';

    const auth = require_('../../../routes/auth');
    authenticateJWT = auth.authenticateJWT;
    isAuthenticated = auth.isAuthenticated;
    JWT_SECRET = auth.JWT_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.API_KEY;
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Build mock req / res / next with sensible defaults. */
  function createMocks(overrides = {}) {
    return {
      req: { cookies: {}, headers: {}, ...overrides },
      res: {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        redirect: vi.fn(),
        clearCookie: vi.fn(),
      },
      next: vi.fn(),
    };
  }

  /** Sign a valid JWT token using the secret exported by auth.js. */
  function signToken(payload = { id: 1, username: 'testuser' }) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  }

  // ---------------------------------------------------------------------------
  // JWT_SECRET export
  // ---------------------------------------------------------------------------

  describe('JWT_SECRET export', () => {
    it('exports a JWT_SECRET string', () => {
      expect(typeof JWT_SECRET).toBe('string');
      expect(JWT_SECRET.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // authenticateJWT
  // ---------------------------------------------------------------------------

  describe('authenticateJWT', () => {
    it('calls next() with valid JWT in cookie', () => {
      const token = signToken();
      const { req, res, next } = createMocks({ cookies: { jwt: token } });

      authenticateJWT(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user.username).toBe('testuser');
    });

    it('calls next() with valid JWT in Authorization header', () => {
      const token = signToken();
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
      });

      authenticateJWT(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user.username).toBe('testuser');
    });

    it('calls next() with valid API key', () => {
      const { req, res, next } = createMocks({
        headers: { 'x-api-key': 'test-api-key-12345' },
      });

      authenticateJWT(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toEqual({ apiKey: true });
    });

    it('returns 401 when no credentials provided', () => {
      const { req, res, next } = createMocks();

      authenticateJWT(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Authentication required' });
    });

    it('returns 403 with invalid JWT', () => {
      const { req, res, next } = createMocks({
        cookies: { jwt: 'bad-token' },
      });

      authenticateJWT(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' });
    });

    it('returns 403 with expired JWT', () => {
      const expired = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: '0s' });
      const { req, res, next } = createMocks({
        cookies: { jwt: expired },
      });

      authenticateJWT(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 401 with wrong API key', () => {
      const { req, res, next } = createMocks({
        headers: { 'x-api-key': 'wrong-key' },
      });

      authenticateJWT(req, res, next);

      // No JWT either, so falls through to 401
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('prefers API key over JWT when both are present', () => {
      const token = signToken();
      const { req, res, next } = createMocks({
        cookies: { jwt: token },
        headers: { 'x-api-key': 'test-api-key-12345' },
      });

      authenticateJWT(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      // API key path sets user to { apiKey: true }, not decoded JWT
      expect(req.user).toEqual({ apiKey: true });
    });
  });

  // ---------------------------------------------------------------------------
  // isAuthenticated
  // ---------------------------------------------------------------------------

  describe('isAuthenticated', () => {
    it('calls next() with valid JWT in cookie', () => {
      const token = signToken();
      const { req, res, next } = createMocks({ cookies: { jwt: token } });

      isAuthenticated(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.username).toBe('testuser');
    });

    it('calls next() with valid JWT in Authorization header', () => {
      const token = signToken();
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
      });

      isAuthenticated(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.username).toBe('testuser');
    });

    it('calls next() with valid API key', () => {
      const { req, res, next } = createMocks({
        headers: { 'x-api-key': 'test-api-key-12345' },
      });

      isAuthenticated(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toEqual({ apiKey: true });
    });

    it('redirects to /login when no credentials', () => {
      const { req, res, next } = createMocks();

      isAuthenticated(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/login');
    });

    it('redirects to /login and clears cookie with invalid JWT', () => {
      const { req, res, next } = createMocks({
        cookies: { jwt: 'bad-token' },
      });

      isAuthenticated(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('jwt');
      expect(res.redirect).toHaveBeenCalledWith('/login');
    });

    it('redirects to /login and clears cookie with expired JWT', () => {
      const expired = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: '0s' });
      const { req, res, next } = createMocks({
        cookies: { jwt: expired },
      });

      isAuthenticated(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('jwt');
      expect(res.redirect).toHaveBeenCalledWith('/login');
    });
  });

  // ---------------------------------------------------------------------------
  // JWT_SECRET ephemeral fallback
  // ---------------------------------------------------------------------------

  describe('JWT_SECRET ephemeral fallback', () => {
    it('generates a random secret when JWT_SECRET env var is not set', () => {
      // JWT_SECRET env var is not set in the test environment
      delete process.env.JWT_SECRET;
      // The module was already loaded without JWT_SECRET — verify it exported a truthy value
      expect(JWT_SECRET).toBeTruthy();
      expect(typeof JWT_SECRET).toBe('string');
      // An ephemeral secret from crypto.randomBytes(64).toString('hex') is 128 hex chars
      expect(JWT_SECRET.length).toBe(128);
    });

    it('logs a warning when JWT_SECRET env var is not set', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      delete process.env.JWT_SECRET;

      // Re-require to trigger the module-level warning
      // Clear the CJS cache so the module re-executes
      const modulePath = require_.resolve('../../../routes/auth');
      delete require_.cache[modulePath];
      // Also clear cached middleware that imports auth
      const authSetupPath = require_.resolve('../../../middleware/authSetup');
      delete require_.cache[authSetupPath];

      require_('../../../routes/auth');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET not set'));

      warnSpy.mockRestore();

      // Restore the module for subsequent tests
      delete require_.cache[modulePath];
      delete require_.cache[authSetupPath];
    });
  });

  // ---------------------------------------------------------------------------
  // Timing-safe API key comparison
  // ---------------------------------------------------------------------------

  describe('timing-safe API key comparison', () => {
    it('accepts a valid API key (same value)', () => {
      const { req, res, next } = createMocks({
        headers: { 'x-api-key': 'test-api-key-12345' },
      });

      authenticateJWT(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toEqual({ apiKey: true });
    });

    it('rejects a wrong API key of different length', () => {
      const { req, res, next } = createMocks({
        headers: { 'x-api-key': 'short' },
      });

      authenticateJWT(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects a wrong API key of same length', () => {
      // 'test-api-key-12345' has 18 chars; craft a wrong key of the same length
      const wrongKey = 'wrong-api-key-9999';
      expect(wrongKey.length).toBe('test-api-key-12345'.length);

      const { req, res, next } = createMocks({
        headers: { 'x-api-key': wrongKey },
      });

      authenticateJWT(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects API key when API_KEY env var is not set', () => {
      delete process.env.API_KEY;

      const { req, res, next } = createMocks({
        headers: { 'x-api-key': 'test-api-key-12345' },
      });

      authenticateJWT(req, res, next);

      // Falls through to 401 (no JWT either)
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
