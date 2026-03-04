const {
  calculateTokens,
  calculateTotalPromptTokens,
  truncateToTokenLimit,
  writePromptToFile,
} = require('./serviceUtils');
const config = require('../config/config');
const { EXTERNAL_API_DATA_MAX_TOKENS } = require('../config/constants');
const paperlessService = require('./paperlessService');
const fs = require('fs').promises;
const path = require('path');
const RestrictionPromptService = require('./restrictionPromptService');

/**
 * Base class for all AI services.
 *
 * Extracts the shared logic that was duplicated across openaiService,
 * geminiService, azureService, customService, and ollamaService:
 *   - Thumbnail caching
 *   - Custom fields template generation
 *   - System prompt construction
 *   - Token budget calculation
 *   - Response JSON parsing and validation
 *   - External API data validation
 *   - Playground must-have prompt
 *   - Prompt file writing
 *
 * Subclasses must implement:
 *   - initialize()
 *   - getModel() — returns the model identifier string
 *   - analyzeDocument()
 *   - analyzePlayground()
 *   - generateText()
 *   - checkStatus()
 */
class BaseAIService {
  constructor(providerName) {
    this.providerName = providerName;
    this.client = null;
  }

  // ---------------------------------------------------------------------------
  // Thumbnail caching
  // ---------------------------------------------------------------------------

