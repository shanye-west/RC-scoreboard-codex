import dotenv from 'dotenv';

dotenv.config();

export const debugConfig = {
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    filePath: process.env.LOG_FILE_PATH || 'logs',
    maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE || '5242880'), // 5MB
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5'),
  },

  // Performance thresholds
  performance: {
    slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD || '100'), // ms
    slowRequestThreshold: parseInt(process.env.SLOW_REQUEST_THRESHOLD || '1000'), // ms
    memoryWarningThreshold: parseInt(process.env.MEMORY_WARNING_THRESHOLD || '512'), // MB
  },

  // Database debugging
  database: {
    logQueries: process.env.DB_LOG_QUERIES === 'true',
    logSlowQueries: process.env.DB_LOG_SLOW_QUERIES === 'true',
    logErrors: process.env.DB_LOG_ERRORS === 'true',
  },

  // Request debugging
  request: {
    logHeaders: process.env.LOG_REQUEST_HEADERS === 'true',
    logBody: process.env.LOG_REQUEST_BODY === 'true',
    logQuery: process.env.LOG_REQUEST_QUERY === 'true',
  },

  // Environment
  environment: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
}; 