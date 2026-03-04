const { truncateToTokenLimit } = require('./serviceUtils');
const OpenAI = require('openai');
const config = require('../config/config');
const BaseAIService = require('./baseAIService');

class OpenAIService extends BaseAIService {
  constructor() {
    super('openai');
  }

  getModel() {
    return process.env.OPENAI_MODEL;
  }

  initialize() {
    if (!this.client && config.aiProvider === 'ollama') {
      this.client = new OpenAI({
        baseURL: config.ollama.apiUrl + '/v1',
        apiKey: 'ollama',
      });
    } else if (!this.client && config.aiProvider === 'custom') {
      this.client = new OpenAI({
        baseURL: config.custom.apiUrl,
        apiKey: config.custom.apiKey,
      });
    } else if (!this.client && config.aiProvider === 'openai') {
      if (!this.client && config.openai.apiKey) {
        this.client = new OpenAI({
          apiKey: config.openai.apiKey,
        });
      }
    }
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
      this.initialize();
      const timestamp = this.createTimestamp();

      if (!this.client) {
        throw new Error('OpenAI client not initialized');
      }

      // Handle thumbnail caching
      await this.cacheThumbnail(id);

      // Validate external API data
      const validatedExternalApiData = await this.validateExternalApiData(options);

      const model = this.getModel();

      // Build system prompt using shared logic
      const { systemPrompt, promptTags } = this.buildSystemPrompt(
        existingTags,
        existingCorrespondentList,
        existingDocumentTypesList,
        customPrompt,
        validatedExternalApiData
      );

      // Calculate token budget
      const { availableTokens } = await this.calculateTokenBudget(systemPrompt, promptTags, model);

      this.logAnalysisDebugInfo(validatedExternalApiData);

      const truncatedContent = await this.truncateContent(content, availableTokens, model);
      await this.writePromptLog(systemPrompt, truncatedContent);

      // Provider-specific API call
      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: truncatedContent },
        ],
        ...(model !== 'o3-mini' && { temperature: 0.3 }),
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      console.debug(`[${timestamp}] OpenAI request sent`);
      console.debug(`[${timestamp}] Total tokens: ${response.usage.total_tokens}`);

      const mappedUsage = this.mapOpenAIUsage(response.usage);
      const parsedResponse = this.parseAIResponse(response.choices[0].message.content);
      this.validateAIResponse(parsedResponse);

      return this.buildSuccessResult(
        parsedResponse,
        mappedUsage,
        truncatedContent.length < content.length
      );
    } catch (error) {
      console.error('Failed to analyze document:', error);
      return this.buildErrorResult(error.message);
    }
  }

  async analyzePlayground(content, prompt) {
    const musthavePrompt = this.getPlaygroundMustHavePrompt();

    try {
      this.initialize();
      const timestamp = this.createTimestamp();

      if (!this.client) {
        throw new Error('OpenAI client not initialized - missing API key');
      }

      const { availableTokens } = await this.calculatePlaygroundTokenBudget(prompt);
      const truncatedContent = await truncateToTokenLimit(content, availableTokens);
      const model = this.getModel();

      // Provider-specific API call
      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: prompt + musthavePrompt },
          { role: 'user', content: truncatedContent },
        ],
        ...(model !== 'o3-mini' && { temperature: 0.3 }),
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      console.debug(`[${timestamp}] OpenAI request sent`);
      console.debug(`[${timestamp}] Total tokens: ${response.usage.total_tokens}`);

      const mappedUsage = this.mapOpenAIUsage(response.usage);
      const parsedResponse = this.parseAIResponse(response.choices[0].message.content);
      this.validateAIResponse(parsedResponse);

      return this.buildSuccessResult(
        parsedResponse,
        mappedUsage,
        truncatedContent.length < content.length
      );
    } catch (error) {
      console.error('Failed to analyze document:', error);
      return this.buildErrorResult(error.message);
    }
  }

  async generateText(prompt) {
    try {
      this.initialize();

      if (!this.client) {
        throw new Error('OpenAI client not initialized - missing API key');
      }

      const model = process.env.OPENAI_MODEL || config.openai.model;

      const response = await this.client.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating text with OpenAI:', error);
      throw error;
    }
  }

  async checkStatus() {
    try {
      this.initialize();

      if (!this.client) {
        throw new Error('OpenAI client not initialized - missing API key');
      }
      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
      });
      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }
      return { status: 'ok', model: process.env.OPENAI_MODEL };
    } catch (error) {
      console.error('Error checking OpenAI status:', error);
      return { status: 'error', error: error.message };
    }
  }
}

module.exports = new OpenAIService();
