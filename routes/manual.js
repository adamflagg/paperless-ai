const express = require('express');
const router = express.Router();
const paperlessService = require('../services/paperlessService.js');
const openaiService = require('../services/openaiService.js');
const ollamaService = require('../services/ollamaService.js');
const azureService = require('../services/azureService.js');
const geminiService = require('../services/geminiService.js');
const customService = require('../services/customService.js');
const documentModel = require('../models/document.js');
const configFile = require('../config/config.js');

/**
 * @swagger
 * /manual/preview/{id}:
 *   get:
 *     summary: Document preview
 *     description: |
 *       Fetches and returns the content of a specific document from Paperless-ngx
 *       for preview in the manual document review interface.
 *
 *       This endpoint retrieves document details including content, title, ID, and tags,
 *       allowing users to view the document text before applying changes or processing
 *       it with AI tools. The document content is retrieved directly from Paperless-ngx
 *       using the system's configured API credentials.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The document ID from Paperless-ngx
 *         example: 123
 *     responses:
 *       200:
 *         description: Document content retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                   description: The document content
 *                   example: "Invoice from ACME Corp. Amount: $1,234.56"
 *                 title:
 *                   type: string
 *                   description: The document title
 *                   example: "ACME Corp Invoice #12345"
 *                 id:
 *                   type: integer
 *                   description: The document ID
 *                   example: 123
 *                 tags:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Array of tag names assigned to the document
 *                   example: ["Invoice", "ACME Corp", "2023"]
 *       401:
 *         description: Unauthorized - user not authenticated
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/manual/preview/:id', async (req, res) => {
  try {
    const documentId = req.params.id;
    console.log('Fetching content for document:', documentId);

    const response = await fetch(`${process.env.PAPERLESS_API_URL}/documents/${documentId}/`, {
      headers: {
        Authorization: `Token ${process.env.PAPERLESS_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch document content: ${response.status} ${response.statusText}`
      );
    }

    const document = await response.json();
    //map the tags to their names
    document.tags = await Promise.all(
      document.tags.map(async (tag) => {
        const tagName = await paperlessService.getTagTextFromId(tag);
        return tagName;
      })
    );
    console.log('Document Data:', document);
    res.json({
      content: document.content,
      title: document.title,
      id: document.id,
      tags: document.tags,
    });
  } catch (error) {
    console.error('Content fetch error:', error);
    res.status(500).json({ error: `Error fetching document content: ${error.message}` });
  }
});

/**
 * @swagger
 * /manual:
 *   get:
 *     summary: Document review page
 *     description: |
 *       Renders the manual document review page that allows users to browse,
 *       view and manually process documents from Paperless-ngx.
 *     tags:
 *       - Navigation
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Manual document review page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized - user not authenticated
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/manual', async (req, res) => {
  const version = configFile.PAPERLESS_AI_VERSION || ' ';
  res.render('manual', {
    title: 'Document Review',
    error: null,
    success: null,
    version,
    paperlessUrl: process.env.PAPERLESS_API_URL,
    paperlessToken: process.env.PAPERLESS_API_TOKEN,
    config: {},
  });
});

/**
 * @swagger
 * /manual/tags:
 *   get:
 *     summary: Get all tags
 *     description: |
 *       Retrieves all tags from Paperless-ngx for use in the manual document review interface.
 *     tags:
 *       - Documents
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Tags retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Tag'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/manual/tags', async (req, res) => {
  const getTags = await paperlessService.getTags();
  res.json(getTags);
});

/**
 * @swagger
 * /manual/documents:
 *   get:
 *     summary: Get all documents
 *     description: |
 *       Retrieves all documents from Paperless-ngx for display in the manual document review interface.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Documents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Document'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/manual/documents', async (req, res) => {
  const getDocuments = await paperlessService.getDocuments();
  res.json(getDocuments);
});

/**
 * @swagger
 * /manual/analyze:
 *   post:
 *     summary: Analyze document content manually
 *     description: |
 *       Analyzes document content using the configured AI provider and returns structured metadata.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *               existingTags:
 *                 type: array
 *                 items:
 *                   type: string
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document analysis results
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error or AI provider not configured
 */
