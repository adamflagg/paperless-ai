import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import jwt from 'jsonwebtoken';

const require_ = createRequire(import.meta.url);

describe('middleware/authSetup.js – createAuthSetupMiddleware', () => {
  let createAuthSetupMiddleware;
  let PUBLIC_PATHS;
  let JWT_SECRET;
  let middleware;
  let mockSetupService;

  beforeEach(() => {
    vi.resetModules();

    process.env.API_KEY = 'test-api-key-12345';
    delete process.env.PAPERLESS_AI_INITIAL_SETUP;

    const auth = require_('../../../routes/auth');
    JWT_SECRET = auth.JWT_SECRET;

    const mod = require_('../../../middleware/authSetup');
    createAuthSetupMiddleware = mod.createAuthSetupMiddleware;
    PUBLIC_PATHS = mod.PUBLIC_PATHS;

    mockSetupService = {
      isConfigured: vi.fn().mockResolvedValue(true),
    };

    middleware = createAuthSetupMiddleware(mockSetupService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.API_KEY;
    delete process.env.PAPERLESS_AI_INITIAL_SETUP;
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function createMocks(overrides = {}) {
    return {
      req: { cookies: {}, headers: {}, path: '/dashboard', ...overrides },
      res: {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        redirect: vi.fn(),
        clearCookie: vi.fn(),
      },
      next: vi.fn(),
    };
  }

  function signToken(payload = { id: 1, username: 'testuser' }) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  }

  // ---------------------------------------------------------------------------
  // Public paths
  // ---------------------------------------------------------------------------

  describe('public paths skip auth', () => {
    const publicPaths = [
      '/login',
      '/logout',
      '/setup',
      '/health',
      '/api-docs',
      '/api/webhook/document',
    ];

    for (const p of publicPaths) {
      it(`skips auth for ${p}`, async () => {
        const { req, res, next } = createMocks({ path: p });

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.redirect).not.toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });
    }

    it('skips auth for sub-paths of public paths (e.g. /setup/save)', async () => {
      const { req, res, next } = createMocks({ path: '/setup/save' });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('exports expected PUBLIC_PATHS array', () => {
      expect(PUBLIC_PATHS).toEqual(expect.arrayContaining(['/login', '/health', '/api-docs']));
    });
  });

  // ---------------------------------------------------------------------------
  // Unauthenticated requests
  // ---------------------------------------------------------------------------

  describe('unauthenticated requests', () => {
    it('redirects page request to /login when no credentials', async () => {
      const { req, res, next } = createMocks({ path: '/dashboard' });

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/login');
    });

    it('returns 401 JSON for API request when no credentials', async () => {
      const { req, res, next } = createMocks({ path: '/api/documents' });

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Authentication required' });
    });
  });

  // ---------------------------------------------------------------------------
  // Valid JWT
  // ---------------------------------------------------------------------------

  describe('valid JWT', () => {
    it('allows access with valid JWT in cookie', async () => {
      const token = signToken();
      const { req, res, next } = createMocks({ cookies: { jwt: token }, path: '/dashboard' });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user.username).toBe('testuser');
    });

    it('allows access with valid JWT in Authorization header', async () => {
      const token = signToken();
      const { req, res, next } = createMocks({
        headers: { authorization: `Bearer ${token}` },
        path: '/dashboard',
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.username).toBe('testuser');
    });
  });

  // ---------------------------------------------------------------------------
  // Invalid JWT
  // ---------------------------------------------------------------------------

  describe('invalid JWT', () => {
    it('clears cookie and redirects to /login for page route', async () => {
      const { req, res, next } = createMocks({
        cookies: { jwt: 'bad-token' },
        path: '/dashboard',
      });

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('jwt');
      expect(res.redirect).toHaveBeenCalledWith('/login');
    });

    it('clears cookie and returns 403 for API route', async () => {
      const { req, res, next } = createMocks({
        cookies: { jwt: 'bad-token' },
        path: '/api/documents',
      });

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('jwt');
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' });
    });

    it('handles expired JWT on page route', async () => {
      const expired = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: '0s' });
      const { req, res, next } = createMocks({
        cookies: { jwt: expired },
        path: '/settings',
      });

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('jwt');
      expect(res.redirect).toHaveBeenCalledWith('/login');
    });
  });

  // ---------------------------------------------------------------------------
  // API key auth
  // ---------------------------------------------------------------------------

  describe('API key authentication', () => {
    it('allows access with valid API key', async () => {
      const { req, res, next } = createMocks({
        headers: { 'x-api-key': 'test-api-key-12345' },
        path: '/api/documents',
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toEqual({ apiKey: true });
    });

    it('falls through to JWT check with wrong API key', async () => {
      const { req, res, next } = createMocks({
        headers: { 'x-api-key': 'wrong-key' },
        path: '/api/documents',
      });

      await middleware(req, res, next);

      // No JWT present so should get 401
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Setup check
  // ---------------------------------------------------------------------------

  describe('setup check', () => {
    it('redirects to /setup when not configured (default)', async () => {
      mockSetupService.isConfigured.mockResolvedValue(false);
      const token = signToken();
      const { req, res, next } = createMocks({
        cookies: { jwt: token },
        path: '/dashboard',
      });

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/setup');
    });

    it('redirects to /settings when not configured and PAPERLESS_AI_INITIAL_SETUP=yes', async () => {
      process.env.PAPERLESS_AI_INITIAL_SETUP = 'yes';
      mockSetupService.isConfigured.mockResolvedValue(false);
      const token = signToken();
      const { req, res, next } = createMocks({
        cookies: { jwt: token },
        path: '/dashboard',
      });

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/settings');
    });

    it('does not redirect when already on /setup path', async () => {
      // /setup is a public path so it skips auth entirely
      mockSetupService.isConfigured.mockResolvedValue(false);
      const { req, res, next } = createMocks({ path: '/setup' });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('does not redirect when configured', async () => {
      mockSetupService.isConfigured.mockResolvedValue(true);
      const token = signToken();
      const { req, res, next } = createMocks({
        cookies: { jwt: token },
        path: '/dashboard',
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('returns 500 when setupService.isConfigured throws', async () => {
      mockSetupService.isConfigured.mockRejectedValue(new Error('DB error'));
      const token = signToken();
      const { req, res, next } = createMocks({
        cookies: { jwt: token },
        path: '/dashboard',
      });

      // Suppress console.error for cleaner test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Internal Server Error');

      consoleSpy.mockRestore();
    });
  });
});
