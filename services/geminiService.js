const { truncateToTokenLimit } = require('./serviceUtils');
const { GoogleGenAI } = require('@google/genai');
const config = require('../config/config');
const BaseAIService = require('./baseAIService');

class GeminiService extends BaseAIService {
  constructor() {
    super('gemini');
  }

  getModel() {
    return config.gemini.model;
  }

  initialize() {
    if (!this.client && config.aiProvider === 'gemini') {
      this.client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
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
        throw new Error('Gemini client not initialized');
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

      // Provider-specific API call (Gemini SDK)
      const response = await this.client.models.generateContent({
        model: model,
        contents: truncatedContent,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
        },
      });

      // Check for safety filter blocks
      if (!response.text) {
        throw new Error(
          'Gemini returned empty response - content may have been blocked by safety filters'
        );
      }

      console.log(`[DEBUG] [${timestamp}] Gemini request sent`);

      const mappedUsage = this.mapGeminiUsage(response.usageMetadata);

      console.log(`[DEBUG] [${timestamp}] Total tokens: ${mappedUsage.totalTokens}`);

      const parsedResponse = this.parseAIResponse(response.text);
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
        throw new Error('Gemini client not initialized');
      }

      const { availableTokens } = await this.calculatePlaygroundTokenBudget(prompt);
      const truncatedContent = await truncateToTokenLimit(content, availableTokens);

      // Provider-specific API call (Gemini SDK)
      const response = await this.client.models.generateContent({
        model: config.gemini.model,
        contents: truncatedContent,
        config: {
          systemInstruction: prompt + musthavePrompt,
          temperature: 0.3,
        },
      });

      if (!response.text) {
        throw new Error(
          'Gemini returned empty response - content may have been blocked by safety filters'
        );
      }

      console.log(`[DEBUG] [${timestamp}] Gemini request sent`);

      const mappedUsage = this.mapGeminiUsage(response.usageMetadata);

      console.log(`[DEBUG] [${timestamp}] Total tokens: ${mappedUsage.totalTokens}`);

      const parsedResponse = this.parseAIResponse(response.text);
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
        throw new Error('Gemini client not initialized');
      }

      const response = await this.client.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          temperature: 0.7,
        },
      });

      if (!response.text) {
        throw new Error('Gemini returned empty response');
      }

      return response.text;
    } catch (error) {
      console.error('Error generating text with Gemini:', error);
      throw error;
    }
  }

  async checkStatus() {
    try {
      this.initialize();

      if (!this.client) {
        throw new Error('Gemini client not initialized');
      }

      const response = await this.client.models.generateContent({
        model: config.gemini.model,
        contents: 'Ping',
        config: {
          temperature: 0.7,
        },
      });

      if (!response.text) {
        return { status: 'error' };
      }

      return { status: 'ok', model: config.gemini.model };
    } catch (error) {
      console.error('Error checking Gemini status:', error);
      return { status: 'error' };
    }
  }
}

module.exports = new GeminiService();
