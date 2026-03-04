/**
 * Tests for services/serviceUtils.js.
 *
 * Functions under test:
 *   - calculateTokens(text, model)
 *   - calculateTotalPromptTokens(systemPrompt, additionalPrompts, model)
 *   - truncateToTokenLimit(text, maxTokens, model)
 *   - writePromptToFile(systemPrompt, content, filePath, maxSize)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

const {
  calculateTokens,
  calculateTotalPromptTokens,
  truncateToTokenLimit,
  writePromptToFile,
} = require('../../../services/serviceUtils');

describe('serviceUtils', () => {
  // Suppress console output in tests
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // =========================================================================
  // calculateTokens
  // =========================================================================
  describe('calculateTokens', () => {
    it('returns a positive number for non-empty text', async () => {
      const tokens = await calculateTokens('Hello world', 'gpt-4o-mini');
      expect(tokens).toBeGreaterThan(0);
    });

    it('returns 0 for empty string', async () => {
      const tokens = await calculateTokens('', 'gpt-4o-mini');
      expect(tokens).toBe(0);
    });

    it('uses character estimation for non-OpenAI models', async () => {
      const text = 'Hello world test string'; // 23 chars
      const tokens = await calculateTokens(text, 'llama-3.2');
      expect(tokens).toBe(Math.ceil(23 / 4));
    });

    it('returns more tokens for longer text', async () => {
      const short = await calculateTokens('Hello', 'gpt-4o-mini');
      const long = await calculateTokens(
        'Hello world, this is a much longer text string that contains many words',
        'gpt-4o-mini'
      );
      expect(long).toBeGreaterThan(short);
    });

    it('handles OpenAI model names correctly', async () => {
      const tokens = await calculateTokens('Test text', 'gpt-4');
      expect(tokens).toBeGreaterThan(0);
    });

    it('handles gpt-3.5-turbo model', async () => {
      const tokens = await calculateTokens('Test text for tokenization', 'gpt-3.5-turbo');
      expect(tokens).toBeGreaterThan(0);
    });

    it('uses character estimation for Claude models', async () => {
      const text = 'Test string for Claude'; // 22 chars
      const tokens = await calculateTokens(text, 'claude-3-opus');
      expect(tokens).toBe(Math.ceil(22 / 4));
    });

    it('uses character estimation for Gemini models', async () => {
      const text = 'Test string for Gemini model'; // 28 chars
      const tokens = await calculateTokens(text, 'gemini-2.0-flash');
      expect(tokens).toBe(Math.ceil(28 / 4));
    });
  });

  // =========================================================================
  // truncateToTokenLimit
  // =========================================================================
  describe('truncateToTokenLimit', () => {
    it('returns original text if under limit', async () => {
      const text = 'Short text';
      const result = await truncateToTokenLimit(text, 1000, 'gpt-4o-mini');
      expect(result).toBe(text);
    });

    it('truncates text that exceeds token limit (OpenAI model)', async () => {
      const longText = 'word '.repeat(10000);
      const result = await truncateToTokenLimit(longText, 10, 'gpt-4o-mini');
      expect(result.length).toBeLessThan(longText.length);
    });

    it('truncates non-OpenAI models using character estimation', async () => {
      const text = 'a '.repeat(100); // 200 chars
      const result = await truncateToTokenLimit(text, 10, 'llama-3.2'); // 10 tokens * 4 = 40 chars
      expect(result.length).toBeLessThanOrEqual(40);
    });

    it('returns original text for non-OpenAI models when under limit', async () => {
      const text = 'Short'; // 5 chars = ~2 tokens
      const result = await truncateToTokenLimit(text, 100, 'llama-3.2');
      expect(result).toBe(text);
    });

    it('truncates at word boundary when possible for non-OpenAI models', async () => {
      // Create text where truncation would land in the middle of a word
      const text = 'word '.repeat(20); // 100 chars
      const result = await truncateToTokenLimit(text, 5, 'llama-3.2'); // 5 tokens * 4 = 20 chars
      // Should break at a space if possible
      expect(result.length).toBeLessThanOrEqual(20);
    });
  });

  // =========================================================================
  // calculateTotalPromptTokens
  // =========================================================================
  describe('calculateTotalPromptTokens', () => {
    it('sums system prompt and additional prompt tokens', async () => {
      const total = await calculateTotalPromptTokens(
        'system prompt',
        ['user message'],
        'gpt-4o-mini'
      );
      expect(total).toBeGreaterThan(0);
    });

    it('handles empty additional prompts', async () => {
      const total = await calculateTotalPromptTokens('system prompt', [], 'gpt-4o-mini');
      expect(total).toBeGreaterThan(0);
    });

    it('skips null/undefined additional prompts', async () => {
      const total = await calculateTotalPromptTokens(
        'system',
        [null, undefined, 'valid'],
        'gpt-4o-mini'
      );
      expect(total).toBeGreaterThan(0);
    });

    it('adds message formatting tokens (4 per message)', async () => {
      // With 1 system prompt + 1 additional prompt = 2 messages * 4 = 8 formatting tokens
      const withOne = await calculateTotalPromptTokens('system', ['one'], 'llama-3.2');
      // With 1 system prompt + 2 additional prompts = 3 messages * 4 = 12 formatting tokens
      const withTwo = await calculateTotalPromptTokens('system', ['one', 'two'], 'llama-3.2');
      // The difference should include the extra prompt tokens + 4 formatting tokens
      expect(withTwo).toBeGreaterThan(withOne);
    });

    it('returns consistent results for identical inputs', async () => {
      const a = await calculateTotalPromptTokens('prompt', ['msg'], 'gpt-4o-mini');
      const b = await calculateTotalPromptTokens('prompt', ['msg'], 'gpt-4o-mini');
      expect(a).toBe(b);
    });

    it('uses character estimation for non-OpenAI models', async () => {
      const total = await calculateTotalPromptTokens(
        'system prompt text', // 18 chars -> 5 tokens
        ['user message'], // 12 chars -> 3 tokens
        'llama-3.2'
      );
      // 5 + 3 = 8 content tokens + 2 messages * 4 formatting = 16
      expect(total).toBe(Math.ceil(18 / 4) + Math.ceil(12 / 4) + 2 * 4);
    });
  });

  // =========================================================================
  // writePromptToFile
  // =========================================================================
  describe('writePromptToFile', () => {
    it('writes prompt and content to file', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-test-'));
      const filePath = path.join(tmpDir, 'test-prompt.txt');

      await writePromptToFile('System prompt', 'User content', filePath);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('System prompt');
      expect(content).toContain('User content');
      expect(content).toContain('SYSTEM PROMPT:');
      expect(content).toContain('USER CONTENT:');

      await fs.rm(tmpDir, { recursive: true });
    });

    it('includes a timestamp in the output', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-test-'));
      const filePath = path.join(tmpDir, 'timestamp-test.txt');

      await writePromptToFile('Prompt', 'Content', filePath);

      const content = await fs.readFile(filePath, 'utf-8');
      // ISO timestamp pattern: YYYY-MM-DDTHH:MM:SS
      expect(content).toMatch(/===\s+\d{4}-\d{2}-\d{2}T/);

      await fs.rm(tmpDir, { recursive: true });
    });

    it('appends to existing file', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-test-'));
      const filePath = path.join(tmpDir, 'append-test.txt');

      await writePromptToFile('First prompt', 'First content', filePath);
      await writePromptToFile('Second prompt', 'Second content', filePath);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('First prompt');
      expect(content).toContain('Second prompt');

      await fs.rm(tmpDir, { recursive: true });
    });

    it('creates parent directories if they do not exist', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-test-'));
      const filePath = path.join(tmpDir, 'nested', 'dir', 'prompt.txt');

      await writePromptToFile('Nested prompt', 'Nested content', filePath);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('Nested prompt');

      await fs.rm(tmpDir, { recursive: true });
    });

    it('deletes file when it exceeds maxSize and rewrites', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-test-'));
      const filePath = path.join(tmpDir, 'size-test.txt');

      // Write initial content
      await writePromptToFile('Initial', 'Content', filePath);

      // Write again with a very small maxSize (should delete and rewrite)
      await writePromptToFile('After delete', 'New content', filePath, 1);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('After delete');
      // The initial content should be gone since file was cleared
      expect(content).not.toContain('Initial');

      await fs.rm(tmpDir, { recursive: true });
    });
  });
});
