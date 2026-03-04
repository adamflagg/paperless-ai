/**
 * Tests for AIServiceFactory.
 *
 * The factory (services/aiServiceFactory.js) uses a switch on config.aiProvider
 * to return one of the 5 service singletons. Since vi.doMock cannot intercept
 * CJS require() calls from within CJS modules, we use createRequire to load the
 * real modules and mutate config.aiProvider to drive the switch.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const AIServiceFactory = require('../../../services/aiServiceFactory');
const config = require('../../../config/config');
const openaiService = require('../../../services/openaiService');
const ollamaService = require('../../../services/ollamaService');
const customService = require('../../../services/customService');
const azureService = require('../../../services/azureService');
const geminiService = require('../../../services/geminiService');

describe('AIServiceFactory', () => {
  let savedProvider;

  beforeEach(() => {
    savedProvider = config.aiProvider;
  });

  afterEach(() => {
    config.aiProvider = savedProvider;
  });

  it('returns openaiService for "openai" provider', () => {
    config.aiProvider = 'openai';
    const service = AIServiceFactory.getService();
    expect(service).toBe(openaiService);
  });

  it('returns ollamaService for "ollama" provider', () => {
    config.aiProvider = 'ollama';
    const service = AIServiceFactory.getService();
    expect(service).toBe(ollamaService);
  });

  it('returns customService for "custom" provider', () => {
    config.aiProvider = 'custom';
    const service = AIServiceFactory.getService();
    expect(service).toBe(customService);
  });

  it('returns azureService for "azure" provider', () => {
    config.aiProvider = 'azure';
    const service = AIServiceFactory.getService();
    expect(service).toBe(azureService);
  });

  it('returns geminiService for "gemini" provider', () => {
    config.aiProvider = 'gemini';
    const service = AIServiceFactory.getService();
    expect(service).toBe(geminiService);
  });

  it('defaults to openaiService for unknown provider', () => {
    config.aiProvider = 'unknown_provider';
    const service = AIServiceFactory.getService();
    expect(service).toBe(openaiService);
  });

  it('defaults to openaiService when provider is undefined', () => {
    config.aiProvider = undefined;
    const service = AIServiceFactory.getService();
    expect(service).toBe(openaiService);
  });

  it('exports a class with a static getService method', () => {
    expect(typeof AIServiceFactory.getService).toBe('function');
  });

  it('returns the same singleton instance on repeated calls', () => {
    config.aiProvider = 'openai';
    const first = AIServiceFactory.getService();
    const second = AIServiceFactory.getService();
    expect(first).toBe(second);
  });

  it('returns different services when provider changes', () => {
    config.aiProvider = 'openai';
    const openai = AIServiceFactory.getService();
    config.aiProvider = 'ollama';
    const ollama = AIServiceFactory.getService();
    expect(openai).not.toBe(ollama);
  });
});
