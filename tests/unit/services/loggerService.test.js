/**
 * Tests for loggerService log-level filtering.
 *
 * The Logger monkey-patches the global console methods, so every test must
 * carefully save the real console before creating a Logger instance and
 * restore it afterwards. We use a temp directory for log files so nothing
 * leaks between runs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Capture the *real* console methods once, before any Logger can touch them.
// ---------------------------------------------------------------------------
const realConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};

describe('loggerService', () => {
  let tmpDir;
  let origLogLevel;

  beforeEach(() => {
    // Ensure console is pristine before each test
    Object.assign(console, realConsole);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
    origLogLevel = process.env.LOG_LEVEL;
  });

  afterEach(() => {
    // Always restore real console, even if a test fails
    Object.assign(console, realConsole);

    // Restore LOG_LEVEL
    if (origLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = origLogLevel;
    }

    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {
      // ignore cleanup errors
    }
  });

  /**
   * Helper: create a fresh Logger instance with the given log level.
   * Clears the module cache so the constructor re-reads process.env.LOG_LEVEL.
   */
  function createLogger(logLevel) {
    if (logLevel !== undefined) {
      process.env.LOG_LEVEL = logLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
    const require = createRequire(import.meta.url);
    // Clear cached module so constructor picks up the current env
    delete require.cache[require.resolve('../../../services/loggerService')];
    const Logger = require('../../../services/loggerService');
    return new Logger({
      logFile: 'test.log',
      logDir: tmpDir,
      format: 'txt',
      timestamp: false,
    });
  }

  /** Read the test log file contents (empty string if the file does not exist). */
  function readLog() {
    const logPath = path.join(tmpDir, 'test.log');
    if (!fs.existsSync(logPath)) return '';
    return fs.readFileSync(logPath, 'utf-8');
  }

  // =========================================================================
  // LEVELS static property
  // =========================================================================
  describe('LEVELS static property', () => {
    it('should expose four severity levels in ascending order', () => {
      const require = createRequire(import.meta.url);
      delete require.cache[require.resolve('../../../services/loggerService')];
      const Logger = require('../../../services/loggerService');

      expect(Logger.LEVELS).toEqual({ error: 0, warn: 1, info: 2, debug: 3 });
    });
  });

  // =========================================================================
  // Default log level (info)
  // =========================================================================
  describe('default log level (info)', () => {
    it('should default to info when LOG_LEVEL is not set', () => {
      const logger = createLogger(undefined);
      console.log('info visible');
      console.debug('debug suppressed');

      const content = readLog();
      expect(content).toContain('info visible');
      expect(content).not.toContain('debug suppressed');
      logger.restore();
    });

    it('should log info, warn, and error messages at default level', () => {
      const logger = createLogger(undefined);
      console.log('info msg');
      console.warn('warn msg');
      console.error('error msg');

      const content = readLog();
      expect(content).toContain('info msg');
      expect(content).toContain('warn msg');
      expect(content).toContain('error msg');
      logger.restore();
    });

    it('should suppress debug messages at default level', () => {
      const logger = createLogger(undefined);
      console.debug('hidden debug');

      const content = readLog();
      expect(content).not.toContain('hidden debug');
      logger.restore();
    });
  });

  // =========================================================================
  // LOG_LEVEL=error
  // =========================================================================
  describe('LOG_LEVEL=error', () => {
    it('should only log error messages', () => {
      const logger = createLogger('error');
      console.error('visible error');
      console.warn('suppressed warn');
      console.log('suppressed info');
      console.debug('suppressed debug');

      const content = readLog();
      expect(content).toContain('visible error');
      expect(content).not.toContain('suppressed warn');
      expect(content).not.toContain('suppressed info');
      expect(content).not.toContain('suppressed debug');
      logger.restore();
    });
  });

  // =========================================================================
  // LOG_LEVEL=warn
  // =========================================================================
  describe('LOG_LEVEL=warn', () => {
    it('should log error and warn but suppress info and debug', () => {
      const logger = createLogger('warn');
      console.error('error visible');
      console.warn('warn visible');
      console.log('info suppressed');
      console.info('info2 suppressed');
      console.debug('debug suppressed');

      const content = readLog();
      expect(content).toContain('error visible');
      expect(content).toContain('warn visible');
      expect(content).not.toContain('info suppressed');
      expect(content).not.toContain('info2 suppressed');
      expect(content).not.toContain('debug suppressed');
      logger.restore();
    });
  });

  // =========================================================================
  // LOG_LEVEL=info
  // =========================================================================
  describe('LOG_LEVEL=info', () => {
    it('should log error, warn, and info but suppress debug', () => {
      const logger = createLogger('info');
      console.error('error visible');
      console.warn('warn visible');
      console.log('info visible');
      console.info('info2 visible');
      console.debug('debug suppressed');

      const content = readLog();
      expect(content).toContain('error visible');
      expect(content).toContain('warn visible');
      expect(content).toContain('info visible');
      expect(content).toContain('info2 visible');
      expect(content).not.toContain('debug suppressed');
      logger.restore();
    });
  });

  // =========================================================================
  // LOG_LEVEL=debug
  // =========================================================================
  describe('LOG_LEVEL=debug', () => {
    it('should log everything including debug', () => {
      const logger = createLogger('debug');
      console.error('error msg');
      console.warn('warn msg');
      console.log('info msg');
      console.info('info2 msg');
      console.debug('debug msg');

      const content = readLog();
      expect(content).toContain('error msg');
      expect(content).toContain('warn msg');
      expect(content).toContain('info msg');
      expect(content).toContain('info2 msg');
      expect(content).toContain('debug msg');
      logger.restore();
    });
  });

  // =========================================================================
  // Invalid LOG_LEVEL
  // =========================================================================
  describe('invalid LOG_LEVEL', () => {
    it('should fall back to info when LOG_LEVEL is an unrecognised string', () => {
      const logger = createLogger('banana');
      console.debug('debug hidden');
      console.log('info shown');

      const content = readLog();
      expect(content).not.toContain('debug hidden');
      expect(content).toContain('info shown');
      logger.restore();
    });
  });

  // =========================================================================
  // shouldLog helper
  // =========================================================================
  describe('shouldLog()', () => {
    it('should return true for levels at or below the configured threshold', () => {
      const logger = createLogger('warn');
      expect(logger.shouldLog('error')).toBe(true);
      expect(logger.shouldLog('warn')).toBe(true);
      expect(logger.shouldLog('info')).toBe(false);
      expect(logger.shouldLog('debug')).toBe(false);
      logger.restore();
    });
  });

  // =========================================================================
  // restore() puts console back
  // =========================================================================
  describe('restore()', () => {
    it('should restore original console methods after calling restore()', () => {
      const logger = createLogger('info');
      // After creation console.log is overridden
      expect(console.log).not.toBe(realConsole.log);

      logger.restore();
      // After restore console.log should be back to the real one
      expect(console.log).toBe(realConsole.log);
      expect(console.error).toBe(realConsole.error);
      expect(console.warn).toBe(realConsole.warn);
      expect(console.info).toBe(realConsole.info);
      expect(console.debug).toBe(realConsole.debug);
    });
  });

  // =========================================================================
  // HTML format respects log level
  // =========================================================================
  describe('HTML format with log levels', () => {
    it('should respect LOG_LEVEL when format is html', () => {
      process.env.LOG_LEVEL = 'error';
      const require = createRequire(import.meta.url);
      delete require.cache[require.resolve('../../../services/loggerService')];
      const Logger = require('../../../services/loggerService');
      const logger = new Logger({
        logFile: 'test.html',
        logDir: tmpDir,
        format: 'html',
        timestamp: false,
      });

      console.error('html error visible');
      console.log('html info suppressed');

      const content = fs.readFileSync(path.join(tmpDir, 'test.html'), 'utf-8');
      expect(content).toContain('html&nbsp;error&nbsp;visible');
      expect(content).not.toContain('html&nbsp;info&nbsp;suppressed');
      logger.restore();
    });
  });

  // =========================================================================
  // console.log maps to info level
  // =========================================================================
  describe('console.log mapping', () => {
    it('should treat console.log as info level', () => {
      const logger = createLogger('warn');
      console.log('should be filtered');

      const content = readLog();
      expect(content).not.toContain('should be filtered');
      logger.restore();
    });
  });

  // =========================================================================
  // Format of written messages is unchanged
  // =========================================================================
  describe('log message format', () => {
    it('should write [TYPE] prefix to txt log files', () => {
      const logger = createLogger('debug');
      console.error('err test');
      console.warn('warn test');
      console.log('info test');
      console.debug('debug test');

      const content = readLog();
      expect(content).toContain('[ERROR] err test');
      expect(content).toContain('[WARN] warn test');
      expect(content).toContain('[INFO] info test');
      expect(content).toContain('[DEBUG] debug test');
      logger.restore();
    });
  });
});
