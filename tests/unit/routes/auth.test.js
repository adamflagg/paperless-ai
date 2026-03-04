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
});
