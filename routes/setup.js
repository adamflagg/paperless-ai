const express = require('express');
const router = express.Router();
const setupService = require('../services/setupService.js');
const paperlessService = require('../services/paperlessService.js');
const documentModel = require('../models/document.js');
const AIServiceFactory = require('../services/aiServiceFactory');
const configFile = require('../config/config.js');
const { JWT_EXPIRY, JWT_COOKIE_MAX_AGE_MS } = require('../config/constants');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { JWT_SECRET } = require('./auth');
const config = require('../config/config.js');
require('dotenv').config({ path: '../data/.env' });

/**
 * @swagger
 * tags:
 *   - name: Authentication
 *     description: User authentication and authorization endpoints, including login, logout, and token management
 *   - name: Documents
 *     description: Document management and processing endpoints for interacting with Paperless-ngx documents
 *   - name: History
 *     description: Document processing history and tracking of AI-generated metadata
 *   - name: Navigation
 *     description: General navigation endpoints for the web interface
 *   - name: System
 *     description: System configuration, health checks, and administrative functions
 *   - name: Chat
 *     description: Document chat functionality for interacting with document content using AI
 *   - name: Setup
 *     description: Application setup and configuration endpoints
 *   - name: Metadata
 *     description: Endpoints for managing document metadata like tags, correspondents, and document types
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Error message
 *           example: Error resetting documents
 *     User:
 *       type: object
 *       required:
 *         - username
 *         - password
 *       properties:
 *         username:
 *           type: string
 *           description: User's username
 *         password:
 *           type: string
 *           format: password
 *           description: User's password (will be hashed)
 *     Document:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Document ID
 *           example: 123
 *         title:
 *           type: string
 *           description: Document title
 *           example: Invoice #12345
 *         tags:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array of tag IDs
 *           example: [1, 4, 7]
 *         correspondent:
 *           type: integer
 *           description: Correspondent ID
 *           example: 5
 *     HistoryItem:
 *       type: object
 *       properties:
 *         document_id:
 *           type: integer
 *           description: Document ID
 *           example: 123
 *         title:
 *           type: string
 *           description: Document title
 *           example: Invoice #12345
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Date and time when the processing occurred
 *         tags:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Tag'
 *         correspondent:
 *           type: string
 *           description: Document correspondent name
 *           example: Acme Corp
 *         link:
 *           type: string
 *           description: Link to the document in Paperless-ngx
 *     Tag:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Tag ID
 *           example: 5
 *         name:
 *           type: string
 *           description: Tag name
 *           example: Invoice
 *         color:
 *           type: string
 *           description: Tag color (hex code)
 *           example: "#FF5733"
 */

// Auth + setup check middleware is now applied at the app level in server.js

/**
 * @swagger
 * /login:
 *   get:
 *     summary: Render login page or redirect to setup if no users exist
 *     description: |
 *       Serves the login page for user authentication to the Paperless-AI application.
 *       If no users exist in the database, the endpoint automatically redirects to the setup page
 *       to complete the initial application configuration.
 *
 *       This endpoint handles both new user sessions and returning users whose
 *       sessions have expired.
 *     tags:
 *       - Authentication
 *       - Navigation
 *     responses:
 *       200:
 *         description: Login page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the login page
 *       302:
 *         description: Redirect to setup page if no users exist, or to dashboard if already authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/setup"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/login', (req, res) => {
  //check if a user exists beforehand
  documentModel.getUsers().then((users) => {
    if (users.length === 0) {
      res.redirect('setup');
    } else {
      res.render('login', { error: null });
    }
  });
});

// Login page route
/**
 * @swagger
 * /login:
 *   post:
 *     summary: Authenticate user with username and password
 *     description: |
 *       Authenticates a user using their username and password credentials.
 *       If authentication is successful, a JWT token is generated and stored in a secure HTTP-only
 *       cookie for subsequent requests.
 *
 *       Failed login attempts are logged for security purposes, and multiple failures
 *       may result in temporary account lockout depending on configuration.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: User's login name
 *                 example: "admin"
 *               password:
 *                 type: string
 *                 description: User's password
 *                 example: "securepassword"
 *               rememberMe:
 *                 type: boolean
 *                 description: Whether to extend the session lifetime
 *                 example: false
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 redirect:
 *                   type: string
 *                   description: URL to redirect to after successful login
 *                   example: "/dashboard"
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               description: HTTP-only cookie containing JWT token
 *       401:
 *         description: Authentication failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid username or password"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    console.log('Login attempt for user:', username);
    // Get user data - returns a single user object
    const user = await documentModel.getUser(username);

    // Check if user was found and has required fields
    if (!user || !user.password) {
      console.log('[FAILED LOGIN] User not found or invalid data:', username);
      return res.render('login', { error: 'Invalid credentials' });
    }

    // Compare passwords
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('Password validation result:', isValidPassword);

    if (isValidPassword) {
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );
      res.cookie('jwt', token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: JWT_COOKIE_MAX_AGE_MS,
      });

      return res.redirect('/dashboard');
    } else {
      return res.render('login', { error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'An error occurred during login' });
  }
});

// Logout route
/**
 * @swagger
 * /logout:
 *   get:
 *     summary: Log out user and clear JWT cookie
 *     description: |
 *       Terminates the current user session by invalidating and clearing the JWT authentication
 *       cookie. After logging out, the user is redirected to the login page.
 *
 *       This endpoint also clears any session-related data stored on the server side
 *       for the current user.
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       302:
 *         description: Logout successful, redirected to login page
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               description: HTTP-only cookie with cleared JWT token and immediate expiration
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/logout', (req, res) => {
  res.clearCookie('jwt');
  res.redirect('/login');
});

// Document routes (sampleData, playground, thumb) extracted to routes/documents.js
// Chat routes extracted to routes/chat.js

// History routes extracted to routes/history.js

// Reset document routes extracted to routes/documents.js

/**
 * @swagger
 * /api/scan/now:
 *   post:
 *     summary: Trigger immediate document scan
 *     description: |
 *       Initiates an immediate scan of documents in Paperless-ngx that haven't been processed yet.
 *       This endpoint can be used to manually trigger processing without waiting for the scheduled interval.
 *
 *       The scan will:
 *       - Connect to Paperless-ngx API
 *       - Fetch all unprocessed documents
 *       - Process each document with the configured AI service
 *       - Update documents in Paperless-ngx with generated metadata
 *
 *       The process respects the function limitations set in the configuration.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Scan initiated successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Task completed"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error during document scan"
 */
