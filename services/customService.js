const { truncateToTokenLimit } = require('./serviceUtils');
const OpenAI = require('openai');
const config = require('../config/config');
const BaseAIService = require('./baseAIService');

class CustomOpenAIService extends BaseAIService {
  constructor() {
    super('custom');
  }

  getModel() {
    return config.custom.model;
  }

  initialize() {
    if (!this.client && config.aiProvider === 'custom') {
      this.client = new OpenAI({
        baseURL: config.custom.apiUrl,
        apiKey: config.custom.apiKey,
      });
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
        throw new Error('Custom OpenAI client not initialized');
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

      // Provider-specific API call
      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: truncatedContent },
        ],
        temperature: 0.3,
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      console.log(`[DEBUG] [${timestamp}] Custom OpenAI request sent`);
      console.log(`[DEBUG] [${timestamp}] Total tokens: ${response.usage.total_tokens}`);

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
        throw new Error('Custom OpenAI client not initialized - missing API key');
      }

      const { availableTokens } = await this.calculatePlaygroundTokenBudget(prompt);
      const truncatedContent = await truncateToTokenLimit(content, availableTokens);

      // Provider-specific API call
      const response = await this.client.chat.completions.create({
        model: config.custom.model,
        messages: [
          { role: 'system', content: prompt + musthavePrompt },
          { role: 'user', content: truncatedContent },
        ],
        temperature: 0.3,
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      console.log(`[DEBUG] [${timestamp}] Custom OpenAI request sent`);
      console.log(`[DEBUG] [${timestamp}] Total tokens: ${response.usage.total_tokens}`);

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
        throw new Error('Custom OpenAI client not initialized - missing API key');
      }

      const model = config.custom.model;

      const response = await this.client.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 128000,
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating text with Custom OpenAI:', error);
      throw error;
    }
  }

  async checkStatus() {
    try {
      this.initialize();

      if (!this.client) {
        throw new Error('Custom OpenAI client not initialized - missing API key');
      }

      const model = config.custom.model;

      const response = await this.client.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: 'Ping' }],
        temperature: 0.7,
        max_tokens: 1000,
      });

      if (!response?.choices?.[0]?.message?.content) {
        return { status: 'error' };
      }

      return { status: 'ok', model: model };
    } catch (error) {
      console.error('Error generating text with Custom OpenAI:', error);
      return { status: 'error' };
    }
  }
}

module.exports = new CustomOpenAIService();
