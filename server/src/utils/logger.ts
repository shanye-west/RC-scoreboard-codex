import winston from 'winston';
import { format } from 'winston';

const { combine, timestamp, printf, colorize, errors } = format;

// Custom format for detailed error logging
const errorFormat = format((info) => {
  if (info instanceof Error) {
    return {
      ...info,
      stack: info.stack,
      message: info.message,
    };
  }
  return info;
});

// Custom format for request logging
const requestFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += `\nMetadata: ${JSON.stringify(metadata, null, 2)}`;
  }
  
  return msg;
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    errors({ stack: true }),
    errorFormat(),
    colorize(),
    requestFormat()
  ),
  transports: [
    // Console transport for development
    new winston.transports.Console(),
    // File transport for production
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Request logging middleware
export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
  });
  
  next();
};

// Error logging middleware
export const errorLogger = (err: any, req: any, res: any, next: any) => {
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    body: req.body,
    params: req.params,
    query: req.query,
    user: req.user,
  });
  
  next(err);
};

// Database query logger
export const queryLogger = (query: string, params: any[], duration: number) => {
  logger.debug('Database query executed', {
    query,
    params,
    duration: `${duration}ms`,
  });
};

// Performance monitoring
export const performanceLogger = (operation: string, startTime: number) => {
  const duration = Date.now() - startTime;
  logger.debug('Performance metric', {
    operation,
    duration: `${duration}ms`,
  });
};

export default logger; 