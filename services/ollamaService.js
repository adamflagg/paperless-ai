const { calculateTokens, writePromptToFile } = require('./serviceUtils');
const axios = require('axios');
const config = require('../config/config');
const { OLLAMA_TIMEOUT_MS, EXTERNAL_API_DATA_MAX_TOKENS } = require('../config/constants');
const os = require('os');
const BaseAIService = require('./baseAIService');
const RestrictionPromptService = require('./restrictionPromptService');

/**
 * Service for document analysis using Ollama.
 *
 * Extends BaseAIService for shared logic (thumbnail caching, custom fields,
 * external API data validation, error/success result shapes).
 * Keeps Ollama-specific logic: axios-based API calls, structured JSON schema output,
 * custom prompt building, context window calculation, and response parsing.
 */
class OllamaService extends BaseAIService {
  constructor() {
    super('ollama');
    this.apiUrl = config.ollama.apiUrl;
    this.model = config.ollama.model;
    this.client = axios.create({
      timeout: OLLAMA_TIMEOUT_MS,
    });

    // JSON schema for document analysis output
    this.documentAnalysisSchema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        correspondent: { type: 'string' },
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
        document_type: { type: 'string' },
        document_date: { type: 'string' },
        language: { type: 'string' },
        custom_fields: {
          type: 'object',
          additionalProperties: true,
        },
      },
      required: ['title', 'correspondent', 'tags', 'document_type', 'document_date', 'language'],
    };

    // Schema for playground analysis (simpler version)
    this.playgroundSchema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        correspondent: { type: 'string' },
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
        document_type: { type: 'string' },
        document_date: { type: 'string' },
        language: { type: 'string' },
      },
      required: ['title', 'correspondent', 'tags', 'document_type', 'document_date', 'language'],
    };
  }

  getModel() {
    return this.model;
  }

  async analyzeDocument(
    content,
    existingTags = [],
    existingCorrespondentList = [],
    existingDocumentTypesList = [],
    id,
    customPrompt = null,
    options = {}
  ) {
    try {
      // Truncate content if needed
      content = this._truncateContent(content);

      // Cache thumbnail (using shared base method)
      await this.cacheThumbnail(id);

      // Validate external API data (using shared base method)
      const validatedExternalApiData = await this.validateExternalApiData(options);

      // Build prompt
      let prompt;
      if (!customPrompt) {
        prompt = this._buildPrompt(
          content,
          existingTags,
          existingCorrespondentList,
          existingDocumentTypesList,
          options
        );
      } else {
        // Parse CUSTOM_FIELDS for custom prompt (using shared base method)
        const customFieldsStr = this.buildCustomFieldsTemplate();

        prompt =
          customPrompt +
          '\n\n' +
          config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr) +
          '\n\n' +
          JSON.stringify(content);
        console.log('[DEBUG] Ollama Service started with custom prompt');
      }

      // Generate custom fields for the prompt
      const customFieldsStr = this.buildCustomFieldsTemplate();

      // Generate system prompt
      const systemPrompt = this._generateSystemPrompt(customFieldsStr);

      // Calculate context window size
      const promptTokenCount = this._calculatePromptTokenCount(prompt);
      const numCtx = this._calculateNumCtx(promptTokenCount, 1024);

      this.logAnalysisDebugInfo(validatedExternalApiData);

      // Call Ollama API
      const response = await this._callOllamaAPI(
        prompt,
        systemPrompt,
        numCtx,
        this.documentAnalysisSchema
      );

      // Process response
      const parsedResponse = this._processOllamaResponse(response);

      // Check for missing data
      if (parsedResponse.tags.length === 0 && parsedResponse.correspondent === null) {
        console.warn(
          'No tags or correspondent found in response from Ollama for Document. Please review your prompt or switch to OpenAI for better results.'
        );
      }

      // Log the prompt and response
      await this._logPromptAndResponse(prompt, parsedResponse);

      // Return results in consistent format
      return this.buildSuccessResult(
        parsedResponse,
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        false
      );
    } catch (error) {
      console.error('Error analyzing document with Ollama:', error);
      return this.buildErrorResult(error.message);
    }
  }

  async analyzePlayground(content, prompt) {
    try {
      // Calculate context window size
      const promptTokenCount = await calculateTokens(prompt);
      const numCtx = this._calculateNumCtx(promptTokenCount, 1024);

      // Generate playground system prompt (simpler than full analysis)
      const systemPrompt = this._generatePlaygroundSystemPrompt();

      // Call Ollama API
      const response = await this._callOllamaAPI(
        prompt + '\n\n' + JSON.stringify(content),
        systemPrompt,
        numCtx,
        this.playgroundSchema
      );

      // Process response
      const parsedResponse = this._processOllamaResponse(response);

      // Check for missing data
      if (parsedResponse.tags.length === 0 && parsedResponse.correspondent === null) {
        console.warn(
          'No tags or correspondent found in response from Ollama for Document. Please review your prompt or switch to OpenAI for better results.'
        );
      }

      // Return results in consistent format
      return this.buildSuccessResult(
        parsedResponse,
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        false
      );
    } catch (error) {
      console.error('Error analyzing document with Ollama:', error);
      return this.buildErrorResult(error.message);
    }
  }

  async generateText(prompt) {
    try {
      // Calculate context window size based on prompt length
      const promptTokenCount = this._calculatePromptTokenCount(prompt);
      const numCtx = this._calculateNumCtx(promptTokenCount, 512);

      // Simple system prompt for text generation
      const systemPrompt = `You are a helpful assistant. Generate a clear, concise, and informative response to the user's question or request.`;

      // Call Ollama API without enforcing a specific response format
      const response = await this.client.post(`${this.apiUrl}/api/generate`, {
        model: this.model,
        prompt: prompt,
        system: systemPrompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 1024,
          num_ctx: numCtx,
        },
      });

      if (!response.data || !response.data.response) {
        throw new Error('Invalid response from Ollama API');
      }

      return response.data.response;
    } catch (error) {
      console.error('Error generating text with Ollama:', error);
      throw error;
    }
  }

  async checkStatus() {
    // use ollama status endpoint
    try {
      const response = await this.client.get(`${this.apiUrl}/api/ps`);
      if (response.status === 200) {
        const data = response.data;
        // Ensure data is an array and has at least one model
        let modelName = null;
        if (Array.isArray(data.models) && data.models.length > 0) {
          modelName = data.models[0].name;
        }
        console.log('Ollama model name:', modelName);
        return { status: 'ok', model: modelName };
      }
    } catch (error) {
      console.error('Error checking Ollama service status:', error);
    }
    return { status: 'error' };
  }

  // ---------------------------------------------------------------------------
  // Ollama-specific private methods
  // ---------------------------------------------------------------------------

  /**
   * Truncate content to maximum length if specified
   * @param {string} content
   * @returns {string}
   */
  _truncateContent(content) {
    try {
      if (process.env.CONTENT_MAX_LENGTH) {
        console.log('Truncating content to max length:', process.env.CONTENT_MAX_LENGTH);
        return content.substring(0, process.env.CONTENT_MAX_LENGTH);
      }
    } catch (error) {
      console.error('Error truncating content:', error);
    }
    return content;
  }

  /**
   * Build prompt from content and existing data
   * @param {string} content
   * @param {Array} existingTags
   * @param {Array} existingCorrespondent
   * @param {Array} existingDocumentTypes
   * @param {object} options
   * @returns {string}
   */
  _buildPrompt(
    content,
    existingTags = [],
    existingCorrespondent = [],
    existingDocumentTypes = [],
    options = {}
  ) {
    let systemPrompt;

    const correspondentList = Array.isArray(existingCorrespondent) ? existingCorrespondent : [];

    // Build custom fields template using shared base method
    const customFieldsStr = this.buildCustomFieldsTemplate();

    // Get system prompt based on configuration
    if (
      config.useExistingData === 'yes' &&
      config.restrictToExistingTags === 'no' &&
      config.restrictToExistingCorrespondents === 'no'
    ) {
      const existingTagsList = existingTags.join(', ');

      const existingCorrespondentList = correspondentList
        .filter(Boolean)
        .map((correspondent) => {
          if (typeof correspondent === 'string') return correspondent;
          return correspondent?.name || '';
        })
        .filter((name) => name.length > 0)
        .join(', ');

      const existingDocumentTypesList = existingDocumentTypes
        .filter(Boolean)
        .map((docType) => {
          if (typeof docType === 'string') return docType;
          return docType?.name || '';
        })
        .filter((name) => name.length > 0)
        .join(', ');

      systemPrompt =
        `
            Pre-existing tags: ${existingTagsList}\n\n
            Pre-existing correspondents: ${existingCorrespondentList}\n\n
            Pre-existing document types: ${existingDocumentTypesList}\n\n
            ` +
        process.env.SYSTEM_PROMPT +
        '\n\n' +
        config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);
    } else {
      config.mustHavePrompt = config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);
      systemPrompt = process.env.SYSTEM_PROMPT + '\n\n' + config.mustHavePrompt;
    }

    // Get validated external API data if available
    let validatedExternalApiData = null;
    if (options.externalApiData) {
      try {
        validatedExternalApiData = this._validateAndTruncateExternalApiDataSync(
          options.externalApiData
        );
        console.log('[DEBUG] External API data validated and included');
      } catch (error) {
        console.warn('[WARNING] External API data validation failed:', error.message);
        validatedExternalApiData = null;
      }
    }

    // Process placeholder replacements in system prompt
    systemPrompt = RestrictionPromptService.processRestrictionsInPrompt(
      systemPrompt,
      existingTags,
      correspondentList,
      existingDocumentTypes,
      config
    );

    // Include validated external API data if available
    if (validatedExternalApiData) {
      systemPrompt += `\n\nAdditional context from external API:\n${validatedExternalApiData}`;
    }

    if (process.env.USE_PROMPT_TAGS === 'yes') {
      systemPrompt =
        `
            Take these tags and try to match one or more to the document content.\n\n
            ` + config.specialPromptPreDefinedTags;
    }

    return `${systemPrompt}
        ${JSON.stringify(content)}
        `;
  }

  /**
   * Synchronous variant of external API data validation for Ollama
   * (uses simple char-based token estimation instead of tiktoken)
   * @param {any} apiData
   * @param {number} maxTokens
   * @returns {string|null}
   */
  _validateAndTruncateExternalApiDataSync(apiData, maxTokens = EXTERNAL_API_DATA_MAX_TOKENS) {
    if (!apiData) {
      return null;
    }

    const dataString =
      typeof apiData === 'object' ? JSON.stringify(apiData, null, 2) : String(apiData);

    const dataTokens = Math.ceil(dataString.length / 4);

    if (dataTokens > maxTokens) {
      console.warn(
        `[WARNING] External API data (${dataTokens} tokens) exceeds limit (${maxTokens}), truncating`
      );
      const maxChars = maxTokens * 4;
      return dataString.substring(0, maxChars);
    }

    console.log(`[DEBUG] External API data validated: ${dataTokens} tokens`);
    return dataString;
  }

  /**
   * Generate system prompt for document analysis
   * @param {string} customFieldsStr
   * @returns {string}
   */
  _generateSystemPrompt(customFieldsStr) {
    let systemPromptTemplate = `
            You are a document analyzer. Your task is to analyze documents and extract relevant information. You do not ask back questions.
            YOU MUSTNOT: Ask for additional information or clarification, or ask questions about the document, or ask for additional context.
            YOU MUSTNOT: Return a response without the desired JSON format.
            YOU MUST: Return the result EXCLUSIVELY as a JSON object. The Tags, Title and Document_Type MUST be in the language that is used in the document.:
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
            }
            ALWAYS USE THE INFORMATION TO FILL OUT THE JSON OBJECT. DO NOT ASK BACK QUESTIONS.
        `;

    return systemPromptTemplate.replace('%CUSTOMFIELDS%', customFieldsStr);
  }

  /**
   * Generate system prompt for playground analysis
   * @returns {string}
   */
  _generatePlaygroundSystemPrompt() {
    return `
            You are a document analyzer. Your task is to analyze documents and extract relevant information. You do not ask back questions.
            YOU MUSTNOT: Ask for additional information or clarification, or ask questions about the document, or ask for additional context.
            YOU MUSTNOT: Return a response without the desired JSON format.
            YOU MUST: Analyze the document content and extract the following information into this structured JSON format and only this format!:         {
            "title": "xxxxx",
            "correspondent": "xxxxxxxx",
            "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
            "document_type": "Invoice/Contract/...",
            "document_date": "YYYY-MM-DD",
            "language": "en/de/es/..."
            }
            ALWAYS USE THE INFORMATION TO FILL OUT THE JSON OBJECT. DO NOT ASK BACK QUESTIONS.
        `;
  }

  /**
   * Calculate prompt token count (char-based estimation)
   * @param {string} prompt
   * @returns {number}
   */
  _calculatePromptTokenCount(prompt) {
    return Math.ceil(prompt.length / 4);
  }

  /**
   * Calculate context window size for Ollama
   * @param {number} promptTokenCount
   * @param {number} expectedResponseTokens
   * @returns {number}
   */
  _calculateNumCtx(promptTokenCount, expectedResponseTokens) {
    const totalTokenUsage = promptTokenCount + expectedResponseTokens;
    const maxCtxLimit = Number(config.tokenLimit);

    const numCtx = Math.min(totalTokenUsage, maxCtxLimit);

    console.log('Prompt Token Count:', promptTokenCount);
    console.log('Expected Response Tokens:', expectedResponseTokens);
    console.log('Dynamic calculated num_ctx:', numCtx);

    return numCtx;
  }

  /**
   * Get available system memory
   * @returns {Object}
   */
  async _getAvailableMemory() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const totalMemoryMB = (totalMemory / (1024 * 1024)).toFixed(0);
    const freeMemoryMB = (freeMemory / (1024 * 1024)).toFixed(0);
    return { totalMemoryMB, freeMemoryMB };
  }

  /**
   * Call Ollama API
   * @param {string} prompt
   * @param {string} systemPrompt
   * @param {number} numCtx
   * @param {Object} schema
   * @returns {Object}
   */
  async _callOllamaAPI(prompt, systemPrompt, numCtx, schema) {
    const response = await this.client.post(`${this.apiUrl}/api/generate`, {
      model: this.model,
      prompt: prompt,
      system: systemPrompt,
      stream: false,
      format: schema,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        repeat_penalty: 1.1,
        top_k: 7,
        num_predict: 256,
        num_ctx: numCtx,
      },
    });

    if (!response.data) {
      throw new Error('Invalid response from Ollama API');
    }

    return response.data;
  }

  /**
   * Process Ollama API response
   * @param {Object} responseData
   * @returns {Object}
   */
  _processOllamaResponse(responseData) {
    if (responseData.response && typeof responseData.response === 'object') {
      console.log('Using structured output response');
      return {
        tags: Array.isArray(responseData.response.tags) ? responseData.response.tags : [],
        correspondent: responseData.response.correspondent || null,
        title: responseData.response.title || null,
        document_date: responseData.response.document_date || null,
        document_type: responseData.response.document_type || null,
        language: responseData.response.language || null,
        custom_fields: responseData.response.custom_fields || null,
      };
    } else if (responseData.response) {
      console.log('Falling back to text response parsing');
      return this._parseResponse(responseData.response);
    } else {
      throw new Error('No response data from Ollama API');
    }
  }

  /**
   * Parse text response to extract JSON
   * @param {string} response
   * @returns {Object}
   */
  _parseResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { tags: [], correspondent: null };
      }

      let jsonStr = jsonMatch[0];
      console.log('Extracted JSON String:', jsonStr);

      try {
        const result = JSON.parse(jsonStr);
        return {
          tags: Array.isArray(result.tags) ? result.tags : [],
          correspondent: result.correspondent || null,
          title: result.title || null,
          document_date: result.document_date || null,
          document_type: result.document_type || null,
          language: result.language || null,
          custom_fields: result.custom_fields || null,
        };
      } catch (_jsonError) {
        console.warn('Error parsing JSON from response:', _jsonError.message);
        console.warn('Attempting to sanitize the JSON...');

        jsonStr = this._sanitizeJsonString(jsonStr);

        try {
          const sanitizedResult = JSON.parse(jsonStr);
          return {
            tags: Array.isArray(sanitizedResult.tags) ? sanitizedResult.tags : [],
            correspondent: sanitizedResult.correspondent || null,
            title: sanitizedResult.title || null,
            document_date: sanitizedResult.document_date || null,
            language: sanitizedResult.language || null,
          };
        } catch (_finalError) {
          console.error(
            'Final JSON parsing failed after sanitization. This happens when the JSON structure is too complex or invalid. That indicates an issue with the generated JSON string by Ollama. Switch to OpenAI for better results or fine tune your prompt.'
          );
          return { tags: [], correspondent: null };
        }
      }
    } catch (error) {
      console.error('Error parsing Ollama response:', error.message);
      return { tags: [], correspondent: null };
    }
  }

  /**
   * Sanitize a JSON string
   * @param {string} jsonStr
   * @returns {string}
   */
  _sanitizeJsonString(jsonStr) {
    return jsonStr
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
  }

  /**
   * Log prompt and response to file
   * @param {string} prompt
   * @param {Object} response
   */
  async _logPromptAndResponse(prompt, response) {
    const content =
      '================================================================================' +
      prompt +
      '\n\n' +
      JSON.stringify(response) +
      '\n\n' +
      '================================================================================\n\n';

    await writePromptToFile(content);
  }
}

module.exports = new OllamaService();