  /**
   * Ensure thumbnail is cached on disk for the given document ID.
   * Identical logic was present in all 5 services.
   * @param {string|number} documentId
   */
  async cacheThumbnail(documentId) {
    if (!documentId) return;

    const cachePath = path.join('./public/images', `${documentId}.png`);
    try {
      await fs.access(cachePath);
      console.log('[DEBUG] Thumbnail already cached');
    } catch (_err) {
      console.log('Thumbnail not cached, fetching from Paperless');

      const thumbnailData = await paperlessService.getThumbnailImage(documentId);

      if (!thumbnailData) {
        console.warn('Thumbnail nicht gefunden');
        return;
      }

      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, thumbnailData);
    }
  }

  // ---------------------------------------------------------------------------
  // Custom fields template generation
  // ---------------------------------------------------------------------------

  /**
   * Parse CUSTOM_FIELDS env var and build the template string for the prompt.
   * Identical logic was present in all 5 services.
   * @returns {string} e.g. '"custom_fields": { "0": { "field_name": "amount", ... } }'
   */
  buildCustomFieldsTemplate() {
    let customFieldsObj;
    try {
      customFieldsObj = JSON.parse(process.env.CUSTOM_FIELDS);
    } catch (_error) {
      console.error('Failed to parse CUSTOM_FIELDS:', _error);
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
  // System prompt construction
  // ---------------------------------------------------------------------------

  /**
   * Build the full system prompt from config flags, existing data, and custom fields.
   * Identical branching logic was present in all 5 services (openai/gemini/azure/custom).
   *
   * @param {Array} existingTags
   * @param {Array} existingCorrespondentList
   * @param {Array} existingDocumentTypesList
   * @param {string|null} customPrompt
   * @param {string|null} validatedExternalApiData
   * @returns {{ systemPrompt: string, promptTags: string }}
   */
  buildSystemPrompt(
    existingTags,
    existingCorrespondentList,
    existingDocumentTypesList,
    customPrompt,
    validatedExternalApiData
  ) {
    const customFieldsStr = this.buildCustomFieldsTemplate();

    let existingTagsList = existingTags.join(', ');
    let systemPrompt = '';
    let promptTags = '';

    if (
      config.useExistingData === 'yes' &&
      config.restrictToExistingTags === 'no' &&
      config.restrictToExistingCorrespondents === 'no'
    ) {
      systemPrompt =
        `
        Pre-existing tags: ${existingTagsList}\n\n
        Pre-existing correspondents: ${existingCorrespondentList}\n\n
        Pre-existing document types: ${existingDocumentTypesList.join(', ')}\n\n
        ` +
        process.env.SYSTEM_PROMPT +
        '\n\n' +
        config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);
      promptTags = '';
    } else {
      config.mustHavePrompt = config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);
      systemPrompt = process.env.SYSTEM_PROMPT + '\n\n' + config.mustHavePrompt;
      promptTags = '';
    }

    // Process placeholder replacements in system prompt
    systemPrompt = RestrictionPromptService.processRestrictionsInPrompt(
      systemPrompt,
      existingTags,
      existingCorrespondentList,
      config
    );

    // Include validated external API data if available
    if (validatedExternalApiData) {
      systemPrompt += `\n\nAdditional context from external API:\n${validatedExternalApiData}`;
    }

    if (process.env.USE_PROMPT_TAGS === 'yes') {
      promptTags = process.env.PROMPT_TAGS;
      systemPrompt =
        `
        Take these tags and try to match one or more to the document content.\n\n
        ` + config.specialPromptPreDefinedTags;
    }

    if (customPrompt) {
      console.log('[DEBUG] Replace system prompt with custom prompt');
      systemPrompt = customPrompt + '\n\n' + config.mustHavePrompt;
    }

    return { systemPrompt, promptTags };
  }

  // ---------------------------------------------------------------------------
  // Token budget calculation
  // ---------------------------------------------------------------------------

  /**
   * Calculate available tokens for content given the system prompt and model.
   * Identical logic was present in openai/gemini/azure/custom services.
   *
   * @param {string} systemPrompt
   * @param {string} promptTags
   * @param {string} model
   * @returns {Promise<{ totalPromptTokens: number, availableTokens: number }>}
   */
  async calculateTokenBudget(systemPrompt, promptTags, model) {
    const totalPromptTokens = await calculateTotalPromptTokens(
      systemPrompt,
      process.env.USE_PROMPT_TAGS === 'yes' ? [promptTags] : [],
      model
    );

    const maxTokens = Number(config.tokenLimit);
    const reservedTokens = totalPromptTokens + Number(config.responseTokens);
    const availableTokens = maxTokens - reservedTokens;

    if (availableTokens <= 0) {
      console.warn(
        `[WARNING] No available tokens for content. Reserved: ${reservedTokens}, Max: ${maxTokens}`
      );
      throw new Error('Token limit exceeded: prompt too large for available token limit');
    }

    console.log(
      `[DEBUG] Token calculation - Prompt: ${totalPromptTokens}, Reserved: ${reservedTokens}, Available: ${availableTokens}`
    );

    return { totalPromptTokens, availableTokens };
  }

  /**
   * Truncate content to fit within the available token budget.
   * @param {string} content
   * @param {number} availableTokens
   * @param {string} model
   * @returns {Promise<string>}
   */
  async truncateContent(content, availableTokens, model) {
    return truncateToTokenLimit(content, availableTokens, model);
  }

  /**
   * Write the system prompt and truncated content to the log file.
   * @param {string} systemPrompt
   * @param {string} truncatedContent
   */
  async writePromptLog(systemPrompt, truncatedContent) {
    await writePromptToFile(systemPrompt, truncatedContent);
  }

  // ---------------------------------------------------------------------------
  // Response JSON parsing and validation
  // ---------------------------------------------------------------------------

  /**
   * Parse raw AI response text: strip markdown fences, parse JSON.
   * Identical logic in openai/gemini/azure/custom services.
   *
   * @param {string} rawText
   * @returns {object} Parsed JSON object
   * @throws {Error} If JSON parsing fails
   */
  parseAIResponse(rawText) {
    let jsonContent = rawText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(jsonContent);
      // Append to response log (fire-and-forget)
      fs.appendFile('./logs/response.txt', jsonContent, (_err) => {
        if (_err) console.error('[ERROR] Failed to append to response log:', _err);
      });
    } catch (_error) {
      console.error('Failed to parse JSON response:', _error);
      throw new Error('Invalid JSON response from API');
    }

    return parsedResponse;
  }

  /**
   * Validate parsed AI response structure.
   * All services require tags (Array) and correspondent (string).
   *
   * @param {object} parsed
   * @throws {Error} If validation fails
   */
  validateAIResponse(parsed) {
    if (!parsed || !Array.isArray(parsed.tags) || typeof parsed.correspondent !== 'string') {
      throw new Error('Invalid response structure: missing tags array or correspondent string');
    }
  }

  // ---------------------------------------------------------------------------
  // External API data validation
  // ---------------------------------------------------------------------------

  /**
   * Validate and truncate external API data to prevent token overflow.
   * Identical in openai/gemini/azure/custom (ollama uses a simpler char-based variant).
   *
   * @param {any} apiData
   * @param {number} maxTokens - Maximum tokens allowed (default EXTERNAL_API_DATA_MAX_TOKENS)
   * @param {string} model - Model name for token calculation
   * @returns {Promise<string|null>}
   */
  async _validateAndTruncateExternalApiData(
    apiData,
    maxTokens = EXTERNAL_API_DATA_MAX_TOKENS,
    model = undefined
  ) {
    if (!apiData) {
      return null;
    }

    const resolvedModel = model || this.getModel();

    const dataString =
      typeof apiData === 'object' ? JSON.stringify(apiData, null, 2) : String(apiData);

    const dataTokens = await calculateTokens(dataString, resolvedModel);

    if (dataTokens > maxTokens) {
      console.warn(
        `[WARNING] External API data (${dataTokens} tokens) exceeds limit (${maxTokens}), truncating`
      );
      return await truncateToTokenLimit(dataString, maxTokens, resolvedModel);
    }

    console.log(`[DEBUG] External API data validated: ${dataTokens} tokens`);
    return dataString;
  }

  /**
   * Validate and extract external API data from options, with error handling.
   * Common pattern across all services in analyzeDocument.
   *
   * @param {object} options
   * @returns {Promise<string|null>}
   */
  async validateExternalApiData(options) {
    let externalApiData = options.externalApiData || null;
    let validatedExternalApiData = null;

    if (externalApiData) {
      try {
        validatedExternalApiData = await this._validateAndTruncateExternalApiData(externalApiData);
        console.log('[DEBUG] External API data validated and included');
      } catch (error) {
        console.warn('[WARNING] External API data validation failed:', error.message);
        validatedExternalApiData = null;
      }
    }

    return validatedExternalApiData;
  }

  // ---------------------------------------------------------------------------
  // Playground must-have prompt
  // ---------------------------------------------------------------------------

  /**
   * The common "must have" prompt used by all services' analyzePlayground.
   * @returns {string}
   */
  getPlaygroundMustHavePrompt() {
    return `
    Return the result EXCLUSIVELY as a JSON object. The Tags and Title MUST be in the language that is used in the document.:
        {
          "title": "xxxxx",
          "correspondent": "xxxxxxxx",
          "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
          "document_date": "YYYY-MM-DD",
          "language": "en/de/es/..."
        }`;
  }

  /**
   * Calculate token budget for playground mode.
   * Common pattern across openai/gemini/azure/custom services.
   *
   * @param {string} prompt
   * @returns {Promise<{ totalPromptTokens: number, availableTokens: number }>}
   */
  async calculatePlaygroundTokenBudget(prompt) {
    const musthavePrompt = this.getPlaygroundMustHavePrompt();
    const totalPromptTokens = await calculateTotalPromptTokens(prompt + musthavePrompt);
    const maxTokens = Number(config.tokenLimit);
    const reservedTokens = totalPromptTokens + Number(config.responseTokens);
    const availableTokens = maxTokens - reservedTokens;

    return { totalPromptTokens, availableTokens };
  }

  // ---------------------------------------------------------------------------
  // Common logging helpers
  // ---------------------------------------------------------------------------

  /**
   * Log debug information about the analysis configuration.
   * @param {string|null} validatedExternalApiData
   */
  logAnalysisDebugInfo(validatedExternalApiData) {
    console.log(
      `[DEBUG] Use existing data: ${config.useExistingData}, Restrictions applied based on useExistingData setting`
    );
    console.log(`[DEBUG] External API data: ${validatedExternalApiData ? 'included' : 'none'}`);
  }

  /**
   * Create a timestamp string in de-DE format.
   * @returns {string}
   */
  createTimestamp() {
    const now = new Date();
    return now.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  // ---------------------------------------------------------------------------
  // OpenAI-compatible usage mapping
  // ---------------------------------------------------------------------------

  /**
   * Map OpenAI-style usage object to our common metrics format.
   * Used by openai/azure/custom services.
   *
   * @param {object} usage - { prompt_tokens, completion_tokens, total_tokens }
   * @returns {object} - { promptTokens, completionTokens, totalTokens }
   */
  mapOpenAIUsage(usage) {
    return {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    };
  }

  /**
   * Map Gemini-style usage metadata to our common metrics format.
   *
   * @param {object} usageMetadata
   * @returns {object} - { promptTokens, completionTokens, totalTokens }
   */
  mapGeminiUsage(usageMetadata) {
    const usage = usageMetadata || {};
    return {
      promptTokens: usage.promptTokenCount || 0,
      completionTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Common error/success return shapes
  // ---------------------------------------------------------------------------

  /**
   * Build the standard error return object.
   * @param {string} errorMessage
   * @returns {object}
   */
  buildErrorResult(errorMessage) {
    return {
      document: { tags: [], correspondent: null },
      metrics: null,
      error: errorMessage,
    };
  }

  /**
   * Build the standard success return object.
   * @param {object} parsedResponse
   * @param {object} metrics
   * @param {boolean} truncated
   * @returns {object}
   */
  buildSuccessResult(parsedResponse, metrics, truncated) {
    return {
      document: parsedResponse,
      metrics,
      truncated,
    };
  }

  // ---------------------------------------------------------------------------
  // Abstract methods (must be implemented by subclasses)
  // ---------------------------------------------------------------------------

  /**
   * Return the model identifier string for this provider.
   * @returns {string}
   */
  getModel() {
    throw new Error('getModel() must be implemented by subclass');
  }
}

module.exports = BaseAIService;
