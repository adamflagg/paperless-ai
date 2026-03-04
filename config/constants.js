/**
 * Centralized constants to replace magic numbers scattered across the codebase.
 * Every value here corresponds to a hardcoded literal that previously appeared
 * inline in one or more source files.
 */
module.exports = {
  // ---------------------------------------------------------------------------
  // File-size limits
  // ---------------------------------------------------------------------------

  /** Maximum log file size before rotation/truncation (10 MB) */
  MAX_LOG_FILE_SIZE: 10 * 1024 * 1024,

  /** Body-parser payload limit for JSON and URL-encoded requests */
  MAX_JSON_PAYLOAD: '50mb',

  // ---------------------------------------------------------------------------
  // Token / AI limits
  // ---------------------------------------------------------------------------

  /** Default max-token cap for external-API-data validation & truncation */
  EXTERNAL_API_DATA_MAX_TOKENS: 500,

  /** max_tokens sent to Azure / Custom OpenAI for status-check calls */
  STATUS_CHECK_MAX_TOKENS: 10,

  /** max_tokens sent to Azure / Custom OpenAI for text-generation calls */
  GENERATE_TEXT_MAX_TOKENS: 1000,

  /** max_tokens sent to Custom OpenAI for generateText (large context) */
  CUSTOM_GENERATE_TEXT_MAX_TOKENS: 128000,

  // ---------------------------------------------------------------------------
  // Timeouts
  // ---------------------------------------------------------------------------

  /** Ollama HTTP client timeout (30 minutes) */
  OLLAMA_TIMEOUT_MS: 1800000,

  /** Manual-service / legacy Ollama HTTP client timeout (5 minutes) */
  MANUAL_SERVICE_TIMEOUT_MS: 300000,

  // ---------------------------------------------------------------------------
  // Setup validation (retry loop in setupService.isConfigured)
  // ---------------------------------------------------------------------------

  /** Maximum number of configuration-check attempts */
  SETUP_VALIDATION_MAX_RETRIES: 60,

  /** Delay between configuration-check attempts (5 seconds) */
  SETUP_VALIDATION_INTERVAL_MS: 5000,

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  /** JWT token expiration time */
  JWT_EXPIRY: '24h',

  /** Cookie maxAge matching JWT_EXPIRY (24 hours in ms) */
  JWT_COOKIE_MAX_AGE_MS: 24 * 60 * 60 * 1000,

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  /** Default page size used when querying the Paperless-ngx API */
  DEFAULT_PAGE_SIZE: 100,
};