router.post('/manual/analyze', express.json(), async (req, res) => {
  try {
    const { content, id } = req.body;
    let existingCorrespondentList = await paperlessService.listCorrespondentsNames();
    existingCorrespondentList = existingCorrespondentList.map(
      (correspondent) => correspondent.name
    );
    let existingTagsList = await paperlessService.listTagNames();
    existingTagsList = existingTagsList.map((tags) => tags.name);
    let existingDocumentTypes = await paperlessService.listDocumentTypesNames();
    let existingDocumentTypesList = existingDocumentTypes.map((docType) => docType.name);

    if (!content || typeof content !== 'string') {
      console.log('Invalid content received:', content);
      return res.status(400).json({ error: 'Valid content string is required' });
    }

    if (process.env.AI_PROVIDER === 'openai') {
      const analyzeDocument = await openaiService.analyzeDocument(
        content,
        existingTagsList,
        existingCorrespondentList,
        existingDocumentTypesList,
        id || []
      );
      await documentModel.addOpenAIMetrics(
        id,
        analyzeDocument.metrics.promptTokens,
        analyzeDocument.metrics.completionTokens,
        analyzeDocument.metrics.totalTokens
      );
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'ollama') {
      const analyzeDocument = await ollamaService.analyzeDocument(
        content,
        existingTagsList,
        existingCorrespondentList,
        existingDocumentTypesList,
        id || []
      );
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'custom') {
      const analyzeDocument = await customService.analyzeDocument(
        content,
        existingTagsList,
        existingCorrespondentList,
        existingDocumentTypesList,
        id || []
      );
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'azure') {
      const analyzeDocument = await azureService.analyzeDocument(
        content,
        existingTagsList,
        existingCorrespondentList,
        existingDocumentTypesList,
        id || []
      );
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'gemini') {
      const analyzeDocument = await geminiService.analyzeDocument(
        content,
        existingTagsList,
        existingCorrespondentList,
        existingDocumentTypesList,
        id || []
      );
      await documentModel.addOpenAIMetrics(
        id,
        analyzeDocument.metrics.promptTokens,
        analyzeDocument.metrics.completionTokens,
        analyzeDocument.metrics.totalTokens
      );
      return res.json(analyzeDocument);
    } else {
      return res.status(500).json({ error: 'AI provider not configured' });
    }
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /manual/playground:
 *   post:
 *     summary: Process document using a custom prompt in playground mode
 *     description: |
 *       Analyzes document content using a custom user-provided prompt.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *               prompt:
 *                 type: string
 *               documentId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document analysis results using the custom prompt
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error or AI provider not configured
 */
router.post('/manual/playground', express.json(), async (req, res) => {
  try {
    const { content, prompt, documentId } = req.body;

    if (!content || typeof content !== 'string') {
      console.log('Invalid content received:', content);
      return res.status(400).json({ error: 'Valid content string is required' });
    }

    if (process.env.AI_PROVIDER === 'openai') {
      const analyzeDocument = await openaiService.analyzePlayground(content, prompt);
      await documentModel.addOpenAIMetrics(
        documentId,
        analyzeDocument.metrics.promptTokens,
        analyzeDocument.metrics.completionTokens,
        analyzeDocument.metrics.totalTokens
      );
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'ollama') {
      const analyzeDocument = await ollamaService.analyzePlayground(content, prompt);
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'custom') {
      const analyzeDocument = await customService.analyzePlayground(content, prompt);
      await documentModel.addOpenAIMetrics(
        documentId,
        analyzeDocument.metrics.promptTokens,
        analyzeDocument.metrics.completionTokens,
        analyzeDocument.metrics.totalTokens
      );
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'azure') {
      const analyzeDocument = await azureService.analyzePlayground(content, prompt);
      await documentModel.addOpenAIMetrics(
        documentId,
        analyzeDocument.metrics.promptTokens,
        analyzeDocument.metrics.completionTokens,
        analyzeDocument.metrics.totalTokens
      );
      return res.json(analyzeDocument);
    } else if (process.env.AI_PROVIDER === 'gemini') {
      const analyzeDocument = await geminiService.analyzePlayground(content, prompt);
      await documentModel.addOpenAIMetrics(
        documentId,
        analyzeDocument.metrics.promptTokens,
        analyzeDocument.metrics.completionTokens,
        analyzeDocument.metrics.totalTokens
      );
      return res.json(analyzeDocument);
    } else {
      return res.status(500).json({ error: 'AI provider not configured' });
    }
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /manual/updateDocument:
 *   post:
 *     summary: Update document metadata in Paperless-ngx
 *     description: |
 *       Updates document metadata such as tags, correspondent and title in the Paperless-ngx system.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentId
 *             properties:
 *               documentId:
 *                 type: number
 *               tags:
 *                 type: array
 *                 items:
 *                   oneOf:
 *                     - type: number
 *                     - type: string
 *               correspondent:
 *                 type: string
 *               title:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document successfully updated
 *       400:
 *         description: Invalid request parameters or tag processing errors
 *       500:
 *         description: Server error
 */
router.post('/manual/updateDocument', express.json(), async (req, res) => {
  try {
    var { documentId, tags, correspondent, title } = req.body;
    console.log('TITLE: ', title);
    // Convert all tags to names if they are IDs
    tags = await Promise.all(
      tags.map(async (tag) => {
        console.log('Processing tag:', tag);
        if (!isNaN(tag)) {
          const tagName = await paperlessService.getTagTextFromId(Number(tag));
          console.log('Converted tag ID:', tag, 'to name:', tagName);
          return tagName;
        }
        return tag;
      })
    );

    // Filter out any null or undefined tags
    tags = tags.filter((tag) => tag != null);

    // Process new tags to get their IDs
    const { tagIds, errors } = await paperlessService.processTags(tags);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // Process correspondent if provided
    const correspondentData = correspondent
      ? await paperlessService.getOrCreateCorrespondent(correspondent)
      : null;

    await paperlessService.removeUnusedTagsFromDocument(documentId, tagIds);

    // Then update with new tags (this will only add new ones since we already removed unused ones)
    const updateData = {
      tags: tagIds,
      correspondent: correspondentData ? correspondentData.id : null,
      title: title ? title : null,
    };

    if (
      updateData.tags === null &&
      updateData.correspondent === null &&
      updateData.title === null
    ) {
      return res.status(400).json({ error: 'No changes provided' });
    }
    const updateDocument = await paperlessService.updateDocument(documentId, updateData);

    // Mark document as processed
    await documentModel.addProcessedDocument(documentId, updateData.title);

    res.json(updateDocument);
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
