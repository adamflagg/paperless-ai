/**
 * Tests for config/constants.js.
 *
 * Verifies that every exported constant exists, has the correct type,
 * carries a sensible value, and that related constants are consistent
 * with each other.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const constants = require('../../../config/constants');

describe('constants', () => {
  // ===========================================================================
  // Smoke test – all expected keys are exported
  // ===========================================================================
  it('exports a non-null object', () => {
    expect(constants).toBeDefined();
    expect(typeof constants).toBe('object');
  });

  it('exports all expected constants', () => {
    const expectedKeys = [
      'MAX_LOG_FILE_SIZE',
      'MAX_JSON_PAYLOAD',
      'EXTERNAL_API_DATA_MAX_TOKENS',
      'STATUS_CHECK_MAX_TOKENS',
      'GENERATE_TEXT_MAX_TOKENS',
      'OLLAMA_TIMEOUT_MS',
      'MANUAL_SERVICE_TIMEOUT_MS',
      'SETUP_VALIDATION_MAX_RETRIES',
      'SETUP_VALIDATION_INTERVAL_MS',
      'JWT_EXPIRY',
      'JWT_COOKIE_MAX_AGE_MS',
      'DEFAULT_PAGE_SIZE',
    ];

    for (const key of expectedKeys) {
      expect(constants).toHaveProperty(key);
    }
  });

  it('does not export unexpected keys', () => {
    const allowedKeys = new Set([
      'MAX_LOG_FILE_SIZE',
      'MAX_JSON_PAYLOAD',
      'EXTERNAL_API_DATA_MAX_TOKENS',
      'STATUS_CHECK_MAX_TOKENS',
      'GENERATE_TEXT_MAX_TOKENS',
      'OLLAMA_TIMEOUT_MS',
      'MANUAL_SERVICE_TIMEOUT_MS',
      'SETUP_VALIDATION_MAX_RETRIES',
      'SETUP_VALIDATION_INTERVAL_MS',
      'JWT_EXPIRY',
      'JWT_COOKIE_MAX_AGE_MS',
      'DEFAULT_PAGE_SIZE',
    ]);

    for (const key of Object.keys(constants)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });

  // ===========================================================================
  // File-size limits
  // ===========================================================================
  describe('file-size limits', () => {
    it('MAX_LOG_FILE_SIZE is 10 MB', () => {
      expect(constants.MAX_LOG_FILE_SIZE).toBe(10 * 1024 * 1024);
    });

    it('MAX_JSON_PAYLOAD is a non-empty string', () => {
      expect(typeof constants.MAX_JSON_PAYLOAD).toBe('string');
      expect(constants.MAX_JSON_PAYLOAD.length).toBeGreaterThan(0);
    });

    it('MAX_JSON_PAYLOAD value is "50mb"', () => {
      expect(constants.MAX_JSON_PAYLOAD).toBe('50mb');
    });
  });

  // ===========================================================================
  // Token / AI limits
  // ===========================================================================
  describe('token / AI limits', () => {
    it('EXTERNAL_API_DATA_MAX_TOKENS is a positive number', () => {
      expect(constants.EXTERNAL_API_DATA_MAX_TOKENS).toBeGreaterThan(0);
    });

    it('STATUS_CHECK_MAX_TOKENS is a positive number', () => {
      expect(constants.STATUS_CHECK_MAX_TOKENS).toBeGreaterThan(0);
    });

    it('GENERATE_TEXT_MAX_TOKENS is a positive number', () => {
      expect(constants.GENERATE_TEXT_MAX_TOKENS).toBeGreaterThan(0);
    });

    it('STATUS_CHECK_MAX_TOKENS is smaller than GENERATE_TEXT_MAX_TOKENS', () => {
      expect(constants.STATUS_CHECK_MAX_TOKENS).toBeLessThan(constants.GENERATE_TEXT_MAX_TOKENS);
    });
  });

  // ===========================================================================
  // Timeouts
  // ===========================================================================
  describe('timeouts', () => {
    it('OLLAMA_TIMEOUT_MS is 30 minutes in milliseconds', () => {
      expect(constants.OLLAMA_TIMEOUT_MS).toBe(30 * 60 * 1000);
    });

    it('MANUAL_SERVICE_TIMEOUT_MS is 5 minutes in milliseconds', () => {
      expect(constants.MANUAL_SERVICE_TIMEOUT_MS).toBe(5 * 60 * 1000);
    });

    it('OLLAMA_TIMEOUT_MS > MANUAL_SERVICE_TIMEOUT_MS', () => {
      expect(constants.OLLAMA_TIMEOUT_MS).toBeGreaterThan(constants.MANUAL_SERVICE_TIMEOUT_MS);
    });
  });

  // ===========================================================================
  // Setup validation
  // ===========================================================================
  describe('setup validation', () => {
    it('SETUP_VALIDATION_MAX_RETRIES is a positive integer', () => {
      expect(Number.isInteger(constants.SETUP_VALIDATION_MAX_RETRIES)).toBe(true);
      expect(constants.SETUP_VALIDATION_MAX_RETRIES).toBeGreaterThan(0);
    });

    it('SETUP_VALIDATION_INTERVAL_MS is 5 seconds', () => {
      expect(constants.SETUP_VALIDATION_INTERVAL_MS).toBe(5000);
    });

    it('total setup wait time is at least 1 minute', () => {
      const totalMs =
        constants.SETUP_VALIDATION_MAX_RETRIES * constants.SETUP_VALIDATION_INTERVAL_MS;
      expect(totalMs).toBeGreaterThanOrEqual(60 * 1000);
    });
  });

  // ===========================================================================
  // Authentication
  // ===========================================================================
  describe('authentication', () => {
    it('JWT_EXPIRY is a non-empty string', () => {
      expect(typeof constants.JWT_EXPIRY).toBe('string');
      expect(constants.JWT_EXPIRY.length).toBeGreaterThan(0);
    });

    it('JWT_EXPIRY is "24h"', () => {
      expect(constants.JWT_EXPIRY).toBe('24h');
    });

    it('JWT_COOKIE_MAX_AGE_MS matches JWT_EXPIRY of 24 hours', () => {
      expect(constants.JWT_COOKIE_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    });

    it('JWT_COOKIE_MAX_AGE_MS is a positive number', () => {
      expect(constants.JWT_COOKIE_MAX_AGE_MS).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Pagination
  // ===========================================================================
  describe('pagination', () => {
    it('DEFAULT_PAGE_SIZE is a positive integer', () => {
      expect(Number.isInteger(constants.DEFAULT_PAGE_SIZE)).toBe(true);
      expect(constants.DEFAULT_PAGE_SIZE).toBeGreaterThan(0);
    });

    it('DEFAULT_PAGE_SIZE is 100', () => {
      expect(constants.DEFAULT_PAGE_SIZE).toBe(100);
    });
  });

  // ===========================================================================
  // General numeric sanity
  // ===========================================================================
  describe('numeric values are sensible', () => {
    it('all numeric values are finite', () => {
      for (const [key, value] of Object.entries(constants)) {
        if (typeof value === 'number') {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    });

    it('all numeric values are positive', () => {
      for (const [key, value] of Object.entries(constants)) {
        if (typeof value === 'number') {
          expect(value).toBeGreaterThan(0);
        }
      }
    });
  });
});
