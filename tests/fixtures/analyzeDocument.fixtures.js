/**
 * Test fixtures for AI service analyzeDocument behavior tests.
 *
 * These fixtures capture the realistic data shapes that flow through
 * the shared logic in all 5 AI services (openai, gemini, azure, custom, ollama).
 */

export const sampleDocumentContent = 'Invoice from Acme Corp for $500.00 dated 2025-01-15';

export const sampleExistingTags = ['invoice', 'acme', 'finance'];

export const sampleCorrespondents = ['Acme Corp', 'Widgets Inc'];

export const sampleDocumentTypes = ['Invoice', 'Receipt', 'Contract'];

/**
 * CUSTOM_FIELDS env var format as stored in process.env.CUSTOM_FIELDS.
 * The services parse this JSON string to build the custom fields prompt template.
 * Shape: { custom_fields: [{ value: string }, ...] }
 * Note: the field objects use `value` (not `name`) as the key for the field name.
 */
export const sampleCustomFields = JSON.stringify({
  custom_fields: [
    { value: 'amount', data_type: 'monetary' },
    { value: 'due_date', data_type: 'date' },
  ],
});

/**
 * An empty custom fields config, used when CUSTOM_FIELDS is unset or invalid.
 */
export const emptyCustomFields = JSON.stringify({
  custom_fields: [],
});

/**
 * A well-formed AI response that would pass validation in all services.
 * All services require: tags (array), correspondent (string).
 */
export const sampleAIResponse = {
  title: 'Acme Corp Invoice $500',
  tags: ['invoice', 'acme'],
  correspondent: 'Acme Corp',
  document_type: 'Invoice',
  document_date: '2025-01-15',
  language: 'en',
  custom_fields: [
    { field_name: 'amount', value: '500.00' },
    { field_name: 'due_date', value: '2025-01-15' },
  ],
};

/**
 * AI response wrapped in markdown code fences, as many LLMs return.
 * The services strip these before JSON.parse.
 */
export const sampleAIResponseWrappedInMarkdown =
  '```json\n' + JSON.stringify(sampleAIResponse, null, 2) + '\n```';

/**
 * AI response as raw JSON string (no markdown wrapping).
 */
export const sampleAIResponseRawJSON = JSON.stringify(sampleAIResponse, null, 2);

/**
 * AI response with only markdown backticks (no "json" language tag).
 */
export const sampleAIResponseWrappedInBackticks =
  '```\n' + JSON.stringify(sampleAIResponse, null, 2) + '\n```';

/**
 * Invalid AI response -- missing tags array. Should fail validation.
 */
export const invalidAIResponseMissingTags = JSON.stringify({
  title: 'Some Title',
  correspondent: 'Someone',
});

/**
 * Invalid AI response -- correspondent is not a string. Should fail validation.
 */
export const invalidAIResponseBadCorrespondent = JSON.stringify({
  title: 'Some Title',
  tags: ['tag1'],
  correspondent: 123,
});

/**
 * Completely unparseable response text.
 */
export const unparsableResponse = 'This is not JSON at all, just plain text.';

/**
 * The mustHavePrompt template from config.js, reproduced here for test assertions.
 * Contains the %CUSTOMFIELDS% placeholder that gets replaced.
 */
export const mustHavePromptTemplate = `  Return the result EXCLUSIVELY as a JSON object. The Tags, Title and Document_Type MUST be in the language that is used in the document.:
  IMPORTANT: The custom_fields are optional and can be left out if not needed, only try to fill out the values if you find a matching information in the document.
  Do not change the value of field_name, only fill out the values. If the field is about money only add the number without currency and always use a . for decimal places.
  {
    "title": "xxxxx",
    "correspondent": "xxxxxxxx",
    "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
    "document_type": "Invoice/Contract/...",
    "document_date": "YYYY-MM-DD",
    "language": "en/de/es/...",
    %CUSTOMFIELDS%
  }`;