router.post('/api/scan/now', async (req, res) => {
  try {
    const isConfigured = await setupService.isConfigured();
    if (!isConfigured) {
      console.log(
        `Setup not completed. Visit http://your-machine-ip:${process.env.PAPERLESS_AI_PORT || 3000}/setup to complete setup.`
      );
      return;
    }

    const userId = await paperlessService.getOwnUserID();
    if (!userId) {
      console.error('Failed to get own user ID. Abort scanning.');
      return;
    }

    try {
      let [existingTags, documents, ownUserId, existingCorrespondentList, existingDocumentTypes] =
        await Promise.all([
          paperlessService.getTags(),
          paperlessService.getAllDocuments(),
          paperlessService.getOwnUserID(),
          paperlessService.listCorrespondentsNames(),
          paperlessService.listDocumentTypesNames(),
        ]);

      //get existing correspondent list
      existingCorrespondentList = existingCorrespondentList.map(
        (correspondent) => correspondent.name
      );

      //get existing document types list
      let existingDocumentTypesList = existingDocumentTypes.map((docType) => docType.name);

      // Extract tag names from tag objects
      const existingTagNames = existingTags.map((tag) => tag.name);

      for (const doc of documents) {
        try {
          const result = await processDocument(
            doc,
            existingTagNames,
            existingCorrespondentList,
            existingDocumentTypesList,
            ownUserId
          );
          if (!result) continue;

          const { analysis, originalData } = result;
          const updateData = await buildUpdateData(analysis, doc);
          await saveDocumentChanges(doc.id, updateData, analysis, originalData);
        } catch (error) {
          console.error(`[ERROR] processing document ${doc.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[ERROR]  during document scan:', error);
    } finally {
      console.log('[INFO] Task completed');
      res.send('Task completed');
    }
  } catch (error) {
    console.error('[ERROR] in startScanning:', error);
  }
});

async function processDocument(
  doc,
  existingTags,
  existingCorrespondentList,
  existingDocumentTypesList,
  ownUserId,
  customPrompt = null
) {
  const isProcessed = await documentModel.isDocumentProcessed(doc.id);
  if (isProcessed) return null;
  await documentModel.setProcessingStatus(doc.id, doc.title, 'processing');

  const documentEditable = await paperlessService.getPermissionOfDocument(doc.id);
  if (!documentEditable) {
    console.log(`[DEBUG] Document belongs to: ${documentEditable}, skipping analysis`);
    console.log(`[DEBUG] Document ${doc.id} Not Editable by Paper-Ai User, skipping analysis`);
    return null;
  } else {
    console.log(`[DEBUG] Document ${doc.id} rights for AI User - processed`);
  }

  let [content, originalData] = await Promise.all([
    paperlessService.getDocumentContent(doc.id),
    paperlessService.getDocument(doc.id),
  ]);

  if (!content || !content.length >= 10) {
    console.log(`[DEBUG] Document ${doc.id} has no content, skipping analysis`);
    return null;
  }

  if (content.length > 50000) {
    content = content.substring(0, 50000);
  }

  // Prepare options for AI service
  const options = {
    restrictToExistingTags: config.restrictToExistingTags === 'yes',
    restrictToExistingCorrespondents: config.restrictToExistingCorrespondents === 'yes',
  };

  // Get external API data if enabled
  if (config.externalApiConfig.enabled === 'yes') {
    try {
      const externalApiService = require('../services/externalApiService');
      const externalData = await externalApiService.fetchData();
      if (externalData) {
        options.externalApiData = externalData;
        console.log('[DEBUG] Retrieved external API data for prompt enrichment');
      }
    } catch (error) {
      console.error('[ERROR] Failed to fetch external API data:', error.message);
    }
  }

  const aiService = AIServiceFactory.getService();
  let analysis;
  if (customPrompt) {
    console.log('[DEBUG] Starting document analysis with custom prompt');
    analysis = await aiService.analyzeDocument(
      content,
      existingTags,
      existingCorrespondentList,
      existingDocumentTypesList,
      doc.id,
      customPrompt,
      options
    );
  } else {
    analysis = await aiService.analyzeDocument(
      content,
      existingTags,
      existingCorrespondentList,
      existingDocumentTypesList,
      doc.id,
      null,
      options
    );
  }
  console.log('Repsonse from AI service:', analysis);
  if (analysis.error) {
    throw new Error(`[ERROR] Document analysis failed: ${analysis.error}`);
  }
  await documentModel.setProcessingStatus(doc.id, doc.title, 'complete');
  return { analysis, originalData };
}

async function buildUpdateData(analysis, doc) {
  const updateData = {};

  // Create options object with restriction settings
  const options = {
    restrictToExistingTags: config.restrictToExistingTags === 'yes' ? true : false,
    restrictToExistingCorrespondents:
      config.restrictToExistingCorrespondents === 'yes' ? true : false,
  };

  console.log(
    `[DEBUG] Building update data with restrictions: tags=${options.restrictToExistingTags}, correspondents=${options.restrictToExistingCorrespondents}`
  );

  // Only process tags if tagging is activated
  if (config.limitFunctions?.activateTagging !== 'no') {
    const { tagIds, errors } = await paperlessService.processTags(analysis.document.tags, options);
    if (errors.length > 0) {
      console.warn('[ERROR] Some tags could not be processed:', errors);
    }
    updateData.tags = tagIds;
  } else if (
    config.limitFunctions?.activateTagging === 'no' &&
    config.addAIProcessedTag === 'yes'
  ) {
    // Add AI processed tags to the document (processTags function awaits a tags array)
    // get tags from .env file and split them by comma and make an array
    console.log('[DEBUG] Tagging is deactivated but AI processed tag will be added');
    const tags = config.addAIProcessedTags.split(',');
    const { tagIds, errors } = await paperlessService.processTags(tags, options);
    if (errors.length > 0) {
      console.warn('[ERROR] Some tags could not be processed:', errors);
    }
    updateData.tags = tagIds;
    console.log('[DEBUG] Tagging is deactivated');
  }

  // Only process title if title generation is activated
  if (config.limitFunctions?.activateTitle !== 'no') {
    updateData.title = analysis.document.title || doc.title;
  }

  // Add created date regardless of settings as it's a core field
  updateData.created = analysis.document.document_date || doc.created;

  // Only process document type if document type classification is activated
  if (config.limitFunctions?.activateDocumentType !== 'no' && analysis.document.document_type) {
    try {
      const documentType = await paperlessService.getOrCreateDocumentType(
        analysis.document.document_type
      );
      if (documentType) {
        updateData.document_type = documentType.id;
      }
    } catch (error) {
      console.error(`[ERROR] Error processing document type:`, error);
    }
  }

  // Only process custom fields if custom fields detection is activated
  if (config.limitFunctions?.activateCustomFields !== 'no' && analysis.document.custom_fields) {
    const customFields = analysis.document.custom_fields;
    const processedFields = [];

    // Get existing custom fields
    const existingFields = await paperlessService.getExistingCustomFields(doc.id);
    console.log(`[DEBUG] Found existing fields:`, existingFields);

    // Keep track of which fields we've processed to avoid duplicates
    const processedFieldIds = new Set();

    // First, add any new/updated fields
    for (const key in customFields) {
      const customField = customFields[key];

      if (!customField.field_name || !customField.value?.trim()) {
        console.log(`[DEBUG] Skipping empty/invalid custom field`);
        continue;
      }

      const fieldDetails = await paperlessService.findExistingCustomField(customField.field_name);
      if (fieldDetails?.id) {
        processedFields.push({
          field: fieldDetails.id,
          value: customField.value.trim(),
        });
        processedFieldIds.add(fieldDetails.id);
      }
    }

    // Then add any existing fields that weren't updated
    for (const existingField of existingFields) {
      if (!processedFieldIds.has(existingField.field)) {
        processedFields.push(existingField);
      }
    }

    if (processedFields.length > 0) {
      updateData.custom_fields = processedFields;
    }
  }

  // Only process correspondent if correspondent detection is activated
  if (config.limitFunctions?.activateCorrespondents !== 'no' && analysis.document.correspondent) {
    try {
      const correspondent = await paperlessService.getOrCreateCorrespondent(
        analysis.document.correspondent,
        options
      );
      if (correspondent) {
        updateData.correspondent = correspondent.id;
      }
    } catch (error) {
      console.error(`[ERROR] Error processing correspondent:`, error);
    }
  }

  // Always include language if provided as it's a core field
  if (analysis.document.language) {
    updateData.language = analysis.document.language;
  }

  return updateData;
}

async function saveDocumentChanges(docId, updateData, analysis, originalData) {
  const {
    tags: originalTags,
    correspondent: originalCorrespondent,
    title: originalTitle,
  } = originalData;

  await Promise.all([
    documentModel.saveOriginalData(docId, originalTags, originalCorrespondent, originalTitle),
    paperlessService.updateDocument(docId, updateData),
    documentModel.addProcessedDocument(docId, updateData.title),
    documentModel.addOpenAIMetrics(
      docId,
      analysis.metrics.promptTokens,
      analysis.metrics.completionTokens,
      analysis.metrics.totalTokens
    ),
    documentModel.addToHistory(
      docId,
      updateData.tags,
      updateData.title,
      analysis.document.correspondent
    ),
  ]);
}

// key-regenerate route extracted to routes/settings.js

const normalizeArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

/**
 * @swagger
 * /setup:
 *   get:
 *     summary: Application setup page
 *     description: |
 *       Renders the application setup page for initial configuration.
 *
 *       This page allows configuring the connection to Paperless-ngx, AI services,
 *       and other application settings. It loads existing configuration if available
 *       and redirects to dashboard if setup is already complete.
 *
 *       The setup page is the entry point for new installations and guides users through
 *       the process of connecting to Paperless-ngx, configuring AI providers, and setting up
 *       admin credentials.
 *     tags:
 *       - Navigation
 *       - Setup
 *       - System
 *     responses:
 *       200:
 *         description: Setup page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the application setup page
 *       302:
 *         description: Redirects to dashboard if setup is already complete
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/dashboard"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/setup', async (req, res) => {
  try {
    // Base configuration object - load this FIRST, before any checks
    let config = {
      PAPERLESS_API_URL: (process.env.PAPERLESS_API_URL || 'http://localhost:8000').replace(
        /\/api$/,
        ''
      ),
      PAPERLESS_API_TOKEN: process.env.PAPERLESS_API_TOKEN || '',
      PAPERLESS_USERNAME: process.env.PAPERLESS_USERNAME || '',
      AI_PROVIDER: process.env.AI_PROVIDER || 'openai',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      OLLAMA_API_URL: process.env.OLLAMA_API_URL || 'http://localhost:11434',
      OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3.2',
      SCAN_INTERVAL: process.env.SCAN_INTERVAL || '*/30 * * * *',
      SYSTEM_PROMPT: process.env.SYSTEM_PROMPT || '',
      PROCESS_PREDEFINED_DOCUMENTS: process.env.PROCESS_PREDEFINED_DOCUMENTS || 'no',
      TOKEN_LIMIT: process.env.TOKEN_LIMIT || 128000,
      RESPONSE_TOKENS: process.env.RESPONSE_TOKENS || 1000,
      TAGS: normalizeArray(process.env.TAGS),
      ADD_AI_PROCESSED_TAG: process.env.ADD_AI_PROCESSED_TAG || 'no',
      AI_PROCESSED_TAG_NAME: process.env.AI_PROCESSED_TAG_NAME || 'ai-processed',
      USE_PROMPT_TAGS: process.env.USE_PROMPT_TAGS || 'no',
      PROMPT_TAGS: normalizeArray(process.env.PROMPT_TAGS),
      PAPERLESS_AI_VERSION: configFile.PAPERLESS_AI_VERSION || ' ',
      PROCESS_ONLY_NEW_DOCUMENTS: process.env.PROCESS_ONLY_NEW_DOCUMENTS || 'yes',
      USE_EXISTING_DATA: process.env.USE_EXISTING_DATA || 'no',
      DISABLE_AUTOMATIC_PROCESSING: process.env.DISABLE_AUTOMATIC_PROCESSING || 'no',
      AZURE_ENDPOINT: process.env.AZURE_ENDPOINT || '',
      AZURE_API_KEY: process.env.AZURE_API_KEY || '',
      AZURE_DEPLOYMENT_NAME: process.env.AZURE_DEPLOYMENT_NAME || '',
      AZURE_API_VERSION: process.env.AZURE_API_VERSION || '',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    };

    // Check both configuration and users
    const [isEnvConfigured, users] = await Promise.all([
      setupService.isConfigured(),
      documentModel.getUsers(),
    ]);

    // Load saved config if it exists
    if (isEnvConfigured) {
      const savedConfig = await setupService.loadConfig();
      if (savedConfig.PAPERLESS_API_URL) {
        savedConfig.PAPERLESS_API_URL = savedConfig.PAPERLESS_API_URL.replace(/\/api$/, '');
      }

      savedConfig.TAGS = normalizeArray(savedConfig.TAGS);
      savedConfig.PROMPT_TAGS = normalizeArray(savedConfig.PROMPT_TAGS);

      config = { ...config, ...savedConfig };
    }

    // Debug output
    console.log('Current config TAGS:', config.TAGS);
    console.log('Current config PROMPT_TAGS:', config.PROMPT_TAGS);

    // Check if system is fully configured
    const hasUsers = Array.isArray(users) && users.length > 0;
    const isFullyConfigured = isEnvConfigured && hasUsers;

    // Generate appropriate success message
    let successMessage;
    if (isEnvConfigured && !hasUsers) {
      successMessage =
        'Environment is configured, but no users exist. Please create at least one user.';
    } else if (isEnvConfigured) {
      successMessage =
        'The application is already configured. You can update the configuration below.';
    }

    // If everything is configured and we have users, redirect to dashboard
    // BUT only after we've loaded all the config
    if (isFullyConfigured) {
      return res.redirect('/dashboard');
    }

    // Render setup page with config and appropriate message
    res.render('setup', {
      config,
      success: successMessage,
    });
  } catch (error) {
    console.error('Setup route error:', error);
    res.status(500).render('setup', {
      config: {},
      error: 'An error occurred while loading the setup page.',
    });
  }
});

// Manual routes extracted to routes/manual.js

// Dashboard API routes (correspondentsCount, tagsCount) extracted to routes/dashboard.js

const documentQueue = [];
let isProcessing = false;

function extractDocumentId(url) {
  const match = url.match(/\/documents\/(\d+)\//);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  throw new Error('Could not extract document ID from URL');
}

async function processQueue(customPrompt) {
  if (customPrompt) {
    console.log('Using custom prompt:', customPrompt);
  }

  if (isProcessing || documentQueue.length === 0) return;

  isProcessing = true;

  try {
    const isConfigured = await setupService.isConfigured();
    if (!isConfigured) {
      console.log(
        `Setup not completed. Visit http://your-machine-ip:${process.env.PAPERLESS_AI_PORT || 3000}/setup to complete setup.`
      );
      return;
    }

    const userId = await paperlessService.getOwnUserID();
    if (!userId) {
      console.error('Failed to get own user ID. Abort scanning.');
      return;
    }

    const [existingTags, existingCorrespondentList, existingDocumentTypes, ownUserId] =
      await Promise.all([
        paperlessService.getTags(),
        paperlessService.listCorrespondentsNames(),
        paperlessService.listDocumentTypesNames(),
        paperlessService.getOwnUserID(),
      ]);

    const existingDocumentTypesList = existingDocumentTypes.map((docType) => docType.name);

    while (documentQueue.length > 0) {
      const doc = documentQueue.shift();

      try {
        const result = await processDocument(
          doc,
          existingTags,
          existingCorrespondentList,
          existingDocumentTypesList,
          ownUserId,
          customPrompt
        );
        if (!result) continue;

        const { analysis, originalData } = result;
        const updateData = await buildUpdateData(analysis, doc);
        await saveDocumentChanges(doc.id, updateData, analysis, originalData);
      } catch (error) {
        console.error(`[ERROR] Failed to process document ${doc.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[ERROR] Error during queue processing:', error);
  } finally {
    isProcessing = false;

    if (documentQueue.length > 0) {
      processQueue();
    }
  }
}

/**
 * @swagger
 * /api/webhook/document:
 *   post:
 *     summary: Webhook for document updates
 *     description: |
 *       Processes incoming webhook notifications from Paperless-ngx about document
 *       changes, additions, or deletions. The webhook allows Paperless-AI to respond
 *       to document changes in real-time.
 *
 *       When a new document is added or updated in Paperless-ngx, this endpoint can
 *       trigger automatic AI processing for metadata extraction.
 *     tags:
 *       - Documents
 *       - API
 *       - System
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event_type
 *               - document_id
 *             properties:
 *               event_type:
 *                 type: string
 *                 description: Type of event that occurred
 *                 enum: ["added", "updated", "deleted"]
 *                 example: "added"
 *               document_id:
 *                 type: integer
 *                 description: ID of the affected document
 *                 example: 123
 *               document_info:
 *                 type: object
 *                 description: Additional information about the document (optional)
 *                 properties:
 *                   title:
 *                     type: string
 *                     example: "Invoice"
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document event processed"
 *                 processing_queued:
 *                   type: boolean
 *                   description: Whether AI processing was queued for this document
 *                   example: true
 *       400:
 *         description: Invalid webhook payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Missing required fields: event_type, document_id"
 *       401:
 *         description: Unauthorized - invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unauthorized: Invalid API key"
 *       500:
 *         description: Server error processing webhook
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/api/webhook/document', async (req, res) => {
  try {
    const { url, prompt } = req.body;
    if (!url) {
      return res.status(400).send('Missing document URL');
    }

    try {
      const documentId = extractDocumentId(url);
      const document = await paperlessService.getDocument(documentId);

      if (!document) {
        return res.status(404).send(`Document with ID ${documentId} not found`);
      }

      documentQueue.push(document);
      if (prompt) {
        console.log('[DEBUG] Using custom prompt:', prompt);
        await processQueue(prompt);
      } else {
        await processQueue();
      }

      res.status(202).send({
        message: 'Document accepted for processing',
        documentId: documentId,
        queuePosition: documentQueue.length,
      });
    } catch (error) {
      console.error('[ERROR] Failed to extract document ID or fetch document:', error);
      return res.status(200).send('Invalid document URL format');
    }
  } catch (error) {
    console.error('[ERROR] Error in webhook endpoint:', error);
    res.status(200).send('Internal server error');
  }
});

// Dashboard route extracted to routes/dashboard.js

// GET /settings route extracted to routes/settings.js

// Debug routes extracted to routes/debug.js

// Manual analyze/playground/updateDocument routes extracted to routes/manual.js

/**
 * @swagger
 * /health:
 *   get:
 *     summary: System health check endpoint
 *     description: |
 *       Provides information about the current system health status.
 *       This endpoint checks database connectivity and returns system operational status.
 *       Used for monitoring and automated health checks.
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: System is healthy and operational
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Health status of the system
 *                   example: "healthy"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Status indicating an error
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   description: Error message details
 *                   example: "Internal server error"
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Status indicating database error
 *                   example: "database_error"
 *                 message:
 *                   type: string
 *                   description: Details about the service unavailability
 *                   example: "Database check failed"
 */
router.get('/health', async (req, res) => {
  try {
    // const isConfigured = await setupService.isConfigured();
    // if (!isConfigured) {
    //   return res.status(503).json({
    //     status: 'not_configured',
    //     message: 'Application setup not completed'
    //   });
    // }
    try {
      await documentModel.isDocumentProcessed(1);
    } catch (_error) {
      return res.status(503).json({
        status: 'database_error',
        message: 'Database check failed',
      });
    }

    res.json({ status: 'healthy' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /setup:
 *   post:
 *     summary: Submit initial application setup configuration
 *     description: |
 *       Configures the initial setup of the Paperless-AI application, including connections
 *       to Paperless-ngx, AI provider settings, processing parameters, and user authentication.
 *
 *       This endpoint is primarily used during the first-time setup of the application and
 *       creates the necessary configuration files and database tables.
 *     tags:
 *       - System
 *       - Setup
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paperlessUrl
 *               - paperlessToken
 *               - aiProvider
 *               - username
 *               - password
 *             properties:
 *               paperlessUrl:
 *                 type: string
 *                 description: URL of the Paperless-ngx instance
 *                 example: "https://paperless.example.com"
 *               paperlessToken:
 *                 type: string
 *                 description: API token for Paperless-ngx access
 *                 example: "abc123def456"
 *               paperlessUsername:
 *                 type: string
 *                 description: Username for Paperless-ngx (alternative to token authentication)
 *                 example: "admin"
 *               aiProvider:
 *                 type: string
 *                 description: Selected AI provider for document analysis
 *                 enum: ["openai", "ollama", "custom", "azure", "gemini"]
 *                 example: "openai"
 *               openaiKey:
 *                 type: string
 *                 description: API key for OpenAI (required when aiProvider is 'openai')
 *                 example: "sk-abc123def456"
 *               openaiModel:
 *                 type: string
 *                 description: OpenAI model to use for analysis
 *                 example: "gpt-4"
 *               ollamaUrl:
 *                 type: string
 *                 description: URL for Ollama API (required when aiProvider is 'ollama')
 *                 example: "http://localhost:11434"
 *               ollamaModel:
 *                 type: string
 *                 description: Ollama model to use for analysis
 *                 example: "llama2"
 *               customApiKey:
 *                 type: string
 *                 description: API key for custom LLM provider
 *                 example: "api-key-123"
 *               customBaseUrl:
 *                 type: string
 *                 description: Base URL for custom LLM provider
 *                 example: "https://api.customllm.com"
 *               customModel:
 *                 type: string
 *                 description: Model name for custom LLM provider
 *                 example: "custom-model"
 *               scanInterval:
 *                 type: number
 *                 description: Interval in minutes for scanning new documents
 *                 example: 15
 *               systemPrompt:
 *                 type: string
 *                 description: Custom system prompt for document analysis
 *                 example: "Extract key information from the following document..."
 *               showTags:
 *                 type: boolean
 *                 description: Whether to show tags in the UI
 *                 example: true
 *               tags:
 *                 type: string
 *                 description: Comma-separated list of tags to use for filtering
 *                 example: "Invoice,Receipt,Contract"
 *               aiProcessedTag:
 *                 type: boolean
 *                 description: Whether to add a tag for AI-processed documents
 *                 example: true
 *               aiTagName:
 *                 type: string
 *                 description: Tag name to use for AI-processed documents
 *                 example: "AI-Processed"
 *               usePromptTags:
 *                 type: boolean
 *                 description: Whether to use tags in prompts
 *                 example: true
 *               promptTags:
 *                 type: string
 *                 description: Comma-separated list of tags to use in prompts
 *                 example: "Invoice,Receipt"
 *               username:
 *                 type: string
 *                 description: Admin username for Paperless-AI
 *                 example: "admin"
 *               password:
 *                 type: string
 *                 description: Admin password for Paperless-AI
 *                 example: "securepassword"
 *               useExistingData:
 *                 type: boolean
 *                 description: Whether to use existing data from a previous setup
 *                 example: false
 *               activateTagging:
 *                 type: boolean
 *                 description: Enable AI-based tag suggestions
 *                 example: true
 *               activateCorrespondents:
 *                 type: boolean
 *                 description: Enable AI-based correspondent suggestions
 *                 example: true
 *               activateDocumentType:
 *                 type: boolean
 *                 description: Enable AI-based document type suggestions
 *                 example: true
 *               activateTitle:
 *                 type: boolean
 *                 description: Enable AI-based title suggestions
 *                 example: true
 *               activateCustomFields:
 *                 type: boolean
 *                 description: Enable AI-based custom field extraction
 *                 example: false
 *     responses:
 *       200:
 *         description: Setup completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["success"]
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Configuration saved successfully"
 *       400:
 *         description: Invalid configuration parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["error"]
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Missing required configuration parameters"
 *       500:
 *         description: Server error during setup
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["error"]
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Failed to save configuration: Database error"
 */
router.post('/setup', express.json(), async (req, res) => {
  try {
    const {
      paperlessUrl,
      paperlessToken,
      paperlessUsername,
      aiProvider,
      openaiKey,
      openaiModel,
      ollamaUrl,
      ollamaModel,
      scanInterval,
      systemPrompt,
      showTags,
      tokenLimit,
      responseTokens,
      tags,
      aiProcessedTag,
      aiTagName,
      usePromptTags,
      promptTags,
      username,
      password,
      useExistingData,
      customApiKey,
      customBaseUrl,
      customModel,
      activateTagging,
      activateCorrespondents,
      activateDocumentType,
      activateTitle,
      activateCustomFields,
      customFields,
      disableAutomaticProcessing,
      azureEndpoint,
      azureApiKey,
      azureDeploymentName,
      azureApiVersion,
      geminiApiKey,
      geminiModel,
    } = req.body;

    // Log setup request with sensitive data redacted
    const sensitiveKeys = [
      'paperlessToken',
      'openaiKey',
      'customApiKey',
      'password',
      'confirmPassword',
      'geminiApiKey',
    ];
    const redactedBody = Object.fromEntries(
      Object.entries(req.body).map(([key, value]) => [
        key,
        sensitiveKeys.includes(key) ? '******' : value,
      ])
    );
    console.log('Setup request received:', redactedBody);

    // Initialize paperlessService with the new credentials
    const paperlessApiUrl = paperlessUrl + '/api';
    const initSuccess = await paperlessService.initializeWithCredentials(
      paperlessApiUrl,
      paperlessToken
    );

    if (!initSuccess) {
      return res.status(400).json({
        error: 'Failed to initialize connection to Paperless-ngx. Please check URL and Token.',
      });
    }

    // Validate Paperless credentials
    const isPaperlessValid = await setupService.validatePaperlessConfig(
      paperlessUrl,
      paperlessToken
    );
    if (!isPaperlessValid) {
      return res.status(400).json({
        error: 'Paperless-ngx connection failed. Please check URL and Token.',
      });
    }

    const isPermissionValid = await setupService.validateApiPermissions(
      paperlessUrl,
      paperlessToken
    );
    if (!isPermissionValid.success) {
      return res.status(400).json({
        error:
          'Paperless-ngx API permissions are insufficient. Error: ' + isPermissionValid.message,
      });
    }

    const normalizeArray = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string')
        return value
          .split(',')
          .filter(Boolean)
          .map((item) => item.trim());
      return [];
    };

    // Process custom fields if enabled
    let processedCustomFields = [];
    if (customFields && activateCustomFields) {
      try {
        const parsedFields =
          typeof customFields === 'string' ? JSON.parse(customFields) : customFields;

        for (const field of parsedFields.custom_fields) {
          try {
            const createdField = await paperlessService.createCustomFieldSafely(
              field.value,
              field.data_type,
              field.currency
            );

            if (createdField) {
              processedCustomFields.push({
                value: field.value,
                data_type: field.data_type,
                ...(field.currency && { currency: field.currency }),
              });
              console.log(`[SUCCESS] Created/found custom field: ${field.value}`);
            }
          } catch (fieldError) {
            console.error(`[WARNING] Error creating custom field ${field.value}:`, fieldError);
          }
        }
      } catch (error) {
        console.error('[ERROR] Error processing custom fields:', error);
      }
    }

    // Generate tokens if not provided in environment
    const apiToken = process.env.API_KEY || require('crypto').randomBytes(64).toString('hex');
    const jwtToken = process.env.JWT_SECRET || require('crypto').randomBytes(64).toString('hex');

    const processedPrompt = systemPrompt
      ? systemPrompt.replace(/\r\n/g, '\n').replace(/\n/g, '\\n').replace(/=/g, '')
      : '';

    // Prepare base config
    const config = {
      PAPERLESS_API_URL: paperlessApiUrl,
      PAPERLESS_API_TOKEN: paperlessToken,
      PAPERLESS_USERNAME: paperlessUsername,
      AI_PROVIDER: aiProvider,
      SCAN_INTERVAL: scanInterval || '*/30 * * * *',
      SYSTEM_PROMPT: processedPrompt,
      PROCESS_PREDEFINED_DOCUMENTS: showTags || 'no',
      TOKEN_LIMIT: tokenLimit || 128000,
      RESPONSE_TOKENS: responseTokens || 1000,
      TAGS: normalizeArray(tags),
      ADD_AI_PROCESSED_TAG: aiProcessedTag || 'no',
      AI_PROCESSED_TAG_NAME: aiTagName || 'ai-processed',
      USE_PROMPT_TAGS: usePromptTags || 'no',
      PROMPT_TAGS: normalizeArray(promptTags),
      USE_EXISTING_DATA: useExistingData || 'no',
      API_KEY: apiToken,
      JWT_SECRET: jwtToken,
      CUSTOM_API_KEY: customApiKey || '',
      CUSTOM_BASE_URL: customBaseUrl || '',
      CUSTOM_MODEL: customModel || '',
      PAPERLESS_AI_INITIAL_SETUP: 'yes',
      ACTIVATE_TAGGING: activateTagging ? 'yes' : 'no',
      ACTIVATE_CORRESPONDENTS: activateCorrespondents ? 'yes' : 'no',
      ACTIVATE_DOCUMENT_TYPE: activateDocumentType ? 'yes' : 'no',
      ACTIVATE_TITLE: activateTitle ? 'yes' : 'no',
      ACTIVATE_CUSTOM_FIELDS: activateCustomFields ? 'yes' : 'no',
      CUSTOM_FIELDS:
        processedCustomFields.length > 0
          ? JSON.stringify({ custom_fields: processedCustomFields })
          : '{"custom_fields":[]}',
      DISABLE_AUTOMATIC_PROCESSING: disableAutomaticProcessing ? 'yes' : 'no',
      AZURE_ENDPOINT: azureEndpoint || '',
      AZURE_API_KEY: azureApiKey || '',
      AZURE_DEPLOYMENT_NAME: azureDeploymentName || '',
      AZURE_API_VERSION: azureApiVersion || '',
      GEMINI_API_KEY: geminiApiKey || '',
      GEMINI_MODEL: geminiModel || 'gemini-2.0-flash',
    };

    // Validate AI provider config
    if (aiProvider === 'openai') {
      const isOpenAIValid = await setupService.validateOpenAIConfig(openaiKey);
      if (!isOpenAIValid) {
        return res.status(400).json({
          error: 'OpenAI API Key is not valid. Please check the key.',
        });
      }
      config.OPENAI_API_KEY = openaiKey;
      config.OPENAI_MODEL = openaiModel || 'gpt-4o-mini';
    } else if (aiProvider === 'ollama') {
      const isOllamaValid = await setupService.validateOllamaConfig(ollamaUrl, ollamaModel);
      if (!isOllamaValid) {
        return res.status(400).json({
          error: 'Ollama connection failed. Please check URL and Model.',
        });
      }
      config.OLLAMA_API_URL = ollamaUrl || 'http://localhost:11434';
      config.OLLAMA_MODEL = ollamaModel || 'llama3.2';
    } else if (aiProvider === 'custom') {
      const isCustomValid = await setupService.validateCustomConfig(
        customBaseUrl,
        customApiKey,
        customModel
      );
      if (!isCustomValid) {
        return res.status(400).json({
          error: 'Custom connection failed. Please check URL, API Key and Model.',
        });
      }
      config.CUSTOM_BASE_URL = customBaseUrl;
      config.CUSTOM_API_KEY = customApiKey;
      config.CUSTOM_MODEL = customModel;
    } else if (aiProvider === 'azure') {
      const isAzureValid = await setupService.validateAzureConfig(
        azureApiKey,
        azureEndpoint,
        azureDeploymentName,
        azureApiVersion
      );
      if (!isAzureValid) {
        return res.status(400).json({
          error:
            'Azure connection failed. Please check URL, API Key, Deployment Name and API Version.',
        });
      }
    } else if (aiProvider === 'gemini') {
      const isGeminiValid = await setupService.validateGeminiConfig(geminiApiKey, geminiModel);
      if (!isGeminiValid) {
        return res.status(400).json({
          error: 'Gemini connection failed. Please check API Key and Model.',
        });
      }
    }

    // Save configuration
    await setupService.saveConfig(config);
    const hashedPassword = await bcrypt.hash(password, 15);
    await documentModel.addUser(username, hashedPassword);

    res.json({
      success: true,
      message: 'Configuration saved successfully.',
      restart: true,
    });

    // Trigger application restart
    setTimeout(() => {
      process.exit(0);
    }, 5000);
  } catch (error) {
    console.error('[ERROR] Setup error:', error);
    res.status(500).json({
      error: 'An error occurred: ' + error.message,
    });
  }
});

// POST /settings route extracted to routes/settings.js

// processing-status and rag-test routes extracted to routes/documents.js
// dashboard/doc route extracted to routes/dashboard.js

module.exports = router;
