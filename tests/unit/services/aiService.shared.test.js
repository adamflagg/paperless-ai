/**
 * Behavior tests for shared AI service logic via BaseAIService.
 *
 * Tests the REAL extracted methods in services/baseAIService.js:
 *   1. buildCustomFieldsTemplate()  — CUSTOM_FIELDS env -> prompt string
 *   2. parseAIResponse(rawText)     — strip markdown fences, JSON.parse
 *   3. validateAIResponse(parsed)   — tags array + correspondent string check
 *   4. buildSystemPrompt(...)       — config flags -> prompt assembly
 *   5. calculateTokenBudget(...)    — token budget calculation
 *   6. buildErrorResult() / buildSuccessResult() — return shape standardization
 *   7. mapOpenAIUsage() / mapGeminiUsage()       — usage metric mapping
 *   8. getPlaygroundMustHavePrompt()              — playground prompt
 *
 * Uses createRequire() to obtain the same CJS module instances that
 * baseAIService.js uses internally, ensuring config mutations and
 * serviceUtils calls are on the shared singleton objects.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import {
  sampleCustomFields,
  emptyCustomFields,
  sampleAIResponse,
  sampleAIResponseWrappedInMarkdown,
  sampleAIResponseRawJSON,
  sampleAIResponseWrappedInBackticks,
  invalidAIResponseMissingTags,
  invalidAIResponseBadCorrespondent,
  unparsableResponse,
  sampleExistingTags,
  sampleCorrespondents,
  sampleDocumentTypes,
  mustHavePromptTemplate,
} from '../../fixtures/analyzeDocument.fixtures.js';

// ---------------------------------------------------------------------------
// Use createRequire to get the SAME CJS module instances that
// baseAIService.js uses internally via require().
// This ensures config mutations and spies on serviceUtils propagate
// to the code under test.
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);
const BaseAIService = require('../../../services/baseAIService');
const config = require('../../../config/config');

// ===========================================================================
// TESTS
// ===========================================================================

describe('BaseAIService — Shared Logic', () => {
  /** @type {InstanceType<typeof BaseAIService>} */
  let service;
  let savedEnv;
  let savedConfig;

  beforeEach(() => {
    service = new BaseAIService('test-provider');

    // Save env vars we will manipulate
    savedEnv = {
      CUSTOM_FIELDS: process.env.CUSTOM_FIELDS,
      SYSTEM_PROMPT: process.env.SYSTEM_PROMPT,
      USE_PROMPT_TAGS: process.env.USE_PROMPT_TAGS,
      PROMPT_TAGS: process.env.PROMPT_TAGS,
    };

    // Save config values we will manipulate
    savedConfig = {
      useExistingData: config.useExistingData,
      restrictToExistingTags: config.restrictToExistingTags,
      restrictToExistingCorrespondents: config.restrictToExistingCorrespondents,
      tokenLimit: config.tokenLimit,
      responseTokens: config.responseTokens,
      mustHavePrompt: config.mustHavePrompt,
      specialPromptPreDefinedTags: config.specialPromptPreDefinedTags,
    };

    // Set sensible defaults for env vars
    process.env.CUSTOM_FIELDS = sampleCustomFields;
    process.env.SYSTEM_PROMPT = 'You are a document analyzer.';
    process.env.USE_PROMPT_TAGS = 'no';
    process.env.PROMPT_TAGS = '';

    // Set config to known state
    config.useExistingData = 'no';
    config.restrictToExistingTags = 'no';
    config.restrictToExistingCorrespondents = 'no';
    config.tokenLimit = '128000';
    config.responseTokens = '1000';
    config.mustHavePrompt = mustHavePromptTemplate;
    config.specialPromptPreDefinedTags = 'Special predefined tags prompt';
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }

    // Restore config values
    for (const [key, val] of Object.entries(savedConfig)) {
      config[key] = val;
    }

    vi.restoreAllMocks();
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should store the provider name', () => {
      expect(service.providerName).toBe('test-provider');
    });

    it('should initialize client to null', () => {
      expect(service.client).toBeNull();
    });
  });

  // =========================================================================
  // buildCustomFieldsTemplate
  // =========================================================================
  describe('buildCustomFieldsTemplate', () => {
    it('should generate indexed template from custom fields config', () => {
      const result = service.buildCustomFieldsTemplate();

      expect(result).toContain('"custom_fields":');
      expect(result).toContain('"field_name": "amount"');
      expect(result).toContain('"field_name": "due_date"');
      expect(result).toContain('"value": "Fill in the value based on your analysis"');
    });

    it('should use numeric index keys (0, 1, ...) not field names', () => {
      const result = service.buildCustomFieldsTemplate();

      const jsonPart = result.replace('"custom_fields": ', '').replace(/^ {4}/gm, '');
      const parsed = JSON.parse(jsonPart);

      expect(parsed).toHaveProperty('0');
      expect(parsed).toHaveProperty('1');
      expect(parsed['0'].field_name).toBe('amount');
      expect(parsed['1'].field_name).toBe('due_date');
    });

    it('should return empty object for empty custom_fields array', () => {
      process.env.CUSTOM_FIELDS = emptyCustomFields;
      const result = service.buildCustomFieldsTemplate();

      expect(result).toContain('"custom_fields":');
      const jsonPart = result.replace('"custom_fields": ', '').replace(/^ {4}/gm, '');
      const parsed = JSON.parse(jsonPart);

      expect(Object.keys(parsed)).toHaveLength(0);
    });

    it('should handle invalid JSON gracefully (fallback to empty)', () => {
      process.env.CUSTOM_FIELDS = 'not valid json';
      const result = service.buildCustomFieldsTemplate();

      expect(result).toContain('"custom_fields":');
      const jsonPart = result.replace('"custom_fields": ', '').replace(/^ {4}/gm, '');
      const parsed = JSON.parse(jsonPart);

      expect(Object.keys(parsed)).toHaveLength(0);
    });

    it('should handle undefined CUSTOM_FIELDS gracefully', () => {
      delete process.env.CUSTOM_FIELDS;
      const result = service.buildCustomFieldsTemplate();

      expect(result).toContain('"custom_fields":');
      const jsonPart = result.replace('"custom_fields": ', '').replace(/^ {4}/gm, '');
      const parsed = JSON.parse(jsonPart);

      expect(Object.keys(parsed)).toHaveLength(0);
    });

    it('should indent JSON lines with 4 spaces (first line has prefix)', () => {
      const result = service.buildCustomFieldsTemplate();
      const lines = result.split('\n');

      expect(lines[0]).toMatch(/^"custom_fields":/);

      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].startsWith('    ')).toBe(true);
      }
    });

    it('should handle single custom field', () => {
      process.env.CUSTOM_FIELDS = JSON.stringify({
        custom_fields: [{ value: 'vendor_name', data_type: 'string' }],
      });
      const result = service.buildCustomFieldsTemplate();

      const jsonPart = result.replace('"custom_fields": ', '').replace(/^ {4}/gm, '');
      const parsed = JSON.parse(jsonPart);

      expect(Object.keys(parsed)).toHaveLength(1);
      expect(parsed['0'].field_name).toBe('vendor_name');
    });
  });

  // =========================================================================
  // parseAIResponse
  // =========================================================================
  describe('parseAIResponse', () => {
    it('should parse raw JSON response', () => {
      const result = service.parseAIResponse(sampleAIResponseRawJSON);

      expect(result.title).toBe('Acme Corp Invoice $500');
      expect(result.tags).toEqual(['invoice', 'acme']);
      expect(result.correspondent).toBe('Acme Corp');
      expect(result.document_type).toBe('Invoice');
      expect(result.document_date).toBe('2025-01-15');
    });

    it('should strip ```json fences and parse', () => {
      const result = service.parseAIResponse(sampleAIResponseWrappedInMarkdown);

      expect(result.title).toBe('Acme Corp Invoice $500');
      expect(result.tags).toEqual(['invoice', 'acme']);
      expect(result.correspondent).toBe('Acme Corp');
    });

    it('should strip plain ``` fences (no language tag) and parse', () => {
      const result = service.parseAIResponse(sampleAIResponseWrappedInBackticks);

      expect(result.title).toBe('Acme Corp Invoice $500');
      expect(result.correspondent).toBe('Acme Corp');
    });

    it('should handle JSON with leading/trailing whitespace', () => {
      const padded = '   \n\n' + sampleAIResponseRawJSON + '\n\n   ';
      const result = service.parseAIResponse(padded);

      expect(result.title).toBe('Acme Corp Invoice $500');
    });

    it('should handle ```json without trailing newline', () => {
      const noNewline = '```json' + JSON.stringify(sampleAIResponse) + '```';
      const result = service.parseAIResponse(noNewline);

      expect(result.title).toBe('Acme Corp Invoice $500');
    });

    it('should throw on completely unparseable text', () => {
      expect(() => service.parseAIResponse(unparsableResponse)).toThrow(
        'Invalid JSON response from API'
      );
    });

    it('should handle nested ```json fences (strips all occurrences)', () => {
      const nested = '```json\n{"title": "test", "tags": ["a"], "correspondent": "B"}\n```';
      const result = service.parseAIResponse(nested);
      expect(result.title).toBe('test');
    });

    it('should return a valid object after parsing', () => {
      const result = service.parseAIResponse(sampleAIResponseRawJSON);

      // Verify the parsed result has all expected fields
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('tags');
      expect(result).toHaveProperty('correspondent');
      expect(result).toHaveProperty('document_type');
      expect(result).toHaveProperty('document_date');
      expect(result).toHaveProperty('language');
    });
  });

  // =========================================================================
  // validateAIResponse
  // =========================================================================
  describe('validateAIResponse', () => {
    it('should accept valid response with tags array and correspondent string', () => {
      expect(() => service.validateAIResponse(sampleAIResponse)).not.toThrow();
    });

    it('should throw when tags is missing', () => {
      const noTags = { title: 'Test', correspondent: 'Someone' };
      expect(() => service.validateAIResponse(noTags)).toThrow(
        'Invalid response structure: missing tags array or correspondent string'
      );
    });

    it('should throw when tags is not an array', () => {
      const badTags = { tags: 'not-array', correspondent: 'Someone' };
      expect(() => service.validateAIResponse(badTags)).toThrow(
        'Invalid response structure: missing tags array or correspondent string'
      );
    });

    it('should throw when correspondent is not a string', () => {
      const parsed = JSON.parse(invalidAIResponseBadCorrespondent);
      expect(() => service.validateAIResponse(parsed)).toThrow(
        'Invalid response structure: missing tags array or correspondent string'
      );
    });

    it('should throw when response is null', () => {
      expect(() => service.validateAIResponse(null)).toThrow(
        'Invalid response structure: missing tags array or correspondent string'
      );
    });

    it('should throw when response is undefined', () => {
      expect(() => service.validateAIResponse(undefined)).toThrow(
        'Invalid response structure: missing tags array or correspondent string'
      );
    });

    it('should accept response with empty tags array', () => {
      const emptyTags = { tags: [], correspondent: 'Someone' };
      expect(() => service.validateAIResponse(emptyTags)).not.toThrow();
    });

    it('should accept response with extra fields (title, document_type, etc.)', () => {
      const withExtras = {
        tags: ['a'],
        correspondent: 'B',
        title: 'Extra',
        document_type: 'Invoice',
        custom_fields: [],
      };
      expect(() => service.validateAIResponse(withExtras)).not.toThrow();
    });
  });

  // =========================================================================
  // buildSystemPrompt
  // =========================================================================
  describe('buildSystemPrompt', () => {
    it('should use SYSTEM_PROMPT + mustHavePrompt when useExistingData is "no"', () => {
      const { systemPrompt } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        null,
        null
      );

      expect(systemPrompt).toContain('You are a document analyzer.');
      expect(systemPrompt).toContain('Return the result EXCLUSIVELY as a JSON object');
      expect(systemPrompt).not.toContain('Pre-existing tags:');
    });

    it('should prepend existing data when useExistingData is "yes" and no restrictions', () => {
      config.useExistingData = 'yes';

      const { systemPrompt } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        null,
        null
      );

      expect(systemPrompt).toContain('Pre-existing tags: invoice, acme, finance');
      expect(systemPrompt).toContain('Pre-existing correspondents:');
      expect(systemPrompt).toContain('Pre-existing document types: Invoice, Receipt, Contract');
      expect(systemPrompt).toContain('You are a document analyzer.');
      expect(systemPrompt).toContain('Return the result EXCLUSIVELY as a JSON object');
    });

    it('should NOT prepend existing data when restrictToExistingTags is "yes"', () => {
      config.useExistingData = 'yes';
      config.restrictToExistingTags = 'yes';

      const { systemPrompt } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        null,
        null
      );

      expect(systemPrompt).not.toContain('Pre-existing tags:');
      expect(systemPrompt).toContain('You are a document analyzer.');
    });

    it('should NOT prepend existing data when restrictToExistingCorrespondents is "yes"', () => {
      config.useExistingData = 'yes';
      config.restrictToExistingCorrespondents = 'yes';

      const { systemPrompt } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        null,
        null
      );

      expect(systemPrompt).not.toContain('Pre-existing tags:');
      expect(systemPrompt).toContain('You are a document analyzer.');
    });

    it('should replace %CUSTOMFIELDS% placeholder in mustHavePrompt', () => {
      const { systemPrompt } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        null,
        null
      );

      expect(systemPrompt).not.toContain('%CUSTOMFIELDS%');
      expect(systemPrompt).toContain('"field_name": "amount"');
      expect(systemPrompt).toContain('"field_name": "due_date"');
    });

    it('should override entire prompt when USE_PROMPT_TAGS is "yes"', () => {
      process.env.USE_PROMPT_TAGS = 'yes';
      process.env.PROMPT_TAGS = 'tag1, tag2';

      const { systemPrompt, promptTags } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        null,
        null
      );

      expect(systemPrompt).toContain('Take these tags and try to match one or more');
      expect(systemPrompt).toContain('Special predefined tags prompt');
      expect(systemPrompt).not.toContain('You are a document analyzer.');
      expect(promptTags).toBe('tag1, tag2');
    });

    it('should override prompt when customPrompt is provided', () => {
      const { systemPrompt } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        'Custom webhook prompt content',
        null
      );

      expect(systemPrompt).toContain('Custom webhook prompt content');
      expect(systemPrompt).toContain('Return the result EXCLUSIVELY as a JSON object');
      expect(systemPrompt).not.toContain('You are a document analyzer.');
    });

    it('should let customPrompt override usePromptTags (customPrompt applied last)', () => {
      process.env.USE_PROMPT_TAGS = 'yes';
      config.specialPromptPreDefinedTags = 'Tag prompt override';

      const { systemPrompt } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        'Webhook prompt wins',
        null
      );

      expect(systemPrompt).toContain('Webhook prompt wins');
      expect(systemPrompt).not.toContain('Tag prompt override');
    });

    it('should include custom fields in prompt even with customPrompt override', () => {
      const { systemPrompt } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        'Webhook prompt',
        null
      );

      expect(systemPrompt).toContain('Webhook prompt');
      expect(systemPrompt).toContain('"field_name": "amount"');
    });

    it('should append external API data when provided', () => {
      const { systemPrompt } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        null,
        'External data: vendor=Acme'
      );

      expect(systemPrompt).toContain('Additional context from external API:');
      expect(systemPrompt).toContain('External data: vendor=Acme');
    });

    it('should NOT append external API section when data is null', () => {
      const { systemPrompt } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        null,
        null
      );

      expect(systemPrompt).not.toContain('Additional context from external API:');
    });
  });

  // =========================================================================
  // calculateTokenBudget
  //
  // Uses the real serviceUtils (character-based estimation for non-OpenAI
  // models), plus spyOn for controlled tests.
  // =========================================================================
  describe('calculateTokenBudget', () => {
    it('should return totalPromptTokens and availableTokens', async () => {
      config.tokenLimit = '128000';
      config.responseTokens = '1000';

      const result = await service.calculateTokenBudget('short system prompt', '', 'llama3');

      expect(result).toHaveProperty('totalPromptTokens');
      expect(result).toHaveProperty('availableTokens');
      expect(typeof result.totalPromptTokens).toBe('number');
      expect(typeof result.availableTokens).toBe('number');
      expect(result.totalPromptTokens).toBeGreaterThan(0);
      expect(result.availableTokens).toBeGreaterThan(0);
    });

    it('should calculate available tokens as maxTokens minus reserved', async () => {
      config.tokenLimit = '10000';
      config.responseTokens = '500';

      const result = await service.calculateTokenBudget('test prompt', '', 'llama3');

      const expectedAvailable = 10000 - result.totalPromptTokens - 500;
      expect(result.availableTokens).toBe(expectedAvailable);
    });

    it('should include promptTags in token count when USE_PROMPT_TAGS is "yes"', async () => {
      config.tokenLimit = '128000';
      config.responseTokens = '1000';
      process.env.USE_PROMPT_TAGS = 'yes';

      const resultWithTags = await service.calculateTokenBudget(
        'system prompt',
        'tag1, tag2, tag3, tag4, tag5',
        'llama3'
      );

      process.env.USE_PROMPT_TAGS = 'no';

      const resultWithoutTags = await service.calculateTokenBudget(
        'system prompt',
        'tag1, tag2, tag3, tag4, tag5',
        'llama3'
      );

      // With tags, more tokens are used -> fewer available
      expect(resultWithTags.totalPromptTokens).toBeGreaterThan(resultWithoutTags.totalPromptTokens);
    });

    it('should throw when token limit is too small for prompt', async () => {
      config.tokenLimit = '10';
      config.responseTokens = '5';

      await expect(
        service.calculateTokenBudget(
          'This is a prompt that should exceed the tiny token limit easily when estimated',
          '',
          'llama3'
        )
      ).rejects.toThrow('Token limit exceeded');
    });

    it('should produce consistent budget across calls with same inputs', async () => {
      config.tokenLimit = '50000';
      config.responseTokens = '800';

      const result1 = await service.calculateTokenBudget('same prompt', '', 'llama3');
      const result2 = await service.calculateTokenBudget('same prompt', '', 'llama3');

      expect(result1.totalPromptTokens).toBe(result2.totalPromptTokens);
      expect(result1.availableTokens).toBe(result2.availableTokens);
    });

    it('should use more tokens for longer prompts', async () => {
      config.tokenLimit = '128000';
      config.responseTokens = '1000';

      const shortResult = await service.calculateTokenBudget('short', '', 'llama3');
      const longResult = await service.calculateTokenBudget(
        'This is a much longer system prompt that contains many more words and tokens',
        '',
        'llama3'
      );

      expect(longResult.totalPromptTokens).toBeGreaterThan(shortResult.totalPromptTokens);
      expect(longResult.availableTokens).toBeLessThan(shortResult.availableTokens);
    });

    it('should respect responseTokens reservation in budget', async () => {
      config.tokenLimit = '10000';

      config.responseTokens = '100';
      const smallReserve = await service.calculateTokenBudget('test', '', 'llama3');

      config.responseTokens = '5000';
      const largeReserve = await service.calculateTokenBudget('test', '', 'llama3');

      // Same prompt tokens but different available tokens due to responseTokens
      expect(smallReserve.totalPromptTokens).toBe(largeReserve.totalPromptTokens);
      expect(smallReserve.availableTokens).toBeGreaterThan(largeReserve.availableTokens);
      expect(smallReserve.availableTokens - largeReserve.availableTokens).toBe(4900); // 5000 - 100
    });
  });

  // =========================================================================
  // buildErrorResult
  // =========================================================================
  describe('buildErrorResult', () => {
    it('should return standard error shape with the given message', () => {
      const result = service.buildErrorResult('Something went wrong');

      expect(result).toEqual({
        document: { tags: [], correspondent: null },
        metrics: null,
        error: 'Something went wrong',
      });
    });

    it('should have empty tags array in document', () => {
      const result = service.buildErrorResult('err');
      expect(result.document.tags).toEqual([]);
    });

    it('should have null correspondent in document', () => {
      const result = service.buildErrorResult('err');
      expect(result.document.correspondent).toBeNull();
    });

    it('should have null metrics', () => {
      const result = service.buildErrorResult('err');
      expect(result.metrics).toBeNull();
    });
  });

  // =========================================================================
  // buildSuccessResult
  // =========================================================================
  describe('buildSuccessResult', () => {
    it('should return standard success shape', () => {
      const metrics = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
      const result = service.buildSuccessResult(sampleAIResponse, metrics, false);

      expect(result).toEqual({
        document: sampleAIResponse,
        metrics,
        truncated: false,
      });
    });

    it('should include the parsed response as document', () => {
      const result = service.buildSuccessResult(sampleAIResponse, null, true);
      expect(result.document).toBe(sampleAIResponse);
    });

    it('should pass through truncated flag', () => {
      const result = service.buildSuccessResult({}, null, true);
      expect(result.truncated).toBe(true);
    });

    it('should pass through metrics object', () => {
      const metrics = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };
      const result = service.buildSuccessResult({}, metrics, false);
      expect(result.metrics).toBe(metrics);
    });
  });

  // =========================================================================
  // mapOpenAIUsage
  // =========================================================================
  describe('mapOpenAIUsage', () => {
    it('should map OpenAI-style snake_case to camelCase', () => {
      const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      const result = service.mapOpenAIUsage(usage);

      expect(result).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('should handle zero values', () => {
      const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      const result = service.mapOpenAIUsage(usage);

      expect(result.promptTokens).toBe(0);
      expect(result.completionTokens).toBe(0);
      expect(result.totalTokens).toBe(0);
    });
  });

  // =========================================================================
  // mapGeminiUsage
  // =========================================================================
  describe('mapGeminiUsage', () => {
    it('should map Gemini-style usage metadata to common format', () => {
      const usage = { promptTokenCount: 200, candidatesTokenCount: 80, totalTokenCount: 280 };
      const result = service.mapGeminiUsage(usage);

      expect(result).toEqual({
        promptTokens: 200,
        completionTokens: 80,
        totalTokens: 280,
      });
    });

    it('should default to zeros when usageMetadata is undefined', () => {
      const result = service.mapGeminiUsage(undefined);

      expect(result).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    });

    it('should default to zeros when usageMetadata is null', () => {
      const result = service.mapGeminiUsage(null);

      expect(result).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    });

    it('should handle partial usage metadata (missing fields)', () => {
      const result = service.mapGeminiUsage({ promptTokenCount: 100 });

      expect(result.promptTokens).toBe(100);
      expect(result.completionTokens).toBe(0);
      expect(result.totalTokens).toBe(0);
    });
  });

  // =========================================================================
  // getPlaygroundMustHavePrompt
  // =========================================================================
  describe('getPlaygroundMustHavePrompt', () => {
    it('should return a string containing JSON template instructions', () => {
      const result = service.getPlaygroundMustHavePrompt();

      expect(typeof result).toBe('string');
      expect(result).toContain('Return the result EXCLUSIVELY as a JSON object');
      expect(result).toContain('"title"');
      expect(result).toContain('"correspondent"');
      expect(result).toContain('"tags"');
      expect(result).toContain('"document_date"');
      expect(result).toContain('"language"');
    });
  });

  // =========================================================================
  // getModel (abstract method)
  // =========================================================================
  describe('getModel', () => {
    it('should throw when not overridden by a subclass', () => {
      expect(() => service.getModel()).toThrow('getModel() must be implemented by subclass');
    });
  });

  // =========================================================================
  // createTimestamp
  // =========================================================================
  describe('createTimestamp', () => {
    it('should return a non-empty string', () => {
      const result = service.createTimestamp();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // End-to-end: parseAIResponse + validateAIResponse combined
  // =========================================================================
  describe('parseAIResponse + validateAIResponse (combined)', () => {
    it('should successfully parse and validate a markdown-wrapped response', () => {
      const parsed = service.parseAIResponse(sampleAIResponseWrappedInMarkdown);
      service.validateAIResponse(parsed);

      expect(parsed.title).toBe('Acme Corp Invoice $500');
      expect(parsed.tags).toEqual(['invoice', 'acme']);
      expect(parsed.correspondent).toBe('Acme Corp');
      expect(parsed.document_type).toBe('Invoice');
    });

    it('should fail validation on response missing tags', () => {
      const parsed = service.parseAIResponse(invalidAIResponseMissingTags);
      expect(() => service.validateAIResponse(parsed)).toThrow('Invalid response structure');
    });

    it('should fail validation on response with non-string correspondent', () => {
      const parsed = service.parseAIResponse(invalidAIResponseBadCorrespondent);
      expect(() => service.validateAIResponse(parsed)).toThrow('Invalid response structure');
    });

    it('should throw parse error on unparseable text', () => {
      expect(() => {
        const parsed = service.parseAIResponse(unparsableResponse);
        service.validateAIResponse(parsed);
      }).toThrow();
    });
  });

  // =========================================================================
  // Integration: custom fields in prompt construction
  // =========================================================================
  describe('custom fields integration with prompt construction', () => {
    it('should produce a complete prompt with custom fields embedded', () => {
      config.useExistingData = 'yes';
      process.env.SYSTEM_PROMPT = 'Analyze this document.';

      const { systemPrompt } = service.buildSystemPrompt(
        sampleExistingTags,
        sampleCorrespondents,
        sampleDocumentTypes,
        null,
        null
      );

      expect(systemPrompt).toContain('Pre-existing tags: invoice, acme, finance');
      expect(systemPrompt).toContain('Analyze this document.');
      expect(systemPrompt).toContain('Return the result EXCLUSIVELY as a JSON object');
      expect(systemPrompt).not.toContain('%CUSTOMFIELDS%');
      expect(systemPrompt).toContain('"field_name": "amount"');
      expect(systemPrompt).toContain('"field_name": "due_date"');
      expect(systemPrompt).toContain('Fill in the value based on your analysis');
    });
  });

  // =========================================================================
  // Integration: buildErrorResult / buildSuccessResult with real parsed data
  // =========================================================================
  describe('error/success result integration', () => {
    it('should produce a success result from parsed and validated AI response', () => {
      const parsed = service.parseAIResponse(sampleAIResponseWrappedInMarkdown);
      service.validateAIResponse(parsed);

      const metrics = service.mapOpenAIUsage({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      });

      const result = service.buildSuccessResult(parsed, metrics, false);

      expect(result.document.tags).toBeInstanceOf(Array);
      expect(typeof result.document.correspondent).toBe('string');
      expect(result.metrics).toHaveProperty('promptTokens');
      expect(result.metrics).toHaveProperty('completionTokens');
      expect(result.metrics).toHaveProperty('totalTokens');
      expect(result.truncated).toBe(false);
    });

    it('should produce an error result when parsing fails', () => {
      let result;
      try {
        service.parseAIResponse(unparsableResponse);
      } catch (err) {
        result = service.buildErrorResult(err.message);
      }

      expect(result.document.tags).toEqual([]);
      expect(result.document.correspondent).toBeNull();
      expect(result.metrics).toBeNull();
      expect(typeof result.error).toBe('string');
    });
  });
});
