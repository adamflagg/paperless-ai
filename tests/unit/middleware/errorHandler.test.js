import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const errorHandler = require('../../../middleware/errorHandler');

describe('errorHandler middleware', () => {
  let mockRes;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it('handles UnauthorizedError with 401', () => {
    const err = new Error('Unauthorized');
    err.name = 'UnauthorizedError';
    errorHandler(err, {}, mockRes, () => {});
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });

  it('handles ValidationError with 400', () => {
    const err = new Error('Invalid input');
    err.name = 'ValidationError';
    errorHandler(err, {}, mockRes, () => {});
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid input' });
  });

  it('uses err.status when available', () => {
    const err = new Error('Not Found');
    err.status = 404;
    errorHandler(err, {}, mockRes, () => {});
    expect(mockRes.status).toHaveBeenCalledWith(404);
  });

  it('defaults to 500 when no status', () => {
    const err = new Error('Something failed');
    errorHandler(err, {}, mockRes, () => {});
    expect(mockRes.status).toHaveBeenCalledWith(500);
  });

  it('hides error details in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = new Error('secret details');
    errorHandler(err, {}, mockRes, () => {});
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    process.env.NODE_ENV = originalEnv;
  });

  it('shows error message in non-production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const err = new Error('debug details');
    errorHandler(err, {}, mockRes, () => {});
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'debug details' });
    process.env.NODE_ENV = originalEnv;
  });

  it('logs error with stack', () => {
    const err = new Error('test error');
    errorHandler(err, {}, mockRes, () => {});
    expect(console.error).toHaveBeenCalledWith('[ERROR] test error', { stack: err.stack });
  });
});
