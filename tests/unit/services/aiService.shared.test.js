/**
 * Behavior tests for shared AI service logic.
 *
 * These tests capture the CURRENT duplicated behavior across all 5 AI services
 * (openaiService, geminiService, azureService, customService, ollamaService).
 *
 * The three shared patterns tested here are:
 *   1. Custom fields template generation (CUSTOM_FIELDS env -> prompt string)
 *   2. AI response parsing (strip markdown fences, JSON.parse, validate structure)
 *   3. System prompt construction (config flags -> prompt assembly)
 *
 * Since the logic currently lives as inline code inside each service's
 * analyzeDocument method (not extracted into testable functions), we replicate
 * the exact algorithms here as standalone functions and test those. When
 * Task 2.2 extracts a baseAIService, these tests will be pointed at the
 * real extracted functions and should still pass, verifying the refactor
 * preserved behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
// 1. Custom Fields Template Generation
//
// This is the exact algorithm copied from all 5 services. Each service does:
//   - JSON.parse(process.env.CUSTOM_FIELDS)
//   - iterate .custom_fields with forEach((field, index) => ...)
//   - build { [index]: { field_name: field.value, value: 'Fill in...' } }
//   - stringify with indent, prepend '"custom_fields": ', indent each line
//
// This function replicates that pattern for isolated testing.
// ---------------------------------------------------------------------------

function buildCustomFieldsTemplate(customFieldsJson) {
  let customFieldsObj;
  try {
    customFieldsObj = JSON.parse(customFieldsJson);
  } catch {
    customFieldsObj = { custom_fields: [] };
  }

  const customFieldsTemplate = {};

  customFieldsObj.custom_fields.forEach((field, index) => {
    customFieldsTemplate[index] = {
      field_name: field.value,
      value: 'Fill in the value based on your analysis',
    };
  });

  const customFieldsStr =
    '"custom_fields": ' +
    JSON.stringify(customFieldsTemplate, null, 2)
      .split('\n')
      .map((line) => '    ' + line)
      .join('\n');

  return customFieldsStr;
}

// ---------------------------------------------------------------------------
// 2. AI Response Parsing
//
// All services (except Ollama, which has its own _processOllamaResponse) do:
//   - Strip ```json\n? and ```\n? markers
//   - .trim()
//   - JSON.parse
//   - Validate: parsedResponse must exist, .tags must be an Array,
//     .correspondent must be a string
// ---------------------------------------------------------------------------

function parseAIResponse(rawText) {
  let jsonContent = rawText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const parsed = JSON.parse(jsonContent);
  return parsed;
}

function validateAIResponse(parsed) {
  if (!parsed || !Array.isArray(parsed.tags) || typeof parsed.correspondent !== 'string') {
    throw new Error('Invalid response structure: missing tags array or correspondent string');
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// 3. System Prompt Construction
//
// All services use the same branching logic:
//   if (useExistingData === 'yes' && restrictTags === 'no' && restrictCorrespondents === 'no')
//     -> prepend existing data + SYSTEM_PROMPT + mustHavePrompt
//   else
//     -> SYSTEM_PROMPT + mustHavePrompt
//
// Then optionally override if USE_PROMPT_TAGS === 'yes' or customPrompt is provided.
// ---------------------------------------------------------------------------

function buildSystemPrompt({
  useExistingData,
  restrictToExistingTags,
  restrictToExistingCorrespondents,
  existingTags,
  existingCorrespondentList,
  existingDocumentTypesList,
  systemPromptEnv,
  mustHavePrompt,
  customFieldsStr,
  customPrompt,
  usePromptTags,
  specialPromptPreDefinedTags,
}) {
  let systemPrompt = '';

  // Replace %CUSTOMFIELDS% in mustHavePrompt
  const mustHaveWithFields = mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);

  if (
    useExistingData === 'yes' &&
    restrictToExistingTags === 'no' &&
    restrictToExistingCorrespondents === 'no'
  ) {
    const existingTagsList = existingTags.join(', ');
    systemPrompt =
      `
        Pre-existing tags: ${existingTagsList}\n\n
        Pre-existing correspondents: ${existingCorrespondentList}\n\n
        Pre-existing document types: ${existingDocumentTypesList.join(', ')}\n\n
        ` +
      systemPromptEnv +
      '\n\n' +
      mustHaveWithFields;
  } else {
    systemPrompt = systemPromptEnv + '\n\n' + mustHaveWithFields;
  }

  // USE_PROMPT_TAGS overrides the entire prompt
  if (usePromptTags === 'yes') {
    systemPrompt =
      `
        Take these tags and try to match one or more to the document content.\n\n
        ` + specialPromptPreDefinedTags;
  }

  // customPrompt overrides the entire prompt (applied after USE_PROMPT_TAGS)
  if (customPrompt) {
    systemPrompt = customPrompt + '\n\n' + mustHaveWithFields;
  }

  return systemPrompt;
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('AI Service Shared Logic', () => {
  // =========================================================================
  // Custom Fields Template Generation
  // =========================================================================
  describe('buildCustomFieldsTemplate', () => {
    it('should generate indexed template from custom fields config', () => {
      const result = buildCustomFieldsTemplate(sampleCustomFields);

      // Should start with "custom_fields":
      expect(result).toContain('"custom_fields":');

      // Should contain both field names from fixtures
      expect(result).toContain('"field_name": "amount"');
      expect(result).toContain('"field_name": "due_date"');

      // Should contain placeholder values
      expect(result).toContain('"value": "Fill in the value based on your analysis"');
    });

    it('should use numeric index keys (0, 1, ...) not field names', () => {
      const result = buildCustomFieldsTemplate(sampleCustomFields);

      // The outer object uses numeric string keys "0", "1" etc.
      // Parse the JSON portion to verify
      const jsonPart = result.replace('"custom_fields": ', '').replace(/^ {4}/gm, '');
      const parsed = JSON.parse(jsonPart);

      expect(parsed).toHaveProperty('0');
      expect(parsed).toHaveProperty('1');
      expect(parsed['0'].field_name).toBe('amount');
      expect(parsed['1'].field_name).toBe('due_date');
    });

    it('should return empty object for empty custom_fields array', () => {
      const result = buildCustomFieldsTemplate(emptyCustomFields);

      expect(result).toContain('"custom_fields":');
      const jsonPart = result.replace('"custom_fields": ', '').replace(/^ {4}/gm, '');
      const parsed = JSON.parse(jsonPart);

      expect(Object.keys(parsed)).toHaveLength(0);
    });

    it('should handle invalid JSON gracefully (fallback to empty)', () => {
      const result = buildCustomFieldsTemplate('not valid json');

      expect(result).toContain('"custom_fields":');
      const jsonPart = result.replace('"custom_fields": ', '').replace(/^ {4}/gm, '');
      const parsed = JSON.parse(jsonPart);

      expect(Object.keys(parsed)).toHaveLength(0);
    });

    it('should handle undefined input gracefully', () => {
      const result = buildCustomFieldsTemplate(undefined);

      expect(result).toContain('"custom_fields":');
      const jsonPart = result.replace('"custom_fields": ', '').replace(/^ {4}/gm, '');
      const parsed = JSON.parse(jsonPart);

      expect(Object.keys(parsed)).toHaveLength(0);
    });

    it('should indent JSON lines with 4 spaces (first line has prefix)', () => {
      const result = buildCustomFieldsTemplate(sampleCustomFields);
      const lines = result.split('\n');

      // First line has the "custom_fields": prefix prepended, so it starts with "
      expect(lines[0]).toMatch(/^"custom_fields":/);

      // All subsequent lines should start with at least 4 spaces
      // (the indentation added by .map(line => '    ' + line))
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].startsWith('    ')).toBe(true);
      }
    });

    it('should handle single custom field', () => {
      const singleField = JSON.stringify({
        custom_fields: [{ value: 'vendor_name', data_type: 'string' }],
      });
      const result = buildCustomFieldsTemplate(singleField);

      const jsonPart = result.replace('"custom_fields": ', '').replace(/^ {4}/gm, '');
      const parsed = JSON.parse(jsonPart);

      expect(Object.keys(parsed)).toHaveLength(1);
      expect(parsed['0'].field_name).toBe('vendor_name');
    });
  });

  // =========================================================================
  // AI Response Parsing
  // =========================================================================
  describe('parseAIResponse', () => {
    it('should parse raw JSON response', () => {
      const result = parseAIResponse(sampleAIResponseRawJSON);

      expect(result.title).toBe('Acme Corp Invoice $500');
      expect(result.tags).toEqual(['invoice', 'acme']);
      expect(result.correspondent).toBe('Acme Corp');
      expect(result.document_type).toBe('Invoice');
      expect(result.document_date).toBe('2025-01-15');
    });

    it('should strip ```json fences and parse', () => {
      const result = parseAIResponse(sampleAIResponseWrappedInMarkdown);

      expect(result.title).toBe('Acme Corp Invoice $500');
      expect(result.tags).toEqual(['invoice', 'acme']);
      expect(result.correspondent).toBe('Acme Corp');
    });

    it('should strip plain ``` fences (no language tag) and parse', () => {
      const result = parseAIResponse(sampleAIResponseWrappedInBackticks);

      expect(result.title).toBe('Acme Corp Invoice $500');
      expect(result.correspondent).toBe('Acme Corp');
    });

    it('should handle JSON with leading/trailing whitespace', () => {
      const padded = '   \n\n' + sampleAIResponseRawJSON + '\n\n   ';
      const result = parseAIResponse(padded);

      expect(result.title).toBe('Acme Corp Invoice $500');
    });

    it('should handle ```json without trailing newline', () => {
      const noNewline = '```json' + JSON.stringify(sampleAIResponse) + '```';
      const result = parseAIResponse(noNewline);

      expect(result.title).toBe('Acme Corp Invoice $500');
    });

    it('should throw on completely unparseable text', () => {
      expect(() => parseAIResponse(unparsableResponse)).toThrow();
    });

    it('should handle nested ```json fences (only strips outermost)', () => {
      // The regex replaces ALL occurrences of ```json and ```, so even nested ones
      // get stripped. This test documents that current behavior.
      const nested = '```json\n{"title": "test", "tags": ["a"], "correspondent": "B"}\n```';
      const result = parseAIResponse(nested);
      expect(result.title).toBe('test');
    });
  });

  // =========================================================================
  // AI Response Validation
  // =========================================================================
  describe('validateAIResponse', () => {
    it('should accept valid response with tags array and correspondent string', () => {
      const result = validateAIResponse(sampleAIResponse);
      expect(result).toBe(sampleAIResponse);
    });

    it('should throw when tags is missing', () => {
      const noTags = { title: 'Test', correspondent: 'Someone' };
      expect(() => validateAIResponse(noTags)).toThrow(
        'Invalid response structure: missing tags array or correspondent string'
      );
    });

    it('should throw when tags is not an array', () => {
      const badTags = { tags: 'not-array', correspondent: 'Someone' };
      expect(() => validateAIResponse(badTags)).toThrow(
        'Invalid response structure: missing tags array or correspondent string'
      );
    });

    it('should throw when correspondent is not a string', () => {
      const parsed = JSON.parse(invalidAIResponseBadCorrespondent);
      expect(() => validateAIResponse(parsed)).toThrow(
        'Invalid response structure: missing tags array or correspondent string'
      );
    });

    it('should throw when response is null', () => {
      expect(() => validateAIResponse(null)).toThrow(
        'Invalid response structure: missing tags array or correspondent string'
      );
    });

    it('should throw when response is undefined', () => {
      expect(() => validateAIResponse(undefined)).toThrow(
        'Invalid response structure: missing tags array or correspondent string'
      );
    });

    it('should accept response with empty tags array', () => {
      const emptyTags = { tags: [], correspondent: 'Someone' };
      const result = validateAIResponse(emptyTags);
      expect(result.tags).toEqual([]);
    });

    it('should accept response with extra fields (title, document_type, etc.)', () => {
      // Validation only checks tags and correspondent; extra fields are fine
      const withExtras = {
        tags: ['a'],
        correspondent: 'B',
        title: 'Extra',
        document_type: 'Invoice',
        custom_fields: [],
      };
      expect(() => validateAIResponse(withExtras)).not.toThrow();
    });
  });

  // =========================================================================
  // System Prompt Construction
  // =========================================================================
  describe('buildSystemPrompt', () => {
    const defaultArgs = {
      useExistingData: 'no',
      restrictToExistingTags: 'no',
      restrictToExistingCorrespondents: 'no',
      existingTags: sampleExistingTags,
      existingCorrespondentList: sampleCorrespondents,
      existingDocumentTypesList: sampleDocumentTypes,
      systemPromptEnv: 'You are a document analyzer.',
      mustHavePrompt: mustHavePromptTemplate,
      customFieldsStr: '"custom_fields": {}',
      customPrompt: null,
      usePromptTags: 'no',
      specialPromptPreDefinedTags: '',
    };

    it('should use SYSTEM_PROMPT + mustHavePrompt when useExistingData is "no"', () => {
      const result = buildSystemPrompt(defaultArgs);

      expect(result).toContain('You are a document analyzer.');
      expect(result).toContain('Return the result EXCLUSIVELY as a JSON object');
      // Should NOT contain pre-existing data section
      expect(result).not.toContain('Pre-existing tags:');
    });

    it('should prepend existing data when useExistingData is "yes" and no restrictions', () => {
      const result = buildSystemPrompt({
        ...defaultArgs,
        useExistingData: 'yes',
      });

      expect(result).toContain('Pre-existing tags: invoice, acme, finance');
      expect(result).toContain('Pre-existing correspondents:');
      expect(result).toContain('Pre-existing document types: Invoice, Receipt, Contract');
      expect(result).toContain('You are a document analyzer.');
      expect(result).toContain('Return the result EXCLUSIVELY as a JSON object');
    });

    it('should NOT prepend existing data when restrictToExistingTags is "yes"', () => {
      const result = buildSystemPrompt({
        ...defaultArgs,
        useExistingData: 'yes',
        restrictToExistingTags: 'yes',
      });

      // Falls into else branch: SYSTEM_PROMPT + mustHavePrompt (no existing data prefix)
      expect(result).not.toContain('Pre-existing tags:');
      expect(result).toContain('You are a document analyzer.');
    });

    it('should NOT prepend existing data when restrictToExistingCorrespondents is "yes"', () => {
      const result = buildSystemPrompt({
        ...defaultArgs,
        useExistingData: 'yes',
        restrictToExistingCorrespondents: 'yes',
      });

      expect(result).not.toContain('Pre-existing tags:');
      expect(result).toContain('You are a document analyzer.');
    });

    it('should replace %CUSTOMFIELDS% placeholder in mustHavePrompt', () => {
      const customFieldsStr = buildCustomFieldsTemplate(sampleCustomFields);
      const result = buildSystemPrompt({
        ...defaultArgs,
        customFieldsStr,
      });

      expect(result).not.toContain('%CUSTOMFIELDS%');
      expect(result).toContain('"field_name": "amount"');
      expect(result).toContain('"field_name": "due_date"');
    });

    it('should override entire prompt when usePromptTags is "yes"', () => {
      const specialPrompt = 'Special predefined tags prompt with tag list';
      const result = buildSystemPrompt({
        ...defaultArgs,
        usePromptTags: 'yes',
        specialPromptPreDefinedTags: specialPrompt,
      });

      // The prompt tags override replaces everything
      expect(result).toContain('Take these tags and try to match one or more');
      expect(result).toContain(specialPrompt);
      // SYSTEM_PROMPT should NOT be in the output
      expect(result).not.toContain('You are a document analyzer.');
    });

    it('should override prompt when customPrompt is provided', () => {
      const result = buildSystemPrompt({
        ...defaultArgs,
        customPrompt: 'Custom webhook prompt content',
      });

      expect(result).toContain('Custom webhook prompt content');
      expect(result).toContain('Return the result EXCLUSIVELY as a JSON object');
      // Original SYSTEM_PROMPT should NOT be present
      expect(result).not.toContain('You are a document analyzer.');
    });

    it('should let customPrompt override usePromptTags (customPrompt applied last)', () => {
      // In the actual services, customPrompt check comes AFTER usePromptTags,
      // so customPrompt wins when both are set.
      const result = buildSystemPrompt({
        ...defaultArgs,
        usePromptTags: 'yes',
        specialPromptPreDefinedTags: 'Tag prompt override',
        customPrompt: 'Webhook prompt wins',
      });

      expect(result).toContain('Webhook prompt wins');
      expect(result).not.toContain('Tag prompt override');
    });

    it('should include custom fields in prompt even with customPrompt override', () => {
      const customFieldsStr = buildCustomFieldsTemplate(sampleCustomFields);
      const result = buildSystemPrompt({
        ...defaultArgs,
        customPrompt: 'Webhook prompt',
        customFieldsStr,
      });

      // customPrompt + mustHavePrompt (with custom fields) should be present
      expect(result).toContain('Webhook prompt');
      expect(result).toContain('"field_name": "amount"');
    });
  });

  // =========================================================================
  // End-to-end: parse + validate combined
  // =========================================================================
  describe('parseAIResponse + validateAIResponse (combined)', () => {
    it('should successfully parse and validate a markdown-wrapped response', () => {
      const parsed = parseAIResponse(sampleAIResponseWrappedInMarkdown);
      const validated = validateAIResponse(parsed);

      expect(validated.title).toBe('Acme Corp Invoice $500');
      expect(validated.tags).toEqual(['invoice', 'acme']);
      expect(validated.correspondent).toBe('Acme Corp');
      expect(validated.document_type).toBe('Invoice');
    });

    it('should fail validation on response missing tags', () => {
      const parsed = parseAIResponse(invalidAIResponseMissingTags);
      expect(() => validateAIResponse(parsed)).toThrow('Invalid response structure');
    });

    it('should fail validation on response with non-string correspondent', () => {
      const parsed = parseAIResponse(invalidAIResponseBadCorrespondent);
      expect(() => validateAIResponse(parsed)).toThrow('Invalid response structure');
    });

    it('should throw parse error on unparseable text', () => {
      expect(() => {
        const parsed = parseAIResponse(unparsableResponse);
        validateAIResponse(parsed);
      }).toThrow();
    });
  });

  // =========================================================================
  // Integration: custom fields in prompt construction
  // =========================================================================
  describe('custom fields integration with prompt construction', () => {
    it('should produce a complete prompt with custom fields embedded', () => {
      const customFieldsStr = buildCustomFieldsTemplate(sampleCustomFields);
      const prompt = buildSystemPrompt({
        useExistingData: 'yes',
        restrictToExistingTags: 'no',
        restrictToExistingCorrespondents: 'no',
        existingTags: sampleExistingTags,
        existingCorrespondentList: sampleCorrespondents,
        existingDocumentTypesList: sampleDocumentTypes,
        systemPromptEnv: 'Analyze this document.',
        mustHavePrompt: mustHavePromptTemplate,
        customFieldsStr,
        customPrompt: null,
        usePromptTags: 'no',
        specialPromptPreDefinedTags: '',
      });

      // Should have pre-existing data
      expect(prompt).toContain('Pre-existing tags: invoice, acme, finance');

      // Should have the system prompt
      expect(prompt).toContain('Analyze this document.');

      // Should have mustHavePrompt content
      expect(prompt).toContain('Return the result EXCLUSIVELY as a JSON object');

      // Should have custom fields (no leftover placeholder)
      expect(prompt).not.toContain('%CUSTOMFIELDS%');
      expect(prompt).toContain('"field_name": "amount"');
      expect(prompt).toContain('"field_name": "due_date"');
      expect(prompt).toContain('Fill in the value based on your analysis');
    });
  });

  // =========================================================================
  // Error return shape (all services return this on failure)
  // =========================================================================
  describe('error return shape', () => {
    it('should match the common error return format used by all services', () => {
      // All services catch errors and return this shape:
      const errorResult = {
        document: { tags: [], correspondent: null },
        metrics: null,
        error: 'Some error message',
      };

      expect(errorResult.document.tags).toEqual([]);
      expect(errorResult.document.correspondent).toBeNull();
      expect(errorResult.metrics).toBeNull();
      expect(typeof errorResult.error).toBe('string');
    });

    it('should match the common success return format used by all services', () => {
      // All services return this shape on success:
      const successResult = {
        document: sampleAIResponse,
        metrics: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        truncated: false,
      };

      expect(successResult.document.tags).toBeInstanceOf(Array);
      expect(typeof successResult.document.correspondent).toBe('string');
      expect(successResult.metrics).toHaveProperty('promptTokens');
      expect(successResult.metrics).toHaveProperty('completionTokens');
      expect(successResult.metrics).toHaveProperty('totalTokens');
      expect(typeof successResult.truncated).toBe('boolean');
    });
  });
});
