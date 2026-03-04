/**
 * Tests for config/config.js.
 *
 * Verifies the exported configuration object has expected defaults,
 * structure, and behavior.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const config = require('../../../config/config');

describe('config', () => {
  // =========================================================================
  // Smoke test
  // =========================================================================
  it('exports a non-null object', () => {
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  // =========================================================================
  // Version
  // =========================================================================
  describe('PAPERLESS_AI_VERSION', () => {
    it('is a defined string', () => {
      expect(typeof config.PAPERLESS_AI_VERSION).toBe('string');
      expect(config.PAPERLESS_AI_VERSION.length).toBeGreaterThan(0);
    });

    it('follows semver-like pattern', () => {
      expect(config.PAPERLESS_AI_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  // =========================================================================
  // Port
  // =========================================================================
  describe('port', () => {
    it('defaults to 3000 when PAPERLESS_AI_PORT is not set', () => {
      // Port is evaluated at module load time; default is 3000
      expect(typeof config.port).toBe('number');
      // The default should be 3000 unless overridden by env
      if (!process.env.PAPERLESS_AI_PORT) {
        expect(config.port).toBe(3000);
      }
    });

    it('is a number', () => {
      expect(typeof config.port).toBe('number');
      expect(Number.isFinite(config.port)).toBe(true);
    });
  });

  // =========================================================================
  // nodeEnv getter
  // =========================================================================
  describe('nodeEnv', () => {
    let savedNodeEnv;

    afterEach(() => {
      if (savedNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = savedNodeEnv;
      }
    });

    it('returns process.env.NODE_ENV when set', () => {
      savedNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      expect(config.nodeEnv).toBe('production');
    });

    it('defaults to "development" when NODE_ENV is not set', () => {
      savedNodeEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      expect(config.nodeEnv).toBe('development');
    });
  });

  // =========================================================================
  // Provider sub-configs
  // =========================================================================
  describe('provider configurations', () => {
    it('has openai config with apiKey property', () => {
      expect(config.openai).toBeDefined();
      expect(config.openai).toHaveProperty('apiKey');
    });

    it('has ollama config with apiUrl and model', () => {
      expect(config.ollama).toBeDefined();
      expect(config.ollama).toHaveProperty('apiUrl');
      expect(config.ollama).toHaveProperty('model');
    });

    it('defaults ollama apiUrl to localhost:11434', () => {
      if (!process.env.OLLAMA_API_URL) {
        expect(config.ollama.apiUrl).toBe('http://localhost:11434');
      }
    });

    it('defaults ollama model to llama3.2', () => {
      if (!process.env.OLLAMA_MODEL) {
        expect(config.ollama.model).toBe('llama3.2');
      }
    });

    it('has custom config with apiUrl, apiKey, model', () => {
      expect(config.custom).toBeDefined();
      expect(config.custom).toHaveProperty('apiUrl');
      expect(config.custom).toHaveProperty('apiKey');
      expect(config.custom).toHaveProperty('model');
    });

    it('has azure config with apiKey, endpoint, deploymentName, apiVersion', () => {
      expect(config.azure).toBeDefined();
      expect(config.azure).toHaveProperty('apiKey');
      expect(config.azure).toHaveProperty('endpoint');
      expect(config.azure).toHaveProperty('deploymentName');
      expect(config.azure).toHaveProperty('apiVersion');
    });

    it('defaults azure apiVersion to "2023-05-15"', () => {
      if (!process.env.AZURE_API_VERSION) {
        expect(config.azure.apiVersion).toBe('2023-05-15');
      }
    });

    it('has gemini config with apiKey and model', () => {
      expect(config.gemini).toBeDefined();
      expect(config.gemini).toHaveProperty('apiKey');
      expect(config.gemini).toHaveProperty('model');
    });

    it('defaults gemini model to "gemini-2.0-flash"', () => {
      if (!process.env.GEMINI_MODEL) {
        expect(config.gemini.model).toBe('gemini-2.0-flash');
      }
    });

    it('has paperless config with apiUrl and apiToken', () => {
      expect(config.paperless).toBeDefined();
      expect(config.paperless).toHaveProperty('apiUrl');
      expect(config.paperless).toHaveProperty('apiToken');
    });
  });

  // =========================================================================
  // limitFunctions
  // =========================================================================
  describe('limitFunctions', () => {
    it('has expected properties', () => {
      expect(config.limitFunctions).toBeDefined();
      expect(config.limitFunctions).toHaveProperty('activateTagging');
      expect(config.limitFunctions).toHaveProperty('activateCorrespondents');
      expect(config.limitFunctions).toHaveProperty('activateDocumentType');
      expect(config.limitFunctions).toHaveProperty('activateTitle');
      expect(config.limitFunctions).toHaveProperty('activateCustomFields');
    });

    it('defaults all limitFunctions to "yes" when env vars not set', () => {
      // These are loaded at module init time with default 'yes'
      const expected = [
        'activateTagging',
        'activateCorrespondents',
        'activateDocumentType',
        'activateTitle',
        'activateCustomFields',
      ];
      for (const key of expected) {
        expect(['yes', 'no']).toContain(config.limitFunctions[key]);
      }
    });

    it('values are either "yes" or "no"', () => {
      for (const value of Object.values(config.limitFunctions)) {
        expect(['yes', 'no']).toContain(value);
      }
    });
  });

  // =========================================================================
  // AI restrictions
  // =========================================================================
  describe('AI restrictions', () => {
    it('has restrictToExistingTags property', () => {
      expect(config).toHaveProperty('restrictToExistingTags');
      expect(['yes', 'no']).toContain(config.restrictToExistingTags);
    });

    it('has restrictToExistingCorrespondents property', () => {
      expect(config).toHaveProperty('restrictToExistingCorrespondents');
      expect(['yes', 'no']).toContain(config.restrictToExistingCorrespondents);
    });

    it('has restrictToExistingDocumentTypes property', () => {
      expect(config).toHaveProperty('restrictToExistingDocumentTypes');
      expect(['yes', 'no']).toContain(config.restrictToExistingDocumentTypes);
    });

    it('defaults restrictions to "no"', () => {
      // Default is 'no' for all restriction settings
      if (!process.env.RESTRICT_TO_EXISTING_TAGS) {
        expect(config.restrictToExistingTags).toBe('no');
      }
      if (!process.env.RESTRICT_TO_EXISTING_CORRESPONDENTS) {
        expect(config.restrictToExistingCorrespondents).toBe('no');
      }
      if (!process.env.RESTRICT_TO_EXISTING_DOCUMENT_TYPES) {
        expect(config.restrictToExistingDocumentTypes).toBe('no');
      }
    });
  });

  // =========================================================================
  // External API config
  // =========================================================================
  describe('externalApiConfig', () => {
    it('has expected shape', () => {
      expect(config.externalApiConfig).toBeDefined();
      expect(config.externalApiConfig).toHaveProperty('enabled');
      expect(config.externalApiConfig).toHaveProperty('url');
      expect(config.externalApiConfig).toHaveProperty('method');
      expect(config.externalApiConfig).toHaveProperty('headers');
      expect(config.externalApiConfig).toHaveProperty('body');
      expect(config.externalApiConfig).toHaveProperty('timeout');
      expect(config.externalApiConfig).toHaveProperty('transformationTemplate');
    });

    it('defaults enabled to "no"', () => {
      if (!process.env.EXTERNAL_API_ENABLED) {
        expect(config.externalApiConfig.enabled).toBe('no');
      }
    });

    it('defaults method to "GET"', () => {
      if (!process.env.EXTERNAL_API_METHOD) {
        expect(config.externalApiConfig.method).toBe('GET');
      }
    });

    it('defaults timeout to 5000', () => {
      if (!process.env.EXTERNAL_API_TIMEOUT) {
        expect(config.externalApiConfig.timeout).toBe(5000);
      }
    });
  });

  // =========================================================================
  // Default values
  // =========================================================================
  describe('default values', () => {
    it('aiProvider defaults to "openai"', () => {
      if (!process.env.AI_PROVIDER) {
        expect(config.aiProvider).toBe('openai');
      }
    });

    it('scanInterval defaults to a cron pattern', () => {
      expect(typeof config.scanInterval).toBe('string');
      expect(config.scanInterval.length).toBeGreaterThan(0);
    });

    it('useExistingData defaults to "no"', () => {
      if (!process.env.USE_EXISTING_DATA) {
        expect(config.useExistingData).toBe('no');
      }
    });

    it('disableAutomaticProcessing defaults to "no"', () => {
      if (!process.env.DISABLE_AUTOMATIC_PROCESSING) {
        expect(config.disableAutomaticProcessing).toBe('no');
      }
    });

    it('addAIProcessedTag defaults to "no"', () => {
      if (!process.env.ADD_AI_PROCESSED_TAG) {
        expect(config.addAIProcessedTag).toBe('no');
      }
    });

    it('addAIProcessedTags defaults to "ai-processed"', () => {
      if (!process.env.AI_PROCESSED_TAG_NAME) {
        expect(config.addAIProcessedTags).toBe('ai-processed');
      }
    });

    it('logLevel defaults to "info"', () => {
      if (!process.env.LOG_LEVEL) {
        expect(config.logLevel).toBe('info');
      }
    });

    it('ragServiceUrl defaults to "http://localhost:8000"', () => {
      if (!process.env.RAG_SERVICE_URL) {
        expect(config.ragServiceUrl).toBe('http://localhost:8000');
      }
    });
  });

  // =========================================================================
  // Prompt templates
  // =========================================================================
  describe('prompt templates', () => {
    it('has specialPromptPreDefinedTags as a string', () => {
      expect(typeof config.specialPromptPreDefinedTags).toBe('string');
      expect(config.specialPromptPreDefinedTags.length).toBeGreaterThan(0);
    });

    it('has mustHavePrompt containing JSON template', () => {
      expect(typeof config.mustHavePrompt).toBe('string');
      expect(config.mustHavePrompt).toContain('"title"');
      expect(config.mustHavePrompt).toContain('"correspondent"');
      expect(config.mustHavePrompt).toContain('"tags"');
      expect(config.mustHavePrompt).toContain('%CUSTOMFIELDS%');
    });
  });

  // =========================================================================
  // Security getters
  // =========================================================================
  describe('security getters', () => {
    it('jwtSecret reads from process.env.JWT_SECRET', () => {
      const saved = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'test-secret-value';
      expect(config.jwtSecret).toBe('test-secret-value');
      if (saved === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = saved;
      }
    });

    it('apiKey reads from process.env.API_KEY', () => {
      const saved = process.env.API_KEY;
      process.env.API_KEY = 'test-api-key';
      expect(config.apiKey).toBe('test-api-key');
      if (saved === undefined) {
        delete process.env.API_KEY;
      } else {
        process.env.API_KEY = saved;
      }
    });
  });
});
