const { truncateToTokenLimit } = require('./serviceUtils');
const AzureOpenAI = require('openai').AzureOpenAI;
const config = require('../config/config');
const { GENERATE_TEXT_MAX_TOKENS, STATUS_CHECK_MAX_TOKENS } = require('../config/constants');
const BaseAIService = require('./baseAIService');

class AzureOpenAIService extends BaseAIService {
  constructor() {
    super('azure');
  }

  getModel() {
    return process.env.AZURE_DEPLOYMENT_NAME;
  }

  initialize() {
    if (!this.client && config.aiProvider === 'azure') {
      this.client = new AzureOpenAI({
        apiKey: config.azure.apiKey,
        endpoint: config.azure.endpoint,
        deploymentName: config.azure.deploymentName,
        apiVersion: config.azure.apiVersion,
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
        throw new Error('AzureOpenAI client not initialized');
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
        temperature: 0.3,
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      console.debug(`[${timestamp}] AzureOpenAI request sent`);
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
        throw new Error('AzureOpenAI client not initialized - missing API key');
      }

      const { availableTokens } = await this.calculatePlaygroundTokenBudget(prompt);
      const truncatedContent = await truncateToTokenLimit(content, availableTokens);

      // Provider-specific API call
      const response = await this.client.chat.completions.create({
        model: process.env.AZURE_DEPLOYMENT_NAME,
        messages: [
          { role: 'system', content: prompt + musthavePrompt },
          { role: 'user', content: truncatedContent },
        ],
        temperature: 0.3,
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      console.debug(`[${timestamp}] AzureOpenAI request sent`);
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
        throw new Error('AzureOpenAI client not initialized - missing API key');
      }

      const model = process.env.AZURE_DEPLOYMENT_NAME;

      const response = await this.client.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: GENERATE_TEXT_MAX_TOKENS,
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating text with AzureOpenAI:', error);
      throw error;
    }
  }

  async checkStatus() {
    try {
      this.initialize();

      if (!this.client) {
        throw new Error('AzureOpenAI client not initialized - missing API key');
      }

      const model = process.env.AZURE_DEPLOYMENT_NAME;

      const response = await this.client.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
        max_tokens: STATUS_CHECK_MAX_TOKENS,
      });

      if (!response?.choices?.[0]?.message?.content) {
        throw new Error('Invalid API response structure');
      }

      return { status: 'ok', model: model };
    } catch (error) {
      console.error('Error checking AzureOpenAI status:', error);
      return { status: 'error', error: error.message };
    }
  }
}

module.exports = new AzureOpenAIService();
