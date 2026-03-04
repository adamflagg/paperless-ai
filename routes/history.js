const express = require('express');
const router = express.Router();
const paperlessService = require('../services/paperlessService.js');
const documentModel = require('../models/document.js');
const configFile = require('../config/config.js');

/**
 * @swagger
 * /history:
 *   get:
 *     summary: Document history page
 *     description: |
 *       Renders the document history page with filtering options.
 *     tags:
 *       - History
 *       - Navigation
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: History page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/history', async (req, res) => {
  try {
    const allTags = await paperlessService.getTags();

    // Get all correspondents for filter dropdown
    const historyDocuments = await documentModel.getAllHistory();
    const allCorrespondents = [...new Set(historyDocuments.map((doc) => doc.correspondent))]
      .filter(Boolean)
      .sort();

    res.render('history', {
      version: configFile.PAPERLESS_AI_VERSION,
      filters: {
        allTags: allTags,
        allCorrespondents: allCorrespondents,
      },
    });
  } catch (error) {
    console.error('Error loading history page:', error);
    res.status(500).send('Error loading history page');
  }
});

/**
 * @swagger
 * /api/history:
 *   get:
 *     summary: Get processed document history
 *     description: |
 *       Returns a paginated list of documents that have been processed by Paperless-AI.
 *       Supports filtering by tag, correspondent, and search term.
 *       Designed for integration with DataTables jQuery plugin.
 *     tags:
 *       - History
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: draw
 *         schema:
 *           type: integer
 *       - in: query
 *         name: start
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: length
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search[value]
 *         schema:
 *           type: string
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *       - in: query
 *         name: correspondent
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document history returned successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/api/history', async (req, res) => {
  try {
    const draw = parseInt(req.query.draw);
    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 10;
    const search = req.query.search?.value || '';
    const tagFilter = req.query.tag || '';
    const correspondentFilter = req.query.correspondent || '';

    // Get all documents
    const allDocs = await documentModel.getAllHistory();
    const allTags = await paperlessService.getTags();
    const tagMap = new Map(allTags.map((tag) => [tag.id, tag]));

    // Format and filter documents
    let filteredDocs = allDocs
      .map((doc) => {
        const tagIds = doc.tags === '[]' ? [] : JSON.parse(doc.tags || '[]');
        const resolvedTags = tagIds.map((id) => tagMap.get(parseInt(id))).filter(Boolean);
        const baseURL = process.env.PAPERLESS_API_URL.replace(/\/api$/, '');

        resolvedTags.sort((a, b) => a.name.localeCompare(b.name));

        return {
          document_id: doc.document_id,
          title: doc.title || 'Modified: Invalid Date',
          created_at: doc.created_at,
          tags: resolvedTags,
          correspondent: doc.correspondent || 'Not assigned',
          link: `${baseURL}/documents/${doc.document_id}/`,
        };
      })
      .filter((doc) => {
        const matchesSearch =
          !search ||
          doc.title.toLowerCase().includes(search.toLowerCase()) ||
          doc.correspondent.toLowerCase().includes(search.toLowerCase()) ||
          doc.tags.some((tag) => tag.name.toLowerCase().includes(search.toLowerCase()));

        const matchesTag = !tagFilter || doc.tags.some((tag) => tag.id === parseInt(tagFilter));
        const matchesCorrespondent =
          !correspondentFilter || doc.correspondent === correspondentFilter;

        return matchesSearch && matchesTag && matchesCorrespondent;
      });

    // Sort documents if requested
    if (req.query.order) {
      const order = req.query.order[0];
      const column = req.query.columns[order.column].data;
      const dir = order.dir === 'asc' ? 1 : -1;

      filteredDocs.sort((a, b) => {
        if (a[column] == null) return 1;
        if (b[column] == null) return -1;
        if (column === 'created_at') {
          return dir * (new Date(a[column]) - new Date(b[column]));
        }
        if (column === 'document_id') {
          return dir * (a[column] - b[column]);
        }
        if (column === 'tags') {
          let min_len = a[column].length < b[column].length ? a[column].length : b[column].length;
          for (let i = 0; i < min_len; i += 1) {
            let cmp = a[column][i].name.localeCompare(b[column][i].name);
            if (cmp !== 0) return dir * cmp;
          }
          return dir * (a[column].length - b[column].length);
        }
        return dir * a[column].localeCompare(b[column]);
      });
    }

    res.json({
      draw: draw,
      recordsTotal: allDocs.length,
      recordsFiltered: filteredDocs.length,
      data: filteredDocs.slice(start, start + length),
    });
  } catch (error) {
    console.error('Error loading history data:', error);
    res.status(500).json({ error: 'Error loading history data' });
  }
});

module.exports = router;
