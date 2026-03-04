/**
 * Tests for models/document.js.
 *
 * The document model uses better-sqlite3 with a file-based DB in data/.
 * Since the module initializes the DB on require (top-level side effect),
 * we use the real module and test against the actual DB.
 *
 * Tests clean up after themselves to avoid polluting the DB with test data.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Document = require('../../../models/document');

// Use a high document ID range unlikely to conflict with real data
const TEST_DOC_BASE = 9999000;

describe('Document model', () => {
  // =========================================================================
  // Module exports
  // =========================================================================
  describe('module exports', () => {
    it('exports an object with expected methods', () => {
      expect(typeof Document).toBe('object');
      expect(typeof Document.addProcessedDocument).toBe('function');
      expect(typeof Document.isDocumentProcessed).toBe('function');
      expect(typeof Document.getProcessedDocuments).toBe('function');
      expect(typeof Document.getProcessedDocumentsCount).toBe('function');
      expect(typeof Document.saveOriginalData).toBe('function');
      expect(typeof Document.addToHistory).toBe('function');
      expect(typeof Document.getHistory).toBe('function');
      expect(typeof Document.getOriginalData).toBe('function');
      expect(typeof Document.getAllOriginalData).toBe('function');
      expect(typeof Document.getAllHistory).toBe('function');
      expect(typeof Document.getUsers).toBe('function');
      expect(typeof Document.addUser).toBe('function');
      expect(typeof Document.getUser).toBe('function');
      expect(typeof Document.setProcessingStatus).toBe('function');
      expect(typeof Document.getCurrentProcessingStatus).toBe('function');
      expect(typeof Document.deleteAllDocuments).toBe('function');
      expect(typeof Document.deleteDocumentsIdList).toBe('function');
      expect(typeof Document.addOpenAIMetrics).toBe('function');
      expect(typeof Document.getMetrics).toBe('function');
      expect(typeof Document.closeDatabase).toBe('function');
    });
  });

  // =========================================================================
  // isDocumentProcessed
  // =========================================================================
  describe('isDocumentProcessed', () => {
    it('returns false for a document that has not been processed', async () => {
      const result = await Document.isDocumentProcessed(TEST_DOC_BASE + 1);
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // addProcessedDocument + isDocumentProcessed round-trip
  // =========================================================================
  describe('addProcessedDocument + isDocumentProcessed', () => {
    const docId = TEST_DOC_BASE + 2;

    afterAll(async () => {
      // Clean up
      await Document.deleteDocumentsIdList([docId]);
    });

    it('adds a document and then finds it as processed', async () => {
      const added = await Document.addProcessedDocument(docId, 'Test Document');
      expect(added).toBe(true);

      const processed = await Document.isDocumentProcessed(docId);
      expect(processed).toBe(true);
    });

    it('returns true when adding the same document again (upsert)', async () => {
      const result = await Document.addProcessedDocument(docId, 'Test Document Updated');
      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // setProcessingStatus
  // =========================================================================
  describe('setProcessingStatus', () => {
    const docId = TEST_DOC_BASE + 3;

    afterAll(async () => {
      // Clear status
      await Document.setProcessingStatus(docId, 'Cleanup', 'complete');
    });

    it('sets processing status', async () => {
      const result = await Document.setProcessingStatus(docId, 'Test Doc', 'processing');
      expect(result).toBe(true);
    });

    it('clears status when set to "complete"', async () => {
      await Document.setProcessingStatus(docId, 'Test Doc', 'processing');
      const cleared = await Document.setProcessingStatus(docId, 'Test Doc', 'complete');
      expect(cleared).toBe(true);
    });
  });

  // =========================================================================
  // saveOriginalData + getOriginalData round-trip
  // =========================================================================
  describe('saveOriginalData + getOriginalData', () => {
    const docId = TEST_DOC_BASE + 4;

    afterAll(async () => {
      await Document.deleteDocumentsIdList([docId]);
    });

    it('saves and retrieves original data for a document', async () => {
      const tags = ['tag1', 'tag2'];
      const saved = await Document.saveOriginalData(docId, tags, 'Test Corp', 'Test Title');
      expect(saved).toBe(true);

      const retrieved = await Document.getOriginalData(docId);
      expect(retrieved).toBeDefined();
      expect(retrieved.document_id).toBe(docId);
      expect(retrieved.title).toBe('Test Title');
      expect(retrieved.correspondent).toBe('Test Corp');
      expect(JSON.parse(retrieved.tags)).toEqual(tags);
    });
  });

  // =========================================================================
  // addToHistory + getHistory round-trip
  // =========================================================================
  describe('addToHistory + getHistory', () => {
    const docId = TEST_DOC_BASE + 5;

    afterAll(async () => {
      await Document.deleteDocumentsIdList([docId]);
    });

    it('adds history and retrieves it by document id', async () => {
      const tagIds = [1, 2, 3];
      const added = await Document.addToHistory(docId, tagIds, 'History Title', 'History Corp');
      expect(added).toBe(true);

      const history = await Document.getHistory(docId);
      expect(history).toBeDefined();
      expect(history.document_id).toBe(docId);
      expect(history.title).toBe('History Title');
      expect(history.correspondent).toBe('History Corp');
      expect(JSON.parse(history.tags)).toEqual(tagIds);
    });
  });

  // =========================================================================
  // getUsers
  // =========================================================================
  describe('getUsers', () => {
    it('returns an array', async () => {
      const users = await Document.getUsers();
      expect(Array.isArray(users)).toBe(true);
    });
  });

  // =========================================================================
  // getProcessedDocuments
  // =========================================================================
  describe('getProcessedDocuments', () => {
    it('returns an array', async () => {
      const docs = await Document.getProcessedDocuments();
      expect(Array.isArray(docs)).toBe(true);
    });
  });

  // =========================================================================
  // getProcessedDocumentsCount
  // =========================================================================
  describe('getProcessedDocumentsCount', () => {
    it('returns a number', async () => {
      const count = await Document.getProcessedDocumentsCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // getMetrics
  // =========================================================================
  describe('getMetrics', () => {
    it('returns an array', async () => {
      const metrics = await Document.getMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  // =========================================================================
  // addOpenAIMetrics
  // =========================================================================
  describe('addOpenAIMetrics', () => {
    it('adds metrics successfully', async () => {
      const result = await Document.addOpenAIMetrics(TEST_DOC_BASE + 6, 100, 50, 150);
      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // getCurrentProcessingStatus
  // =========================================================================
  describe('getCurrentProcessingStatus', () => {
    it('returns expected shape', async () => {
      const status = await Document.getCurrentProcessingStatus();
      expect(status).toHaveProperty('currentlyProcessing');
      expect(status).toHaveProperty('lastProcessed');
      expect(status).toHaveProperty('processedToday');
      expect(status).toHaveProperty('isProcessing');
      expect(typeof status.processedToday).toBe('number');
      expect(typeof status.isProcessing).toBe('boolean');
    });
  });

  // =========================================================================
  // getAllHistory
  // =========================================================================
  describe('getAllHistory', () => {
    it('returns an array', async () => {
      const history = await Document.getAllHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  // =========================================================================
  // deleteDocumentsIdList
  // =========================================================================
  describe('deleteDocumentsIdList', () => {
    it('returns false for empty array', async () => {
      const result = await Document.deleteDocumentsIdList([]);
      expect(result).toBe(false);
    });

    it('returns false for invalid input', async () => {
      const result = await Document.deleteDocumentsIdList(null);
      expect(result).toBe(false);
    });

    it('succeeds for a list of valid IDs', async () => {
      const docId = TEST_DOC_BASE + 7;
      await Document.addProcessedDocument(docId, 'Delete Test');
      const result = await Document.deleteDocumentsIdList([docId]);
      expect(result).toBe(true);

      const processed = await Document.isDocumentProcessed(docId);
      expect(processed).toBe(false);
    });
  });
});
