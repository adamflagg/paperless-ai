const express = require('express');
const router = express.Router();
const paperlessService = require('../services/paperlessService.js');
const documentModel = require('../models/document.js');
const configFile = require('../config/config.js');

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Main dashboard page
 *     description: |
 *       Renders the main dashboard page of the application with summary statistics and visualizations.
 *     tags:
 *       - Navigation
 *       - System
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Dashboard page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/dashboard', async (req, res) => {
  const tagCount = await paperlessService.getTagCount();
  const correspondentCount = await paperlessService.getCorrespondentCount();
  const documentCount = await paperlessService.getDocumentCount();
  const processedDocumentCount = await documentModel.getProcessedDocumentsCount();
  const metrics = await documentModel.getMetrics();
  const processingTimeStats = await documentModel.getProcessingTimeStats();
  const tokenDistribution = await documentModel.getTokenDistribution();
  const documentTypes = await documentModel.getDocumentTypeStats();

  const averagePromptTokens =
    metrics.length > 0
      ? Math.round(metrics.reduce((acc, cur) => acc + cur.promptTokens, 0) / metrics.length)
      : 0;
  const averageCompletionTokens =
    metrics.length > 0
      ? Math.round(metrics.reduce((acc, cur) => acc + cur.completionTokens, 0) / metrics.length)
      : 0;
  const averageTotalTokens =
    metrics.length > 0
      ? Math.round(metrics.reduce((acc, cur) => acc + cur.totalTokens, 0) / metrics.length)
      : 0;
  const tokensOverall =
    metrics.length > 0 ? metrics.reduce((acc, cur) => acc + cur.totalTokens, 0) : 0;

  const version = configFile.PAPERLESS_AI_VERSION || ' ';

  res.render('dashboard', {
    paperless_data: {
      tagCount,
      correspondentCount,
      documentCount,
      processedDocumentCount,
      processingTimeStats,
      tokenDistribution,
      documentTypes,
    },
    openai_data: {
      averagePromptTokens,
      averageCompletionTokens,
      averageTotalTokens,
      tokensOverall,
    },
    version,
  });
});

router.get('/dashboard/doc/:id', async (req, res) => {
  const docId = req.params.id;
  if (!docId) {
    return res.status(400).json({ error: 'Document ID is required' });
  }
  try {
    // Redirect to paperless-ngx and show detail page of the document
    const paperlessUrl = process.env.PAPERLESS_API_URL;
    const paperlessUrlWithoutApi = paperlessUrl.replace('/api', '');
    const redirectUrl = `${paperlessUrlWithoutApi}/documents/${docId}/details`;
    console.log('Redirecting to Paperless-ngx URL:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

/**
 * @swagger
 * /api/correspondentsCount:
 *   get:
 *     summary: Get count of correspondents
 *     description: |
 *       Retrieves the list of correspondents with their document counts.
 *     tags:
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of correspondents with document counts retrieved successfully
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.get('/api/correspondentsCount', async (req, res) => {
  const correspondents = await paperlessService.listCorrespondentsNames();
  res.json(correspondents);
});

/**
 * @swagger
 * /api/tagsCount:
 *   get:
 *     summary: Get count of tags
 *     description: |
 *       Retrieves the list of tags with their document counts.
 *     tags:
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of tags with document counts retrieved successfully
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.get('/api/tagsCount', async (req, res) => {
  const tags = await paperlessService.listTagNames();
  res.json(tags);
});

module.exports = router;
